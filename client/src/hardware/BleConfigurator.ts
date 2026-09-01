// GATT Service & Characteristic UUIDs from stackchan-idf (settings.html)
const SVC_UUID = "e3f0a000-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_SSID = "e3f0a001-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_PASS = "e3f0a002-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_KEY = "e3f0a003-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_APPLY = "e3f0a004-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_STATUS = "e3f0a005-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_KX = "e3f0a006-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_EN = "e3f0a007-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_PROVIDER = "e3f0a00b-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_GEMINI_KEY = "e3f0a00c-7b1c-4d2a-9e6f-2c5a8d4b1f00";
const CHR_OPERATION_MODE = "e3f0a025-7b1c-4d2a-9e6f-2c5a8d4b1f00";

export interface StackchanConfig {
  wifiSsid?: string;
  wifiPassword?: string;
  geminiApiKey?: string;
  systemPrompt?: string;
  voiceName?: string;
}

export interface BleProgressCallback {
  onStatus: (msg: string, type?: "info" | "ok" | "warn" | "err") => void;
  onLog?: (text: string) => void;
}

export class BleConfigurator {
  private device: any = null;
  private server: any = null;
  private service: any = null;
  private aesKey: CryptoKey | null = null;
  private chrs: Record<string, any> = {};

  public isSupported(): boolean {
    return "bluetooth" in navigator && !!crypto.subtle;
  }

  public async connect(callbacks: BleProgressCallback): Promise<boolean> {
    const log = (msg: string) => {
      if (callbacks.onLog) callbacks.onLog(msg);
      console.log("[BLE]", msg);
    };

    if (!this.isSupported()) {
      callbacks.onStatus(
        "Web Bluetooth is not supported in this browser (Use Chrome / Edge)",
        "err",
      );
      return false;
    }

    try {
      callbacks.onStatus("Scanning for Stack-chan via Bluetooth LE...", "info");
      log("Requesting Bluetooth device...");

      try {
        this.device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [SVC_UUID, "device_information"],
        });
      } catch (scanErr: any) {
        log(`acceptAllDevices failed, falling back to filters: ${scanErr.message}`);
        this.device = await (navigator as any).bluetooth.requestDevice({
          filters: [
            { services: [SVC_UUID] },
            { namePrefix: "stackchan" },
            { namePrefix: "Stack" },
            { namePrefix: "M5" },
          ],
          optionalServices: [SVC_UUID, "device_information"],
        });
      }

      log(`Device selected: ${this.device.name || "(Unnamed)"}`);
      callbacks.onStatus(`Connecting to ${this.device.name || "Stack-chan"}...`, "info");

      this.server = await this.device.gatt.connect();
      log("GATT server connected");

      this.service = await this.server.getPrimaryService(SVC_UUID);
      log("Primary service discovered (e3f0a000)");

      // Probe all characteristics independently
      const probes: Array<[string, string]> = [
        ["ssid", CHR_SSID],
        ["pass", CHR_PASS],
        ["key", CHR_KEY],
        ["apply", CHR_APPLY],
        ["status", CHR_STATUS],
        ["kx", CHR_KX],
        ["en", CHR_EN],
        ["provider", CHR_PROVIDER],
        ["geminiKey", CHR_GEMINI_KEY],
        ["operationMode", CHR_OPERATION_MODE],
      ];

      const settled = await Promise.allSettled(
        probes.map(([_, uuid]) => this.service.getCharacteristic(uuid)),
      );

      this.chrs = {};
      const foundNames: string[] = [];
      for (let i = 0; i < probes.length; i++) {
        const [name] = probes[i];
        if (settled[i].status === "fulfilled") {
          this.chrs[name] = (settled[i] as PromiseFulfilledResult<any>).value;
          foundNames.push(name);
        }
      }
      log(`Discovered characteristics: ${foundNames.join(", ")}`);

      if (!this.chrs.kx) {
        throw new Error("KeyExchange characteristic not found (incompatible firmware)");
      }

      callbacks.onStatus("Performing X25519 ECDH crypto handshake...", "info");
      log("Starting X25519 ECDH handshake...");
      await this.setupCryptoSession(log);
      log("✅ Handshake complete. AES-256-GCM session established.");

