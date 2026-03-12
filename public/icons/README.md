# 圖標文件夾

此文件夾用於存放 Aguaphone 的各種圖標文件。

## 📋 需要的文件清單

- [ ] `favicon-16x16.png` - 16x16px
- [ ] `favicon-32x32.png` - 32x32px  
- [ ] `apple-touch-icon.png` - 180x180px
- [ ] `icon-192x192.png` - 192x192px
- [ ] `icon-512x512.png` - 512x512px
- [ ] `icon-maskable-192x192.png` - 192x192px (可選)
- [ ] `icon-maskable-512x512.png` - 512x512px (可選)
- [x] `icon.svg` - 矢量圖標 (已提供示例)

## 🚀 快速生成圖標

### 方法 1：自動生成（推薦）

1. 準備一個 1024x1024px 的 PNG 圖標，放在項目根目錄
2. 命名為 `icon-source.png`
3. 安裝依賴：
   ```bash
   npm install sharp
   ```
4. 運行生成腳本：
   ```bash
   node generate-icons.js
   ```

### 方法 2：在線工具

訪問 https://realfavicongenerator.net/ 上傳你的圖標，自動生成所有尺寸。

### 方法 3：手動放置

直接將準備好的圖標文件放入此文件夾，確保文件名和尺寸正確。

## ✅ 測試

生成圖標後：

1. 運行 `npm run build` 重新構建
2. 在瀏覽器中測試 favicon
3. 在手機上測試「添加到主屏幕」功能

## 📝 注意

- 所有圖標建議使用 PNG 格式
- 建議使用透明背景
- Maskable 圖標需要在中心 80% 區域內放置重要內容
- 更新圖標後記得清除瀏覽器緩存
