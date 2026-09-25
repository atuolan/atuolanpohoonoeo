import { describe, expect, it } from "vitest";
import { nextTick, reactive, ref } from "vue";
import type { ChatAppearance } from "@/types/chat";
import { useChatAppearance } from "@/composables/useChatAppearance";

function createFakeContainer() {
  const props = new Map<string, string>();
  const style = {
    setProperty: (key: string, value: string) => props.set(key, value),
    removeProperty: (key: string) => props.delete(key),
  };
  return { el: { style } as unknown as HTMLElement, props };
}

const appearance: ChatAppearance = {
  useCustom: true,
  bubble: {
    userBgColor: "#ff85a2",
    userBgGradient: "",
    userTextColor: "#ffffff",
    userTextGradient: "linear-gradient(90deg, #ffffff, #eeeeee)",
    aiBgColor: "#ffffff",
    aiTextColor: "#4a4a6a",
    aiContentColor: "#4a4a6a",
    borderRadius: 18,
    maxWidth: 75,
    showAvatar: true,
  },
};

function setup(nightMode = false) {
  const { el, props } = createFakeContainer();
  const settingsStore = reactive({ nightMode });
  const themeStore = reactive({ wallpaperStyle: { type: "color", value: "#fff" } });
  const api = useChatAppearance({
    chatScreenRef: ref(el),
    settingsStore,
    themeStore,
    chatStore: { updateAppearance: () => {}, setAppearanceCache: () => {} },
    saveChat: () => {},
  });
  return { api, props, settingsStore };
}

describe("useChatAppearance", () => {
  it("關閉專屬外觀後清掉文字漸層與 fill", () => {
    const { api, props } = setup();
    api.applyChatAppearance(appearance);
    expect(props.get("--bubble-user-text-fill")).toBe("transparent");

    api.applyChatAppearance({ ...appearance, useCustom: false });
    expect(props.size).toBe(0);
  });

  it("白天切到夜間時，夜間氣泡文字色取代白天的 fill", async () => {
    const { api, props, settingsStore } = setup();
    api.chatAppearance.value = appearance;
    api.applyChatAppearance(appearance);
    expect(props.get("--bubble-ai-content-fill")).toBe("#4a4a6a");

    settingsStore.nightMode = true;
    await nextTick();
    await nextTick();
    expect(props.get("--bubble-ai-content-fill")).toBe("#d8d8e8");
    expect(props.get("--bubble-user-text-gradient")).toBe("none");

    settingsStore.nightMode = false;
    await nextTick();
    await nextTick();
    expect(props.get("--bubble-ai-content-fill")).toBe("#4a4a6a");
    expect(props.get("--bubble-user-text-fill")).toBe("transparent");
  });
});