      callbacks.onStatus("✅ Connected and authenticated via BLE!", "ok");
      return true;
    } catch (err: any) {
      log(`❌ Connection error: ${err.message || err}`);
      callbacks.onStatus(`BLE connection failed: ${err.message || err}`, "err");
      this.disconnect();
      return false;
    }
  }

  // --- X25519 ECDH -> HKDF-SHA256 -> AES-256-GCM Handshake ---
  private async setupCryptoSession(log: (msg: string) => void): Promise<void> {
    const enc = new TextEncoder();
    const chrKx = this.chrs.kx;

    // 1. Read device's 32-byte ephemeral pubkey
    const devicePubRaw = new Uint8Array((await chrKx.readValue()).buffer);
    if (devicePubRaw.length !== 32) {
      throw new Error(`Device pubkey length ${devicePubRaw.length} != 32`);
    }
    log(`Received device public key: 32 bytes`);

    // 2. Generate our X25519 keypair
    const ourKp = await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]);
    const devicePub = await crypto.subtle.importKey(
      "raw",
      devicePubRaw,
      { name: "X25519" },
      false,
      [],
    );

    // 3. ECDH -> derive shared bits (32 bytes = 256 bits)
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "X25519", public: devicePub },
      ourKp.privateKey,
      256,
    );
    log("Derived 256-bit shared secret via ECDH");

    // 4. Import shared secret as HKDF input key material
    const ikm = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, [
      "deriveBits",
      "deriveKey",
    ]);

    // 5. Derive AES-256 key bits via HKDF-SHA256
    let rawAesKey: ArrayBuffer;
    try {
      rawAesKey = await crypto.subtle.deriveBits(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new Uint8Array(0),
          info: enc.encode("stackchan-config-v1"),
        },
        ikm,
        256,
      );
    } catch {
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new Uint8Array(0),
          info: enc.encode("stackchan-config-v1"),
        },
        ikm,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );
      rawAesKey = await crypto.subtle.exportKey("raw", derivedKey);
    }

    this.aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);

    // 6. Send our public key to commit the device side
    const ourPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ourKp.publicKey));
    await chrKx.writeValueWithResponse(ourPubRaw);
    log("Sent our public key (32 bytes) to KeyExchange chr");
  }

  // Encrypted write: [12B random IV][AES-GCM ciphertext + 16B tag]
  private async writeEncrypted(chr: any, plainBytes: Uint8Array): Promise<void> {
    if (!chr || !this.aesKey) throw new Error("BLE characteristic or crypto key unavailable");

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ctTag = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.aesKey, plainBytes),
    );

    const wire = new Uint8Array(iv.length + ctTag.length);
    wire.set(iv, 0);
    wire.set(ctTag, iv.length);
    await chr.writeValueWithResponse(wire);
  }

  public async applyConfig(
    config: StackchanConfig,
    callbacks: BleProgressCallback,
  ): Promise<boolean> {
    const log = (msg: string) => {
      if (callbacks.onLog) callbacks.onLog(msg);
      console.log("[BLE]", msg);
    };

    if (!this.service || !this.aesKey) {
      callbacks.onStatus("Device is not connected via BLE", "err");
      return false;
    }

    const enc = new TextEncoder();

    try {
      // 1. Write Wi-Fi SSID
      if (config.wifiSsid && this.chrs.ssid) {
        log(`Writing SSID: ${config.wifiSsid}...`);
        await this.writeEncrypted(this.chrs.ssid, enc.encode(config.wifiSsid));
        log("✅ SSID written");
      }

      // 2. Write Wi-Fi Password
      if (config.wifiPassword && this.chrs.pass) {
        log("Writing Wi-Fi Password...");
        await this.writeEncrypted(this.chrs.pass, enc.encode(config.wifiPassword));
        log("✅ Wi-Fi Password written");
      }

      // 3. Write Gemini API Key
      if (config.geminiApiKey) {
        log("Writing Gemini API Key...");
        if (this.chrs.geminiKey) {
          await this.writeEncrypted(this.chrs.geminiKey, enc.encode(config.geminiApiKey));
          log("✅ Gemini API Key written to chrGeminiKey");
        } else if (this.chrs.key) {
          await this.writeEncrypted(this.chrs.key, enc.encode(config.geminiApiKey));
          log("✅ Gemini API Key written to chrKey");
        }
      }

      // 4. Set Provider to Gemini Live (1)
      if (this.chrs.provider) {
        log("Setting provider to Gemini Live (1)...");
        await this.writeEncrypted(this.chrs.provider, new Uint8Array([1]));
        log("✅ Provider set to Gemini Live");
      }

      // 5. Enable Conversation Mode (CHR_EN = 1)
      if (this.chrs.en) {
        log("Enabling conversation mode (1)...");
        await this.writeEncrypted(this.chrs.en, new Uint8Array([1]));
        log("✅ Conversation mode enabled");
      }

      // 6. Set Operation Mode to Conversation (2)
      if (this.chrs.operationMode) {
        log("Setting operation mode to Conversation (2)...");
        await this.writeEncrypted(this.chrs.operationMode, new Uint8Array([2]));
        log("✅ Operation mode set to 2");
      }

      // 7. Trigger Apply (Save to NVS & Reboot Stack-chan)
      if (this.chrs.apply) {
        log("Sending encrypted Apply (0x01) to persist settings and reboot...");
        // CRITICAL: chrApply MUST be encrypted with writeEncrypted!
        await this.writeEncrypted(this.chrs.apply, new Uint8Array([0x01]));
        log("✅ Apply sent! Stack-chan is rebooting with Gemini Live...");
      } else {
        throw new Error("Apply characteristic not found");
      }

      callbacks.onStatus("🎉 Settings applied! Stack-chan is rebooting with Gemini Live...", "ok");
      this.disconnect();
      return true;
    } catch (err: any) {
      // Disconnection during/after Apply is normal as the device reboots
      if (err.message && err.message.toLowerCase().includes("disconnect")) {
        log("Device disconnected after Apply (Normal reboot).");
        callbacks.onStatus(
          "🎉 Settings applied! Stack-chan is rebooting with Gemini Live...",
          "ok",
        );
        this.disconnect();
        return true;
      }
      log(`❌ Apply failed: ${err.message || err}`);
      callbacks.onStatus(`Failed to apply config: ${err.message || err}`, "err");
      return false;
    }
  }

  public disconnect(): void {
    if (this.server && this.server.connected) {
      try {
        this.server.disconnect();
      } catch {
        // ignore
      }
    }
    this.device = null;
    this.server = null;
    this.service = null;
    this.aesKey = null;
    this.chrs = {};
  }
}
