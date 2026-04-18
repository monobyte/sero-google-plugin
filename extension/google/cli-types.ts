import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

export interface GoogleCliContentBlock {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface GoogleCliResult {
  output: string;
  exitCode: number;
  content?: GoogleCliContentBlock[];
  details?: unknown;
}

export interface GoogleCliWorkspaceManager {
  isContainerEnabled(workspaceId: string): Promise<boolean>;
}

export interface GoogleCliContainerManager {
  hasContainer(workspaceId: string): boolean;
  exec(
    workspaceId: string,
    command: string,
    cwd?: string,
    timeoutMs?: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export type GoogleCliAccessMode = 'agent' | 'operator';

export interface GoogleCliExecutionOptions {
  access?: GoogleCliAccessMode;
}

export interface GoogleCliContext {
  workspaceId: string;
  workspaceManager: GoogleCliWorkspaceManager;
  containerManager: GoogleCliContainerManager;
  access?: GoogleCliAccessMode;
}

export interface GoogleCliBridgeDefinition {
  summary?: string;
  help?: string;
  group?: string;
  overrideBuiltin?: boolean;
  execute: (
    args: string[],
    context: GoogleCliContext,
    onUpdate?: (update: { content: GoogleCliContentBlock[]; details?: unknown }) => void,
  ) => Promise<GoogleCliResult>;
}

export type GoogleCliToolDefinition = ToolDefinition & {
  cli: GoogleCliBridgeDefinition;
};
