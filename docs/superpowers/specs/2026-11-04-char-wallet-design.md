# 角色帳戶設計

## 目標

角色有一個會保存下來的帳戶。轉帳、紅包、約會付錢、偷窺手機裡的日常消費都從這個帳戶進出。

順便解決錢包進帳太快的問題：現在角色 `<transfer amount="...">` 寫多少，使用者錢包就進多少，沒有上限。有了帳戶，角色只能給出他真的有的錢。

## 已定案

- 有錢的角色轉給你的錢照樣全部進你的錢包，只受角色餘額限制。
- 帳戶跟著角色（`characterId`）走，不跟聊天走。同一個角色開好幾個聊天，用的是同一個帳戶。
- 使用者錢包維持只有一個（`GLOBAL_WALLET_ID = "global"`），不動。

## 資料

新增 IndexedDB 表 `charWallets`，以 `characterId` 為 key。

```ts
interface CharWallet {
  characterId: string;
  balance: number;
  /** 月收入，AI 估一次，使用者可改 */
  monthlyIncome: number;
  /** 收入來源，例如「公司薪水」「接案」 */
  incomeNote?: string;
  /** 上次入帳的劇情日期 YYYY-MM-DD */
  lastPaidStoryDay: string;
  /** 最近 100 筆收支 */
  ledger: CharLedgerEntry[];
  initializedFrom: "peek" | "estimate" | "manual";
  updatedAt: number;
}

interface CharLedgerEntry {
  id: string;
  /** 入帳正數、支出負數 */
  amount: number;
  kind: "income" | "to_user" | "from_user" | "redpacket" | "date" | "daily" | "manual";
  description: string;
  storyTime: number;
  realTime: number;
  chatId?: string;
}
```

`charWallets` 要加進備份、自架同步、裝置互傳。比照現有的表處理：`backupCoverage`、`selfHostedSyncMappers`、`PeerSyncManager`。

## 建立帳戶

第一次需要用到帳戶時才建立，例如打開偷窺手機、角色轉帳、約會付錢。

1. 偷窺手機已經有資料：直接用那份 `balance`，`initializedFrom = "peek"`。
2. 沒有：發一次小請求，讓 AI 依角色卡估出存款、月收入和收入來源，回傳 JSON。用「重要事件」那組 API 設定。
3. 請求失敗：先用存款 30000、月收入 30000，標成 `estimate`，使用者可以自己改。

## 收入

- 每過一個劇情日，入帳 `monthlyIncome / 30`，四捨五入。
- 用「發生收支的那個聊天」的劇情日期，跟 `lastPaidStoryDay` 比，補上中間的天數，一次最多補 30 天。
- 劇情時間往回跳（時光倒流、撤銷）時不入帳，也不倒扣。

## 支出與入帳

| 時機 | 處理 |
|---|---|
| 使用者收下角色的轉帳 `handleAcceptTransfer` | 先結算收入。餘額夠就扣帳戶、進使用者錢包；不夠就轉帳卡顯示「餘額不足，轉帳失敗」，並留一則角色下一輪看得到的系統訊息：「{{char}} 想轉 X 元，但帳戶只剩 Y 元」 |
| 角色發紅包 | 發出時一次扣總額，不夠就發不出去（同上提示）。過期沒領完的退回角色帳戶 |
| 使用者轉給角色、角色收下 `settleUserTransfers` | 入角色帳戶（`from_user`）。角色退回就不入帳 |
| 約會角色付錢 | 見約會設計 |
| 偷窺手機的日常消費 | 見下一段 |
| 一輪回覆被換掉 | 跟現在的轉帳還原一樣，把這一輪的扣款或入帳還原 |

群組聊天裡，用 `senderCharacterName` 找出是哪個成員轉的，扣那個角色的帳戶。沒有 `characterId` 的多角色卡成員維持舊做法，不扣帳戶。

## 偷窺手機

- 提示詞不再叫 AI 編 `balance`。改成告訴它目前的真實餘額，只請它寫這段時間的消費紀錄。
- 新的消費紀錄加總後當成支出扣掉。已經扣過的用時間和描述去重，不重複扣。
- 一天的日常消費最多扣到餘額的一半，超過就照比例縮小，避免一次被 AI 花光。
- 錢包頁顯示真實餘額，收支紀錄把帳戶 `ledger` 和 AI 寫的消費合在一起。

## 讓 AI 知道自己有多少錢

每輪只送一行，四捨五入到「約 X 萬」，例如：

> {{char}} 帳戶餘額：約 4.2 萬（月收入約 6 萬）

做成一個預設提示詞條目，放在線上、面對面、群組三種模式，使用者可以關掉。不寫精確數字，省 token，也避免 AI 斤斤計較。

## 介面

偷窺手機的錢包頁，或角色資料頁，顯示：

- 餘額
- 月收入和收入來源，可以編輯
- 最近收支
- 「重新估算」按鈕：重跑一次 AI 估算

## 測試計畫

- 收入結算：跨好幾天補發、最多補 30 天、劇情時間往回不入帳。
- 轉帳：餘額夠就扣帳戶、進使用者錢包；不夠就失敗而且不進錢；一輪被換掉時還原。
- 紅包：發出時扣錢、過期退回、餘額不夠發不出去。
- 偷窺手機：消費不重複扣、一天最多扣一半、首次用偷窺手機的餘額建立帳戶。
- 備份、同步會包含 `charWallets`。
- 回歸：`npm run type-check`、`npm run test`。
