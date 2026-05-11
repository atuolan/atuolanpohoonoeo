# 作者公告（Author Announcements）

## 怎麼發布一則新公告？

1. 打開 `public/announcements.xml`。
2. **複製範本區塊**貼到 `<announcements>` 最上面，改 `id`（要唯一）和內容就好。
3. 想配圖：把圖片放到 `public/announcements/` 這個資料夾，
   在內容裡寫 `![說明](/announcements/你的檔名.png)`。
4. `git push` → Cloudflare Pages 自動部署 → 用戶下次開 App 就看到。

## 為什麼用 XML？

- **不用 escape**：`<body>` 用 `<![CDATA[ ... ]]>` 包住，引號、反斜線、換行都直接寫，
  不像 JSON 要寫 `\n` 跟 `\"`。
- **可以加註解**：用 `<!-- ... -->`，作者方便筆記。
- **多行內容超直觀**：直接 Enter 換行，所見即所得。

## 一則公告的結構

```xml
<announcement id="2026-05-11-welcome" level="info" date="2026-05-11">
  <title>這裡是標題</title>
  <image>/announcements/封面圖.png</image>             <!-- 可選 -->
  <action label="按鈕文字" url="https://..." />        <!-- 可選 -->
  <body><![CDATA[

這裡寫**正文**。

支援 Markdown：
- 清單
- [連結](https://...)
- 圖片 ![](/announcements/x.png)
- 多行換行直接 Enter

  ]]></body>
</announcement>
```

### 屬性說明

| 屬性 | 必填 | 說明 |
|------|------|------|
| `id` | ✅ | 唯一識別碼，已確認過的 id 永遠不會再彈。可隨意命名（建議帶日期）。 |
| `level` | | `info`（藍 / 預設）、`important`（黃）、`critical`（紅）。 |
| `date` | | 任意顯示字串，例如 `2026-05-11`。 |
| `dismissable` | | 預設 `true`。 |

## 行為

- App 啟動時 fetch `/announcements.xml`（每小時 cache-busting）。
- 對照 IndexedDB `announcementAcks` 已確認的 id，過濾後**逐一彈窗**。
- 點「我已知曉」→ 寫入 DB → 進到下一則。
- 失敗（離線 / 404 / XML 語法錯誤）：靜默忽略。

## 想再提示一次相同內容？

換一個新的 `id`（例如改個日期前綴）即可。

## 想撤回？

直接刪掉那個 `<announcement>` 區塊。

## XML 常見錯誤

- 標籤要閉合：`<title>...</title>`，自閉合用 `<action ... />`。
- 屬性值要加引號：`id="xxx"`，不能寫 `id=xxx`。
- 純文字裡的 `&` 要寫成 `&amp;`（**但 CDATA 裡面不用**，所以正文寫在 CDATA 裡就好）。
- 多了或少了一個 `]]>` 整個檔案就掛了，VS Code 會幫你標紅。

