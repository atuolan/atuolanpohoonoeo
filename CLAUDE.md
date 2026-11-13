# 給 Claude 的專案備忘

## 聊天卡片

- 聊天裡的卡片訊息（分享卡、小屋的事這類自帶外觀的卡片）**後面不要墊氣泡底色**。
  做法：卡片在 `MessageBubble.vue` 裡用自己的 wrapper class，並把它加進「移除氣泡背景」那幾條 `&:has(> .xxx-wrapper)` 規則（背景透明、padding 0、沒有陰影），參考 `.house-news-wrapper`、`.group-chat-history-wrapper`。
