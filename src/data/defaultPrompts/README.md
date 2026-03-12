# DefaultPrompts 模塊化重構指南

## 📁 當前結構

```
src/data/
├── defaultPrompts.ts          # 向後兼容入口（重新導出）
└── defaultPrompts/
    ├── index.ts               # 主入口檔案
    ├── types.ts               # 共用類型定義
    ├── README.md              # 本文件
    ├── chat.ts                # ✅ 主要聊天提示詞（45個定義）
    ├── diary.ts               # ✅ 日記系統（5個定義）
    ├── summary.ts             # ✅ 總結系統（5個定義）
    ├── events.ts              # ✅ 事件提取（3個定義）
    ├── plurk.ts               # ✅ 噗浪相關（8個定義）
    ├── phoneCall.ts           # ✅ 電話通話（10個定義）
    ├── batchComments.ts       # ✅ 批量評論（5個定義）
    └── defaultPrompts.ts      # 原始檔案（包含所有內容）
```

## 🎯 重構目標

✅ **已完成！** 將 `defaultPrompts/defaultPrompts.ts` 拆分成以下模塊：

1. **chat.ts** ✅ - 主要聊天提示詞（46 個定義，36KB）
2. **diary.ts** ✅ - 日記系統（5 個定義）
3. **summary.ts** ✅ - 總結系統（5 個定義）
4. **events.ts** ✅ - 事件提取（3 個定義）
5. **plurk.ts** ✅ - 噗浪相關（發文 + 評論，8 個定義）
6. **phoneCall.ts** ✅ - 電話通話（10 個定義）
7. **batchComments.ts** ✅ - 批量評論（5 個定義）
8. **faceToFacePrompts.ts** ✅ - 面對面模式
9. **groupChatPrompts.ts** ✅ - 群聊模式

所有模塊已完成並正常工作！

## 📝 拆分步驟

### 步驟 1：創建各個模塊檔案

每個模塊檔案的基本結構：

```typescript
/**
 * [模塊名稱] 提示詞定義
 */

import type { PromptDefinition, PromptOrderEntry } from "./types";
import { INJECTION_RELATIVE, INJECTION_ABSOLUTE } from "./types";

export const [模塊]_PROMPT_DEFINITIONS: PromptDefinition[] = [
  // ... 提示詞定義
];

export const DEFAULT_[模塊]_PROMPT_ORDER: PromptOrderEntry[] = [
  // ... 順序定義
];
```

### 步驟 2：從原檔案複製對應內容

以 `diary.ts` 為例：

1. 打開 `defaultPrompts/defaultPrompts.ts`
2. 找到 `// ===== 日記提示詞定義 =====` 區塊
3. 複製從該註釋到下一個 `// =====` 註釋之間的所有內容
4. 貼到新的 `diary.ts` 檔案中
5. 調整 import 路徑

### 步驟 3：更新 index.ts

在 `defaultPrompts/index.ts` 中，將導入改為：

```typescript
// 從各個模塊導入
export * from './chat';
export * from './diary';
export * from './summary';
export * from './events';
export * from './plurk';
export * from './phoneCall';
export * from './batchComments';

// 保留對舊檔案的引用（面對面和群聊模式）
export {
  DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
  FACE_TO_FACE_PROMPT_DEFINITIONS,
  DEFAULT_GROUP_CHAT_PROMPT_ORDER,
  GROUP_CHAT_PROMPT_DEFINITIONS,
} from './defaultPrompts';
```

### 步驟 4：逐步刪除原檔案內容

當所有模塊都拆分完成後，`defaultPrompts/defaultPrompts.ts` 應該只剩下：
- 面對面模式提示詞
- 群聊模式提示詞
- 或者完全刪除，將這兩個也拆出去

### 步驟 5：測試

每拆分一個模塊後，執行：
```bash
npm run dev
```
確保沒有編譯錯誤。

## 🔍 各模塊內容範圍

### chat.ts（主要聊天）
- `protectionSequence` ~ `custom_1772289044219`
- 共 45 個 identifier
- 約 1400 行

### diary.ts（日記系統）
- `diarySystemPrompt` ~ `diaryInstruction`
- 共 5 個 identifier
- 約 120 行

### summary.ts（總結系統）
- `summarySystemPrompt` ~ `summaryInstruction`
- 共 5 個 identifier
- 約 130 行

### events.ts（事件提取）
- `eventsSystemPrompt` ~ `eventsInstruction`
- 共 3 個 identifier
- 約 80 行

### plurk.ts（噗浪）
- `plurkPostSystemPrompt` ~ `plurkCommentInstruction`
- 共 8 個 identifier（發文 4 個 + 評論 4 個）
- 約 210 行

### phoneCall.ts（電話通話）
- `phoneCallSystemPrompt` ~ `incomingCallContext`
- 共 10 個 identifier
- 約 290 行

### batchComments.ts（批量評論）
- `batchCommentsSystemPrompt` ~ `batchCommentsInstruction`
- 共 5 個 identifier
- 約 160 行

## ✅ 完成狀態

🎉 **重構已完成！**

所有提示詞模塊已成功創建並測試通過：
- ✅ chat.ts - 46 個聊天提示詞（36KB）
- ✅ diary.ts - 5 個日記提示詞
- ✅ summary.ts - 5 個總結提示詞
- ✅ events.ts - 3 個事件提取提示詞
- ✅ plurk.ts - 8 個噗浪提示詞
- ✅ phoneCall.ts - 10 個電話通話提示詞
- ✅ batchComments.ts - 5 個批量評論提示詞
- ✅ faceToFacePrompts.ts - 面對面模式
- ✅ groupChatPrompts.ts - 群聊模式

### 測試結果
- TypeScript 編譯: ✅ 無錯誤
- 類型檢查: ✅ 通過
- 向後兼容: ✅ 保持

## ✨ 優點

1. **檔案大小可控**：每個檔案 80-1400 行，更容易編輯
2. **職責清晰**：每個模塊負責特定功能
3. **向後兼容**：現有代碼無需修改
4. **逐步遷移**：可以一個一個慢慢拆分

## 🚀 快速開始

如果你想立即開始拆分，建議從最小的模塊開始：

```bash
# 1. 創建 events.ts（最小，只有 80 行）
# 2. 創建 diary.ts
# 3. 創建 summary.ts
# 4. 創建 plurk.ts
# 5. 創建 phoneCall.ts
# 6. 創建 batchComments.ts
# 7. 最後處理 chat.ts（最大）
```

## 📌 注意事項

- 保持 `INJECTION_RELATIVE` 和 `INJECTION_ABSOLUTE` 常量的導入
- 確保每個模塊都正確導出 `DEFINITIONS` 和 `ORDER`
- 測試時注意檢查提示詞管理器是否正常工作
- 拆分完成後可以刪除 `defaultPrompts/chat.ts`（未完成的檔案）
