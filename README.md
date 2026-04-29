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

## MiniMax TTS 語氣控制整理

### 核心結論

- `MiniMax TTS / MiniMax Speech` 支援明確的語氣與情緒控制，不只是單純換音色。
- 公開可見的資料顯示，它至少支援情緒標籤、語速、音高、音量，以及根據文本內容自動推斷語氣。
- 技術報告也提到它在語音生成時會處理更自然的停頓、韻律與表達特徵。

### 可直接控制的輸出方式

#### 1. 情緒參數 `emotion`

公開文件中可見的情緒值包含：

- `auto`
- `happy`
- `sad`
- `angry`
- `fearful`
- `disgusted`
- `surprised`
- `calm`
- `fluent`
- `neutral`

這表示同一句文本可以透過不同 `emotion` 值，輸出成不同語氣版本。

#### 2. 自動推斷語氣 `auto`

- 當 `emotion` 設為 `auto` 時，模型會依據文本內容自動推斷較適合的語氣。
- 實際效果通常會受到句意、標點、上下文語意影響。
- 這種模式適合聊天機器人、互動語音、一般旁白等不想手動逐句標記情緒的場景。

#### 3. 韻律與表達微調參數

公開文件中也能看到以下可調參數：

- `speed`
- `pitch`
- `volume`

它們雖然不是情緒標籤，但會顯著影響最終語氣感受：

- `speed` 偏快時，通常更俐落、興奮、緊湊。
- `speed` 偏慢時，通常更沉穩、柔和、戲劇化。
- `pitch` 偏高時，常帶來更明亮、年輕、活潑的感覺。
- `pitch` 偏低時，常更成熟、沉穩、內斂。
- `volume` 會影響存在感、情緒張力與整體表達強度。

### 技術報告裡與語氣最相關的能力

根據 MiniMax 技術報告，模型不只是在讀字，而是在處理更完整的表達層：

- `emotions`
- `pauses`
- `expressive features`
- `prosody`
- `speech rate`

報告中提到：

- `Zero-Shot` 更傾向根據文本內容，自然生成情緒、停頓與表達特徵。
- `One-Shot` 更傾向貼近參考聲音本身的韻律、語速與情緒風格。

這代表它的語音輸出並非只靠固定模板，而是會在一定程度上動態調整表達方式。

### 更進階的語氣控制能力

技術報告中還提到：

- 可透過 `LoRA` 進行更進一步的語音情緒控制。

這比較偏底層模型能力或研究級延伸能力，不一定代表所有公開 API 都完整暴露這些控制接口，但能看出模型架構本身是朝可控表達方向設計的。

### 實務上可以怎麼理解

如果只從公開文件來看，MiniMax TTS 的語氣控制可分成兩層：

#### 第一層：情緒類型控制

- `happy`
- `sad`
- `calm`
- `angry`
- `surprised`
- `neutral`

這一層決定整體情緒傾向。

#### 第二層：說話方式微調

- `speed`
- `pitch`
- `volume`
- 文本本身語義與標點
- `auto` 推斷

這一層決定語速、起伏、張力、角色感與自然度。

### 適合拿來驗證的重點

如果要評估它是否真的符合需求，建議重點測這幾件事：

- 中文場景下，不同 `emotion` 的差異是否夠明顯。
- `auto` 模式是否能穩定判斷句子語氣。
- 同一句文本切換 `happy`、`calm`、`neutral`、`sad` 時，是否真的有可感知的表達差異。
- `speed` 與 `pitch` 的調整是否會讓聲音自然，而不是機械失真。
- 停頓、斷句、重音是否符合你的實際使用場景。

### 文件來源

#### 1. MiniMax 技術報告

- `https://minimax-ai.github.io/tts_tech_report/`

可看到與語氣直接相關的描述，包括：

- `emotions`
- `pauses`
- `expressive features`
- `prosody`
- `speech rate`

#### 2. Replicate 上的 MiniMax Speech 2.6 Turbo 文件

- `https://replicate.com/minimax/speech-2.6-turbo`

可看到公開列出的輸入參數：

- `emotion`
- `speed`
- `pitch`
- `volume`

以及情緒枚舉值：

- `auto`
- `happy`
- `sad`
- `angry`
- `fearful`
- `disgusted`
- `surprised`
- `calm`
- `fluent`
- `neutral`

#### 3. 補充參考頁

- `https://minimax-ai.chat/models/minimax-speech-02/`

這個頁面可作為輔助閱讀，但權威性不如官方技術報告與公開 API 文件。

### 最後判讀

- 如果你的問題是「MiniMax TTS 能不能控制語氣」，答案是可以。
- 如果你的問題是「它是不是只有音色切換」，答案不是，它還涉及情緒與韻律控制。
- 如果你的問題是「能不能做到細膩表達」，從公開資料看是有這個方向，但最終仍要靠實測判斷中文場景下的自然度與穩定性。
