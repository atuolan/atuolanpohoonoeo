# 訊息長按重新生成語音設計

## 目標

在每條 AI 訊息的長按／右鍵操作選單中加入「重新生成語音」。使用者點擊後，只重新合成該條訊息的 MiniMax 語音，不觸發 AI 文字重新生成；即使該訊息過去沒有生成過語音，也可以直接合成。

## 範圍與行為

- 選單項目只對 `role === "ai"` 顯示，使用者訊息不顯示。
- 只有聊天已開啟 MiniMax TTS 且全域設定存在 API Key 時才送出合成請求。
- 沒有既有 TTS 資料時，以訊息 `content` 作為合成來源。
- 有既有 TTS 資料時，優先使用 `ttsRawContent`，保留原有語氣標籤與語速資訊。
- 重新合成以該訊息為單位；訊息內若能解析出多個 TTS 段落，全部段落都重新合成。
- 合成前清除該訊息現有段落的 `audioUrl` 與舊版 `ttsAudioUrl`，避免 UI 播放舊音頻；合成失敗時不覆蓋尚存的原音頻資料。
- 成功產生至少一段音頻後保存聊天資料；失敗時顯示既有 toast 錯誤提示，不影響其他訊息。
- 沿用目前 `useChatTTS` 的 MiniMax 設定合併、繁轉簡、語音標記解析、簽名 URL 轉 Data URL 與既有語音提示詞，不新增第二套 TTS API。

## 架構與資料流

1. `MessageBubble` 的一般訊息選單新增按鈕與 `regenerateVoice` emit；按鈕沿用現有選單的長按／右鍵防誤觸機制。
2. `ChatScreen` 接收事件，找到訊息並呼叫 `useChatTTS` 暴露的手動重生函式。
3. 手動重生函式檢查聊天 TTS 開關、API Key 與訊息角色，決定來源文字後呼叫既有強制 TTS 流程。
4. TTS 流程更新該訊息的 `ttsRawContent`、`ttsSegments` 與音頻 URL，完成後保存聊天並回報結果。

## 錯誤處理與邊界

- 聊天未開啟 MiniMax：不呼叫 API，提示「請先開啟 MiniMax 語音生成」。
- API Key 缺失：不呼叫 API，提示設定 API Key。
- 訊息不存在、不是 AI、或文字為空：不修改資料並顯示可理解的錯誤提示。
- 重新生成期間再次點擊同一訊息：忽略重複請求，避免並發覆蓋段落。
- 單段失敗但其他段成功：保留成功段落並保存，錯誤記錄到 console。

## 測試計畫

- 元件／事件：AI 訊息顯示「重新生成語音」，使用者訊息不顯示，點擊正確 emit 訊息 ID。
- TTS 流程：未啟用或缺少 API Key 時不呼叫 `synthesizeSpeech`；無 TTS 標記時 `force` 模式仍以 `content` 合成；有 `ttsRawContent` 時優先使用它。
- 資料更新：成功後寫入新的段落音頻與保存聊天；重生失敗不破壞既有音頻。
- 回歸驗證：`npm run type-check`、相關 Vitest 測試與完整 `npm run test`。

