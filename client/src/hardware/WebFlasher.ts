import { ESPLoader, Transport } from "esptool-js";

export interface FlashProgressCallback {
  onStatus: (msg: string, type?: "info" | "ok" | "warn" | "err") => void;
  onProgress: (percent: number) => void;
  onLog: (text: string) => void;
  onChipInfo?: (info: string) => void;
}

const DEFAULT_FLASH_PARTS = [
  { name: "bootloader.bin", address: 0x0, source: "zip" },
  { name: "partition-table.bin", address: 0x8000, source: "zip" },
  { name: "ota_data_initial.bin", address: 0xd000, source: "ota_initial" },
  { name: "stackchan_idf.bin", address: 0x10000, source: "zip" },
];

export class WebFlasher {
  private transport: any = null;
  private loader: any = null;
  private port: any = null;
  private isConnected: boolean = false;
  private isFlashing: boolean = false;

  // Serial Monitor State
  private monitorReader: any = null;
  private isMonitoring: boolean = false;
  private monitorAbort: AbortController | null = null;

  public isSupported(): boolean {
    return "serial" in navigator;
  }

  public async connect(
    baudRate: number = 460800,
    callbacks: FlashProgressCallback,
  ): Promise<boolean> {
    if (!this.isSupported()) {
      callbacks.onStatus("WebSerial is not supported in this browser (Use Chrome / Edge)", "err");
      return false;
    }

    try {
      if (this.isMonitoring) {
        await this.stopMonitor();
      }

      callbacks.onStatus("Requesting Serial Port... Please select your M5Stack device.", "info");
      this.port = await (navigator as any).serial.requestPort();
      this.transport = new Transport(this.port, false);

      const terminal = {
        clean: () => {},
        writeLine: (s: string) => callbacks.onLog(s),
        write: (s: string) => callbacks.onLog(s),
      };

      this.loader = new ESPLoader({
        transport: this.transport,
        baudrate: baudRate,
        romBaudrate: 115200,
        terminal: terminal,
        debugLogging: false,
      });

      callbacks.onStatus("Connecting to ROM bootloader...", "info");
      const chip = await this.loader.main();
      const chipInfo = `${chip} (Baud: ${baudRate})`;
      callbacks.onStatus(`Connected to chip: ${chipInfo}`, "ok");
      if (callbacks.onChipInfo) {
        callbacks.onChipInfo(chipInfo);
      }
      this.isConnected = true;
      return true;
    } catch (err: any) {
      callbacks.onStatus(`Connection failed: ${err.message || err}`, "err");
      await this.disconnect();
      return false;
    }
  }

