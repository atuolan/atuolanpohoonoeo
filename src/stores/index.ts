// Pinia stores 統一導出
export { useCanvasStore } from "./canvas";
export { themePresets, useThemeStore } from "./theme";
export type {
    AvatarStyle,
    BubbleStyle,
    ThemeColors,
    ThemeStyle,
    WallpaperStyle
} from "./theme";

// 新增：角色、世界書、聊天 stores
export { useCharactersStore } from "./characters";
export { useChatStore } from "./chat";
export { useLorebooksStore } from "./lorebooks";

// 設定 store
export { AUXILIARY_TASKS, useSettingsStore } from "./settings";
export type {
    APIProfile,
    AuxiliaryAPIConfig,
    AuxiliaryProfile,
    GenerationParams,
    SettingsData
} from "./settings";

// 提示詞管理器 store
export { usePromptManagerStore } from "./promptManager";

// 使用者自訂提示詞庫 store
export { usePromptLibraryStore } from "./promptLibrary";

// 音樂播放器 store
export { useMusicStore } from "./music";
export type { PlayMode } from "./music";

// 表情包 store
export { useStickerStore } from "./sticker";

// 噗浪空間 store
export { useQzoneStore } from "./qzone";

// 使用者 store
export { PersonaDescriptionPosition, useUserStore } from "./user";
export type { UserData, UserPersona } from "./user";

// 圖片緩存 store
export { useImageCacheStore } from "./imageCache";

// AI 生成狀態全局管理 store
export { useAIGenerationStore } from "./aiGeneration";
export type { GenerationTask, GenerationTaskType } from "./aiGeneration";

// 通知 store
export { useNotificationStore } from "./notification";

// 節日 store
export { useHolidayStore } from "./holiday";

// 管理員 store
export { useAdminStore } from "./admin";

// 健身 store
export { useFitnessStore } from "./fitness";

// 驗證 store
export { useAuthStore } from "./auth";

// 番茄鐘 store
export { usePomodoroStore } from "./pomodoro";

