export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

export interface ToolDefinition {
  functionDeclarations: FunctionDeclaration[];
}

export type ToolHandler = (args: Record<string, any>) => Promise<Record<string, any>>;

export class ToolRegistry {
  private tools: Map<string, { declaration: FunctionDeclaration; handler: ToolHandler }> = new Map();

  public registerTool(declaration: FunctionDeclaration, handler: ToolHandler): void {
    this.tools.set(declaration.name, { declaration, handler });
  }

  public getToolDefinitions(): ToolDefinition[] {
    if (this.tools.size === 0) return [];
    return [
      {
        functionDeclarations: Array.from(this.tools.values()).map((t) => t.declaration),
      },
    ];
  }

  public async executeTool(name: string, args: Record<string, any>): Promise<Record<string, any>> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found in ToolRegistry.`);
    }
    return await tool.handler(args);
  }
}
