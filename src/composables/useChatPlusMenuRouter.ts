import { ref, type Ref, type ComputedRef } from "vue";
import { usePhoneCallStore } from "@/stores/phoneCall";

/**
 * 加號選單路由 + 跳轉魔法 + 表情包面板
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatPlusMenuRouter(deps: {
  messages: Ref<any[]>;
  inputText: Ref<string>;
  currentChatId: Ref<string | null>;
  chatId: string;
  characterId: string;
  characterName: string;
  characterAvatar: string;
  isGroupChat: ComputedRef<boolean>;
  enablePhoneDecision: Ref<boolean>;
  lastMessage: ComputedRef<any>;
  showMoreFeatures: Ref<boolean>;
  showStickerPanel: Ref<boolean>;
  // mini features refs (from useChatMiniFeatures)
  locationInput: Ref<string>;
  showLocationModal: Ref<boolean>;
  showWeatherModal: Ref<boolean>;
  topicPromptInput: Ref<string>;
  showTopicPromptModal: Ref<boolean>;
  showGameScorePicker: Ref<boolean>;
  // other deps
  scrollToBottom: () => void;
  saveChat: () => void;
  openTheater: () => void;
  openChatFilesPanel: () => void;
  startGroupCall: () => void;
  emit: (e: string, ...args: any[]) => void;
}) {
  const phoneCallStore = usePhoneCallStore();

  // ===== 跳轉魔法 =====
  const showTimeTravelModal = ref(false);
  const timeTravelInput = ref("");

  function toggleMoreFeatures() {
    deps.showMoreFeatures.value = !deps.showMoreFeatures.value;
    if (deps.showMoreFeatures.value && deps.showStickerPanel.value) {
      deps.showStickerPanel.value = false;
    }
  }

  function handleFeatureClick(feature: string) {
    console.log("功能點擊:", feature);
    deps.showMoreFeatures.value = false;

    switch (feature) {
      case "phone":
        if (deps.isGroupChat.value) {
          deps.startGroupCall();
        } else {
          phoneCallStore.startCall({
            characterId: deps.characterId || "",
            characterName: deps.characterName || "角色",
            characterAvatar: deps.characterAvatar,
            chatId: deps.currentChatId.value || deps.chatId || undefined,
            lastMessageTime: deps.lastMessage.value?.timestamp,
            enablePhoneDecision: deps.enablePhoneDecision.value,
            isIncoming: false,
          });
        }
        break;
      case "video":
        if (!deps.isGroupChat.value) {
          phoneCallStore.startVideoCall(
            {
              characterId: deps.characterId || "",
              characterName: deps.characterName || "角色",
              characterAvatar: deps.characterAvatar,
              chatId: deps.currentChatId.value || deps.chatId || undefined,
              lastMessageTime: deps.lastMessage.value?.timestamp,
              enablePhoneDecision: deps.enablePhoneDecision.value,
              isIncoming: false,
            },
            {
              remoteImageUrl: deps.characterAvatar || "",
            },
          );
        }
        break;
      case "location":
        deps.locationInput.value = "";
        deps.showLocationModal.value = true;
        break;
      case "weather":
        deps.showWeatherModal.value = true;
        break;
      case "file":
        break;
      case "magic":
        timeTravelInput.value = "";
        showTimeTravelModal.value = true;
        break;
      case "small-theater":
        deps.openTheater();
        break;
      case "topic-prompt":
        deps.topicPromptInput.value = "";
        deps.showTopicPromptModal.value = true;
        break;
      case "game-score":
        deps.showGameScorePicker.value = true;
        break;
      case "chat-archive":
        deps.openChatFilesPanel();
        break;
      case "media-log":
        deps.emit("navigate", "media-log");
        break;
      default:
        console.log("未實現的功能:", feature);
    }
  }

  function toggleStickerPanel() {
    deps.showStickerPanel.value = !deps.showStickerPanel.value;
    if (deps.showStickerPanel.value && deps.showMoreFeatures.value) {
      deps.showMoreFeatures.value = false;
    }
  }

  function handleStickerSelect(value: string) {
    deps.inputText.value += value;
  }

  function confirmTimeTravel() {
    const destination = timeTravelInput.value.trim();
    if (!destination) return;

    const timeTravelMessage = {
      id: `msg_timetravel_${Date.now()}`,
      role: "system" as const,
      content: destination,
      timestamp: Date.now(),
      isTimetravel: true,
      timetravelContent: destination,
    };

    deps.messages.value.push(timeTravelMessage);
    deps.scrollToBottom();
    deps.saveChat();
    showTimeTravelModal.value = false;
    timeTravelInput.value = "";
  }

  function cancelTimeTravel() {
    showTimeTravelModal.value = false;
    timeTravelInput.value = "";
  }

  return {
    showTimeTravelModal,
    timeTravelInput,
    toggleMoreFeatures,
    handleFeatureClick,
    toggleStickerPanel,
    handleStickerSelect,
    confirmTimeTravel,
    cancelTimeTravel,
  };
}
