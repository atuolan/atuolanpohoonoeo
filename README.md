# Aguaphone - 虛擬手機主頁系統

一個高度可定制的虛擬手機主頁，支持多種視覺風格和自由佈局。

## 技術棧

- **Vue 3** - 響應式 UI 框架
- **Vite** - 現代前端構建工具
- **TypeScript** - 類型安全
- **Pinia** - 狀態管理
- **IndexedDB (idb)** - 本地數據持久化
- **SCSS** - 樣式預處理器

## 功能特色

### 主題系統

- **可愛風 (Cute)** - 粉色系、圓角大、溫馨可愛
- **霓虹風 (Neon)** - 暗色背景、發光效果、科技感
- **玻璃態 (Glass)** - 毛玻璃效果、透明感、現代簡約
- **自定義** - 完全自由配置顏色、字體、壁紙等

### CSS 變數系統

- 顏色系統（主色、背景、文字、氣泡）
- 字體系統（字族、大小、粗細）
- 間距系統（基於 4px）
- 圓角系統
- 陰影系統
- 動畫系統

## 開始使用

```bash
# 安裝依賴
npm install

# 啟動開發服務器
npm run dev
node node_modules/vite/bin/vite.js


# 構建生產版本
npm run build
npm run build:fast
npm run build:fast-inline
```

## 項目結構

```
src/
├── App.vue                 # 根組件
├── main.ts                 # 入口文件
├── components/
│   └── home/               # 主頁組件
│       ├── HomeScreen.vue  # 主頁容器
│       └── StatusBar.vue   # 狀態欄
├── stores/
│   ├── theme.ts            # 主題狀態
│   ├── layout.ts           # 佈局狀態
│   └── app.ts              # 應用狀態
├── styles/
│   ├── global.scss         # 全局樣式
│   ├── theme-presets.ts    # 主題預設配置
│   └── themes/
│       ├── variables.scss  # CSS 變數
│       ├── cute.scss       # 可愛風樣式
│       ├── neon.scss       # 霓虹風樣式
│       └── glass.scss      # 玻璃態樣式
├── db/
│   ├── database.ts         # IndexedDB 配置
│   └── operations.ts       # CRUD 操作
└── types/
    └── index.ts            # 類型定義
```

## 開發計劃

- [x] 項目初始化
- [x] CSS 變數系統 + 主題預設
- [ ] 小組件系統
- [ ] 懸浮 Dock
- [ ] 主題編輯器
- [ ] 好感度系統
