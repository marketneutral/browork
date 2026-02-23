// Type stubs for the Pi coding agent SDK.
// These will be replaced by actual types once @mariozechner/pi-coding-agent is installed.

declare module "@mariozechner/pi-coding-agent" {
  export interface CreateAgentSessionOptions {
    cwd?: string;
    model?: any;
    thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
    extensions?: string[];
    customTools?: any[];
  }

  export interface AgentSession {
    prompt(text: string): Promise<void>;
    steer(text: string): Promise<void>;
    abort(): Promise<void>;
    waitForIdle(): Promise<void>;
    dispose(): void;
    subscribe(
      listener: (event: AgentSessionEvent) => void,
    ): () => void;
    setThinkingLevel(level: string): Promise<void>;
  }

  export interface AgentSessionEvent {
    type: string;
    [key: string]: any;
  }

  export interface CreateAgentSessionResult {
    session: AgentSession;
    extensionsResult: any;
    modelFallbackMessage?: string;
  }

  export function createAgentSession(
    options?: CreateAgentSessionOptions,
  ): Promise<CreateAgentSessionResult>;
}

declare module "@mariozechner/pi-ai" {
  export function getModel(provider: string, modelId: string): any;
  export function getModels(provider: string): any[];
}
