type StreamingWindowEventName = "close" | "stop" | "minimize" | "restore";

type UnregisterStreamingHandler = () => void;

interface StreamingWindowEventSource {
  on: (
    event: StreamingWindowEventName,
    callback: () => void | Promise<void>,
  ) => UnregisterStreamingHandler;
}

export function useChatStreamingHandlers(context: {
  streamingWindow: StreamingWindowEventSource;
  onClose: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onMinimize: () => void | Promise<void>;
  onRestore: () => void | Promise<void>;
}) {
  let unregisterClose: UnregisterStreamingHandler | null = null;
  let unregisterStop: UnregisterStreamingHandler | null = null;
  let unregisterMinimize: UnregisterStreamingHandler | null = null;
  let unregisterRestore: UnregisterStreamingHandler | null = null;

  function unregisterStreamingHandlers() {
    unregisterClose?.();
    unregisterStop?.();
    unregisterMinimize?.();
    unregisterRestore?.();

    unregisterClose = null;
    unregisterStop = null;
    unregisterMinimize = null;
    unregisterRestore = null;
  }

  function registerStreamingHandlers() {
    unregisterStreamingHandlers();

    unregisterClose = context.streamingWindow.on("close", context.onClose);
    unregisterStop = context.streamingWindow.on("stop", context.onStop);
    unregisterMinimize = context.streamingWindow.on(
      "minimize",
      context.onMinimize,
    );
    unregisterRestore = context.streamingWindow.on("restore", context.onRestore);
  }

  return {
    registerStreamingHandlers,
    unregisterStreamingHandlers,
  };
}
