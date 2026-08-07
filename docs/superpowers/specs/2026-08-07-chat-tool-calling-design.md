# 一對一聊天工具呼叫與提示詞後處理設計

## 目標

在 Aguaphone 的一對一聊天中完整移植 SillyTavern 提示詞後處理模式，並加入可由角色呼叫手機功能的統一工具系統。低風險工具可自動執行，高風險工具需要使用者確認；每個角色擁有獨立工具權限。第一階段不處理群聊呼叫者驗證。

## 現況與邊界

- API 傳輸入口是 `src/api/OpenAICompatible.ts`；目前支援 OpenAI 相容 JSON、Claude 原生模式與串流。
- 設定型別是 `src/types/settings.ts`，持久化與配置切換由 `src/stores/settings.ts` 管理。
- PromptBuilder 會產生帶 `identifier`、`name` 和多模態內容的 `APIMessage`。
- `src/services/themeAssistant/` 已有宣告式工具註冊與參數驗證，可作為工具定義模式的參考，但一般聊天工具需要獨立的共用核心。
- 第一階段只支援一對一聊天；群聊不會把工具呼叫者視為已驗證。
- 工具不可直接執行任意 JavaScript、任意網路請求、任意 IndexedDB 寫入或本機檔案操作。

## 架構

### PromptPostProcessor

新增獨立模組，提供 `postProcessPrompt(messages, type, options)`。

支援模式：

- `none` / 空字串：原樣複製。
- `merge`、`merge_tools`：合併連續相同角色。
- `semi`、`semi_tools`：只保留第一則 system，其他 system 轉 user，再合併。
- `strict`、`strict_tools`：semi 行為加上 user 佔位訊息。
- `single`：所有訊息轉成單一 user，移除工具資料。

`*_tools` 版本保留 `tool`、`tool_calls` 和 `tool_call_id`；非 tools 版本把 tool 轉成 user 並移除工具欄位。處理對複製的訊息執行，原始 PromptBuilder 結果不變。多模態陣列以文字區塊合併，非文字區塊維持順序。預設佔位文字為 `[Start a new chat]`。

### Tool Registry

工具定義統一包含：

```ts
interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  risk: "low" | "high";
  category: ChatToolCategory;
  execute(args: Record<string, unknown>, context: ChatToolContext): Promise<ToolExecutionValue> | ToolExecutionValue;
}
```

工具清單依角色設定過濾後才會送給模型。執行器會再次檢查權限，不信任模型自行宣稱的工具名稱或參數。

第一批工具以現有服務為主：查詢時間、查詢天氣、查看／新增行事曆、安排來電、搜尋／播放音樂、換桌布，以及查詢記憶。新增、播放、查詢等低風險功能可自動執行；公開發文、付款、刪除或覆蓋資料等高風險功能先建立確認請求。

### 角色工具權限

在角色資料中新增工具權限設定，至少包含：

```ts
interface CharacterToolPermissions {
  enabled: boolean;
  categories: Partial<Record<ChatToolCategory, boolean>>;
  tools: Partial<Record<string, boolean>>;
}
```

判斷順序為全域工具開關、角色 `enabled`、單一工具覆寫、分類設定、工具預設值。未知工具一律拒絕。設定缺失時使用版本化預設值，舊角色可正常載入。

### Tool Protocol Adapter

內部統一使用：

```ts
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  id: string;
  name: string;
  ok: boolean;
  content: string;
}
```

Adapter 負責三種協議：

- OpenAI 相容：`tools`、assistant `tool_calls`、`tool` result。
- Claude 原生：`tools`、`tool_use`、`tool_result`。
- 文字備援：解析既有的 ````tool_calls` JSON 區塊。

API 設定新增協議選項 `auto | native | text | disabled`。`auto` 優先原生工具；明確收到不支援工具的錯誤時才使用文字備援，且同一輪最多切換一次。

### Tool Execution Engine

生成流程為：建立原始 messages -> 提示詞後處理 -> 選取角色可用工具 -> 建立供應商請求 -> 解析工具呼叫 -> 驗證權限與參數 -> 低風險立即執行／高風險建立確認 -> 將 `ToolResult` 加入上下文 -> 再次請求模型 -> 產生最終回覆。

單次使用者訊息最多 5 次工具往返。相同工具與相同標準化參數重複呼叫、工具逾時、連續失敗或超過上限時，停止迴圈並回傳可見的錯誤說明。工具執行錯誤以結構化結果回給模型，不讓單一工具錯誤中斷整個聊天。

高風險工具會產生待確認操作，包含工具名稱、用途和經過遮罩的主要參數。使用者拒絕時回傳拒絕結果給模型；確認後才執行並繼續生成。確認狀態不跨聊天保存。

## API 與資料流變更

- `APIMessage` 擴充 `role: "tool"`、`tool_calls`、`tool_call_id`，保留現有 `identifier`。
- `GenerationParams` 增加可選工具、協議與執行上下文；非聊天任務預設不啟用工具迴圈。
- `OpenAICompatibleClient` 將請求建構、協議轉換、串流工具片段解析委派給小型 helper，維持既有 HTTP、重試與診斷行為。
- `AIService` 或聊天生成 composable 負責逐輪執行工具，不讓 UI 元件直接解析供應商格式。
- `settings.ts` 和角色持久化 mapper 增加預設與版本化遷移。
- Settings UI 提供後處理模式、工具協議與全域工具開關；角色編輯 UI 提供分類／單工具權限。

## 錯誤與安全邊界

- 所有工具參數先通過 JSON Schema 驗證與工具自訂限制。
- 工具執行必須有超時與取消訊號；不得使用任意函式名稱或動態 import。
- 網路型工具只能呼叫既有明確 endpoint/service，不接受模型提供的 URL。
- UI、診斷和持久化不記錄 API key；工具紀錄只保存名稱、結果摘要和成功狀態。
- 工具結果文字需限制大小，避免模型透過工具結果造成上下文無界增長。

## 測試與驗收

- PromptPostProcessor 單元測試覆蓋全部模式、角色轉換、佔位訊息、工具保留、工具移除、多模態與輸入不可變性。
- Tool Registry／權限測試覆蓋預設值、角色覆寫、未知工具拒絕、分類禁用與參數驗證。
- Adapter 測試覆蓋 OpenAI、Claude、文字備援以及串流工具片段拼接。
- Execution Engine 測試覆蓋低風險自動執行、高風險暫停／確認／拒絕、工具錯誤、重複呼叫與五輪上限。
- API client 整合測試確認送出的 messages 是後處理結果、工具欄位只在啟用時出現，且既有 Claude 快取與 DeepSeek 角色處理不回歸。
- 驗收需通過 `npm run type-check`、`npm run test`、`npm run build`，並以一對一聊天實際驗證至少一個低風險工具和一個需要確認的工具。

## 分階段交付

1. 提示詞後處理與訊息型別。
2. 工具核心、角色權限和協議型別。
3. OpenAI 相容原生工具迴圈與第一批低風險工具。
4. 高風險確認 UI、Claude 原生 adapter 與文字備援。
5. 一對一端到端驗收；群聊另立後續設計。
