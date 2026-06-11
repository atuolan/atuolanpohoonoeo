import { computed, type ComputedRef, type Ref } from "vue";
import type { OpenAICompatibleClient, APIMessage } from "@/api/OpenAICompatible";
import type {
  ChatSettings,
  GenerationDiagnostics,
  StreamingEvent,
} from "@/types/chat";
import type { APISettings } from "@/types/settings";
import { useAIGenerationStore } from "@/stores";

export interface ChatGenerationStartMeta {
  characterName?: string;
  characterAvatar?: string;
  isRemote?: boolean;
  remoteTaskId?: string;
  lastMessageHash?: string;
  recoveryLocked?: boolean;
}

export interface ChatTriggerAIResponseOptions {
  skipAutoTrigger?: boolean;
  holidayTriggerPrompt?: string;
  postCallPrompt?: string;
  audioApiMessage?: { role: string; content: any };
  theaterNudge?: boolean;
  theaterPhoneScript?: boolean;
  bypassBlockCheck?: boolean;
}

export type ChatGenerationTokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export interface ChatGenerationRequestRunnerContext {
  client: Pick<OpenAICompatibleClient, "generate" | "generateStream">;
  messages: APIMessage[];
  settings: ChatSettings;
  apiSettings: APISettings;
  signal: AbortSignal;
  streaming: boolean;
  initialDiagnostics: GenerationDiagnostics;
  onContentUpdate?: (content: string) => void;
  onToken?: (token: string, fullContent: string) => void;
}

export interface ChatGenerationRequestRunnerResult {
  content: string;
  tokenUsage?: ChatGenerationTokenUsage;
  diagnostics: GenerationDiagnostics;
}

function normalizeGenerationError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error !== undefined) return String(error);
  return "生成過程中發生錯誤";
}

export async function runChatGenerationRequest(
  context: ChatGenerationRequestRunnerContext,
): Promise<ChatGenerationRequestRunnerResult> {
  let fullContent = "";
  let tokenUsage: ChatGenerationTokenUsage | undefined;
  let diagnostics = { ...context.initialDiagnostics };

  if (context.streaming) {
    const streamGenerator = context.client.generateStream({
      messages: context.messages,
      settings: context.settings,
      apiSettings: context.apiSettings,
      signal: context.signal,
      adjustLastMessageRole: true,
    });

    for await (const event of streamGenerator) {
      if (!event) continue;
      if (event.type === "token" && event.token) {
        fullContent += event.token;
        context.onContentUpdate?.(fullContent);
        context.onToken?.(event.token, fullContent);
      } else if (event.type === "done") {
        if (event.content) {
          fullContent = event.content;
        }
        const doneEvent = event as StreamingEvent;
        if (doneEvent.usage) tokenUsage = doneEvent.usage;
        if (doneEvent.diagnostics) {
          diagnostics = { ...diagnostics, ...doneEvent.diagnostics };
        }
        if (doneEvent.rawFinishReason !== undefined) {
          diagnostics.rawFinishReason = doneEvent.rawFinishReason;
        }
        if (doneEvent.finishReason !== undefined) {
          diagnostics.finishReason = doneEvent.finishReason;
        }
      } else if (event.type === "error") {
        throw new Error(normalizeGenerationError(event.error));
      }
    }
  } else {
    const result = await context.client.generate({
      messages: context.messages,
      settings: context.settings,
      apiSettings: context.apiSettings,
      signal: context.signal,
      adjustLastMessageRole: true,
    });
    fullContent = result.content;
    if (result.tokenCount) {
      tokenUsage = {
        prompt_tokens: result.tokenCount.prompt,
        completion_tokens: result.tokenCount.completion,
        total_tokens: result.tokenCount.total,
      };
    }
    if (result.diagnostics) diagnostics = { ...diagnostics, ...result.diagnostics };
    if (result.rawFinishReason !== undefined) diagnostics.rawFinishReason = result.rawFinishReason;
    if (result.finishReason !== undefined) diagnostics.finishReason = result.finishReason;
  }

  return {
    content: fullContent,
    tokenUsage,
    diagnostics,
  };
}

export function useChatGeneration(context: {
  currentChatId: Ref<string | null | undefined>;
}) {
  const aiGenerationStore = useAIGenerationStore();

  const isGenerating: ComputedRef<boolean> = computed(() => {
    if (!context.currentChatId.value) return false;
    return aiGenerationStore.isTaskGenerating(context.currentChatId.value, "chat");
  });

  function startChatGeneration(meta?: ChatGenerationStartMeta) {
    if (!context.currentChatId.value) {
      return { success: false as const, error: "尚未載入聊天" };
    }
    return aiGenerationStore.startGeneration(context.currentChatId.value, "chat", meta);
  }

  function updateChatGenerationContent(content: string): void {
    if (!context.currentChatId.value) return;
    aiGenerationStore.updateContent(context.currentChatId.value, content, "chat");
  }

  function completeChatGeneration(finalContent?: string): void {
    if (!context.currentChatId.value) return;
    aiGenerationStore.completeGeneration(context.currentChatId.value, "chat", finalContent);
  }

  function setChatGenerationError(error: string): void {
    if (!context.currentChatId.value) return;
    aiGenerationStore.setError(context.currentChatId.value, error, "chat");
  }

  function stopChatGeneration(): void {
    if (!context.currentChatId.value) return;
    aiGenerationStore.abortGeneration(context.currentChatId.value, "chat");
  }

  function isChatGenerating(): boolean {
    if (!context.currentChatId.value) return false;
    return aiGenerationStore.isTaskGenerating(context.currentChatId.value, "chat");
  }

  function getChatGenerationTask() {
    if (!context.currentChatId.value) return undefined;
    return aiGenerationStore.getTask(context.currentChatId.value, "chat");
  }

  function markRemoteChatGenerationTask(
    remoteTaskId: string,
    lastMessageHash?: string,
  ): void {
    if (!context.currentChatId.value) return;
    aiGenerationStore.markRemoteTask(
      context.currentChatId.value,
      remoteTaskId,
      "chat",
      lastMessageHash,
    );
  }

  function setChatGenerationRecoveryLocked(locked: boolean): void {
    if (!context.currentChatId.value) return;
    aiGenerationStore.setRecoveryLocked(context.currentChatId.value, locked, "chat");
  }

  function isChatGenerationRecoveryLocked(): boolean {
    if (!context.currentChatId.value) return false;
    return aiGenerationStore.isRecoveryLocked(context.currentChatId.value);
  }

  return {
    isGenerating,
    startChatGeneration,
    updateChatGenerationContent,
    completeChatGeneration,
    setChatGenerationError,
    stopChatGeneration,
    isChatGenerating,
    getChatGenerationTask,
    markRemoteChatGenerationTask,
    setChatGenerationRecoveryLocked,
    isChatGenerationRecoveryLocked,
  };
}
