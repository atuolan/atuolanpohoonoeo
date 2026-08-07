import type { JsonSchema } from "./jsonSchema";
import type { ChatToolDefinition } from "./types";

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export class ToolRegistry {
  private readonly tools = new Map<string, ChatToolDefinition>();

  constructor(definitions: ChatToolDefinition[] = []) {
    definitions.forEach((definition) => this.register(definition));
  }

  register(tool: ChatToolDefinition): this {
    if (!TOOL_NAME.test(tool.name)) {
      throw new Error(`Invalid tool name: ${tool.name}`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): ChatToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ChatToolDefinition[] {
    return [...this.tools.values()];
  }

  toOpenAITools(): OpenAIToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}
