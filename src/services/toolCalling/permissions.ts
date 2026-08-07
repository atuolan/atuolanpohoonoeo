import type { CharacterToolPermissions } from "@/types/character";
import type { ChatToolDefinition } from "./types";
import type { ToolRegistry } from "./toolRegistry";

export function isToolAllowed(
  tool: ChatToolDefinition,
  globalEnabled: boolean,
  permissions?: CharacterToolPermissions | null,
): boolean {
  if (!globalEnabled) return false;
  if (permissions && !permissions.enabled) return false;
  if (permissions?.tools && Object.prototype.hasOwnProperty.call(permissions.tools, tool.name)) {
    return permissions.tools[tool.name];
  }
  if (permissions?.categories && Object.prototype.hasOwnProperty.call(permissions.categories, tool.category)) {
    return permissions.categories[tool.category];
  }
  return tool.enabled ?? true;
}

export function filterToolsForCharacter(
  registry: ToolRegistry,
  globalEnabled: boolean,
  permissions?: CharacterToolPermissions | null,
): ChatToolDefinition[] {
  return registry.list().filter((tool) => isToolAllowed(tool, globalEnabled, permissions));
}