  private async extractZip(buffer: ArrayBuffer): Promise<Map<string, ArrayBuffer>> {
    const dv = new DataView(buffer);
    const view = new Uint8Array(buffer);
    const len = buffer.byteLength;

    let eocd = -1;
    const minOffset = Math.max(0, len - (0xffff + 22));
    for (let i = len - 22; i >= minOffset; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("ZIP: EOCD not found");

    const totalEntries = dv.getUint16(eocd + 10, true);
    const cdOffset = dv.getUint32(eocd + 16, true);

    const decoder = new TextDecoder("utf-8");
    const entries = new Map<string, ArrayBuffer>();
    let p = cdOffset;

    for (let i = 0; i < totalEntries; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP: bad central dir entry");
      const compMethod = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = decoder.decode(view.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;

      if (name.endsWith("/")) continue;
      if (dv.getUint32(localOff, true) !== 0x04034b50) throw new Error("ZIP: bad local header");
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const compData = view.subarray(dataStart, dataStart + compSize);

      let outBuf: ArrayBuffer;
      if (compMethod === 0) {
        outBuf = compData.slice().buffer;
      } else if (compMethod === 8) {
        const stream = new Blob([compData])
          .stream()
          .pipeThrough(new (window as any).DecompressionStream("deflate-raw"));
        outBuf = await new Response(stream).arrayBuffer();
      } else {
        throw new Error(`ZIP: unsupported compression method ${compMethod} for ${name}`);
      }
      const baseName = name.split("/").pop() || name;
      entries.set(baseName, outBuf);
    }
    return entries;
  }

  private createOtaDataInitial(): Uint8Array {
    const arr = new Uint8Array(8192);
    arr.fill(0xff);
    return arr;
  }

  public async flashReleaseZip(
    zipUrl: string,
    eraseFlash: boolean,
    callbacks: FlashProgressCallback,
  ): Promise<boolean> {
    if (!this.isConnected || !this.loader) {
      callbacks.onStatus("Device is not connected", "err");
      return false;
    }

    this.isFlashing = true;
    try {
      callbacks.onStatus(`Downloading firmware from ${zipUrl}...`, "info");
      const r = await fetch(zipUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}: Failed to download firmware`);
      const zipBuf = await r.arrayBuffer();

      callbacks.onStatus(
        `Extracting firmware archive (${Math.round(zipBuf.byteLength / 1024)} KB)...`,
        "info",
      );
      const entries = await this.extractZip(zipBuf);
      callbacks.onStatus(`Extracted: ${[...entries.keys()].join(", ")}`, "info");

      const fileArray: Array<{ data: Uint8Array; address: number }> = [];

      const entryKeys = [...entries.keys()];
      const fullFlashEntry = entryKeys.find(
        (k) =>
          k.includes("factory") ||
          k.includes("16m") ||
          (entryKeys.length === 1 && k.endsWith(".bin")),
      );

      if (fullFlashEntry && !entries.has("bootloader.bin")) {
        callbacks.onStatus(`Detected full image (${fullFlashEntry}) @ 0x0...`, "info");
        const fullBuf = entries.get(fullFlashEntry)!;
        fileArray.push({
          data: new Uint8Array(fullBuf),
          address: 0x0,
        });
      } else {
        for (const part of DEFAULT_FLASH_PARTS) {
          let uint8: Uint8Array;
          if (part.source === "ota_initial") {
            uint8 = this.createOtaDataInitial();
          } else {
            const buf = entries.get(part.name);
            if (!buf) throw new Error(`Partition ${part.name} not found in ZIP`);
            uint8 = new Uint8Array(buf);
          }

          fileArray.push({
            data: uint8,
            address: part.address,
          });
        }
      }

      const totalSize = fileArray.reduce((s, f) => s + f.data.length, 0);
      let curIdx = -1;
      let curBase = 0;
      let prevDone = 0;

      callbacks.onStatus(
        eraseFlash ? "Erasing flash and writing..." : "Writing flash... Please do not disconnect.",
        "info",
      );

      await this.loader.writeFlash({
        fileArray,
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: eraseFlash,
        compress: true,
        reportProgress: (fileIndex: number, written: number, total: number) => {
          if (fileIndex !== curIdx) {
            curBase = prevDone;
            curIdx = fileIndex;
          }
          const done = curBase + written;
          prevDone = curBase + total;
          const pct = Math.min(100, Math.round((done / totalSize) * 100));
          callbacks.onProgress(pct);
        },
      });

      callbacks.onStatus("Flash complete! Resetting device...", "info");

      // CoreS3 USB-JTAG reset
      try {
        await this.loader.after("hard_reset", true);
      } catch {
        try {
          await this.loader.after();
        } catch {
          // ignore
        }
      }

      // Disconnect transport to release WebSerial USB lock
      if (this.transport) {
        try {
          await this.transport.disconnect();
        } catch {
          // ignore
        }
        this.transport = null;
      }
      this.loader = null;
      this.isConnected = false;
      this.isFlashing = false;

      callbacks.onProgress(100);
      callbacks.onStatus("🎉 Done — Device reset & USB port released!", "ok");
      return true;
    } catch (err: any) {
      callbacks.onStatus(`❌ Flashing failed: ${err.message || err}`, "err");
      this.isFlashing = false;
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.disconnect();
      } catch {
        // ignore
      }
      this.transport = null;
    }
    this.loader = null;
    this.isConnected = false;
    this.isFlashing = false;
  }

  // --- Serial Monitor ---
  public async startMonitor(
    baudRate: number = 115200,
    onData: (text: string) => void,
    onError: (err: string) => void,
  ): Promise<boolean> {
    if (!this.isSupported()) {
      onError("WebSerial is not supported");
      return false;
    }

    try {
      if (this.isMonitoring) {
        await this.stopMonitor();
      }

      if (!this.port) {
        const ports = await (navigator as any).serial.getPorts();
        if (ports && ports.length === 1) {
          this.port = ports[0];
        } else {
          this.port = await (navigator as any).serial.requestPort();
        }
      }

      await this.port.open({ baudRate, bufferSize: 4096 });
      this.isMonitoring = true;
      this.monitorAbort = new AbortController();

      this.readMonitorPump(this.monitorAbort.signal, onData, onError);
      return true;
    } catch (err: any) {
      onError(`Failed to open serial monitor: ${err.message || err}`);
      await this.stopMonitor();
      return false;
    }
  }

  private async readMonitorPump(
    signal: AbortSignal,
    onData: (text: string) => void,
    onError: (err: string) => void,
  ) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    while (!signal.aborted && this.port && this.port.readable) {
      const reader = this.port.readable.getReader();
      this.monitorReader = reader;
      try {
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.byteLength) {
            onData(decoder.decode(value, { stream: true }));
          }
        }
      } catch (err: any) {
        if (!signal.aborted) {
          onError(`Serial read error: ${err.message || err}`);
        }
        break;
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
        this.monitorReader = null;
      }
    }
  }

  public async stopMonitor(): Promise<void> {
    this.isMonitoring = false;
    if (this.monitorAbort) {
      this.monitorAbort.abort();
      this.monitorAbort = null;
    }
    if (this.monitorReader) {
      try {
        await this.monitorReader.cancel();
      } catch {
        // ignore
      }
      this.monitorReader = null;
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch {
        // ignore
      }
    }
  }
}
