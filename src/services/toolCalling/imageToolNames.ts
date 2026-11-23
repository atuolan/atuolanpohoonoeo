/** 畫圖、看圖相關的工具名稱（工作紀錄卡片也用來判斷哪些工具呼叫要記進去） */

/** 查 Danbooru 標籤：只在生圖服務是 NovelAI 時給模型（見 useMcpChatTools） */
export const DANBOORU_TAGS_TOOL_NAME = "search_danbooru_tags";
/** 找常畫某類內容的繪師：同上，只在 NovelAI 時給 */
export const DANBOORU_ARTISTS_TOOL_NAME = "find_danbooru_artists";
/** 試畫：畫好的圖記在工作紀錄、交給模型看，不直接進聊天（文生圖設定好才給） */
export const GENERATE_IMAGE_TOOL_NAME = "generate_image";
/** 選定一張試畫，貼進聊天 */
export const CHOOSE_IMAGE_TOOL_NAME = "choose_image";
/** 看聊天裡的圖：連同畫那張圖用的提示詞；也能看試畫 */
export const VIEW_CHAT_IMAGE_TOOL_NAME = "view_chat_image";
