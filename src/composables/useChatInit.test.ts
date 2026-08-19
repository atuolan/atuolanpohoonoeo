/// <reference types="vitest/globals" />

import { useChatInit } from "@/composables/useChatInit";

describe("useChatInit", () => {
  it("waits for chat loading before arming the older-message observer", async () => {
    const events: string[] = [];
    let resolveLoad!: () => void;
    const loadPromise = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });

    const init = useChatInit({
      characterId: undefined,
      regexScriptsStore: { init: () => undefined },
      loadAudioSettings: () => undefined,
      registerStreamingHandlers: () => undefined,
      userStore: { isLoaded: true, loadUserData: async () => undefined },
      stickerStore: { initialized: true, init: async () => undefined },
      weatherStore: { hasWeatherData: true, refreshWeather: async () => undefined },
      messages: { value: [] } as any,
      currentChatId: { value: null } as any,
      isChatGenerating: () => false,
      getChatGenerationTask: () => undefined,
      loadOrCreateChat: async () => {
        events.push("load:start");
        await loadPromise;
        events.push("load:end");
      },
      markInitialChatLoadDone: () => events.push("loaded:marked"),
      startPendingCallChecker: () => undefined,
      notificationStore: { setActiveChatId: () => undefined },
      setupLoadMoreObserver: () => events.push("observer"),
      scrollToBottom: () => events.push("scroll"),
    });

    const initialize = init.initializeChatScreen();
    await Promise.resolve();
    expect(events).toEqual(["load:start"]);

    resolveLoad();
    await initialize;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([
      "load:start",
      "load:end",
      "loaded:marked",
      "observer",
      "scroll",
    ]);
  });
});
