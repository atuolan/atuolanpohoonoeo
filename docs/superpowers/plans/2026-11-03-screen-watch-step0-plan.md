# 實作計畫：看螢幕模式 第 0 步（iOS 可行性測試）

> 設計文件：`docs/superpowers/specs/2026-11-03-screen-watch-design.md`
> 狀態：計畫，還沒開工。

## 目的

只回答一個問題：**用 GitHub Actions 打的沒簽名 IPA，經過 Sideloadly＋免費 Apple ID 安裝後，螢幕廣播擴充元件能不能正常運作？**

這一步**不接 AI、不截圖送出去、不動網頁**。測完這個分支**不合併進 master**，真正的功能之後另外做。

## 要測的五件事

| # | 要確認的事 | 怎麼看 |
|---|---|---|
| 1 | 擴充元件有被打包進 IPA | GitHub Actions 檢查 `App.app/PlugIns/ScreenWatchBroadcast.appex` 存在 |
| 2 | Sideloadly 裝完後，擴充元件出現在系統選單 | 控制中心長按「螢幕錄影」，清單裡有「203 Phone」 |
| 3 | 廣播中擴充元件能發通知 | 開始廣播後每 30 秒收到一則通知 |
| 4 | 擴充元件能處理畫面，且記憶體夠用 | 通知裡顯示「收到幾張畫面、縮圖後幾 KB」，廣播撐過 5 分鐘不被系統關掉 |
| 5 | App 和擴充元件能共用資料（App Group） | 通知裡顯示從 App 讀到的值；回到 App 時跳出擴充元件寫的次數 |

## 要新增、修改的檔案

### 新增：擴充元件 `ios/App/ScreenWatchBroadcast/`

- **`SampleHandler.swift`**：繼承 `RPBroadcastSampleHandler`
  - `broadcastStarted`：讀 App Group 裡 App 寫的值，發通知「開始了｜App Group：<讀到的值 或「讀不到」>」
  - `processSampleBuffer`（只處理 `.video`）：
    - 計數收到幾張畫面
    - 每 30 秒挑一張，縮到寬 720、轉 JPEG，記下大小（KB），**不存、不送出**
    - 發通知「第 N 次｜收到 M 張｜縮圖 X KB｜App Group：<值>」
    - 把「第 N 次」寫進 App Group
  - `broadcastFinished`：發通知「結束了，共 N 次」
  - 同一時間只保留一張縮圖，用完就丟，壓低記憶體
- **`Info.plist`**：
  - `NSExtensionPointIdentifier` = `com.apple.broadcast-services-upload`
  - `NSExtensionPrincipalClass` = `$(PRODUCT_MODULE_NAME).SampleHandler`
  - `RPBroadcastProcessMode` = `RPBroadcastProcessModeSampleBuffer`
  - 顯示名稱 `CFBundleDisplayName` = `203 Phone`
- **`ScreenWatchBroadcast.entitlements`**：`com.apple.security.application-groups` = `group.uk.aguacloud.aguaphone`

### 新增：App 本體的 entitlements

- **`ios/App/App/App.entitlements`**：一樣的 App Group

### 修改：Xcode 專案 `ios/App/App.xcodeproj/project.pbxproj`

- 新增 target `ScreenWatchBroadcast`（類型 App Extension）
  - Bundle ID：`uk.aguacloud.aguaphone.ScreenWatch`
  - 最低版本：iOS 15.0（跟 App 一樣）
  - 連結 `ReplayKit`、`UserNotifications`
- App target 加上「Embed Foundation Extensions」，把 `.appex` 放進 `App.app/PlugIns/`
- 兩個 target 都設定 `CODE_SIGN_ENTITLEMENTS`

**做法**：手改 `project.pbxproj` 很容易壞，所以用 Ruby 的 `xcodeproj` 套件寫一個腳本
`scripts/ios/add-broadcast-extension.rb` 來加 target。在這裡跑一次，把產生的 `project.pbxproj` 提交；腳本留著，之後要重做可以重跑。

### 修改：`ios/App/App/AppDelegate.swift`、`SceneDelegate.swift`（只在測試分支）

- 啟動時把「App 寫入：<時間>」寫進 App Group
- 啟動時請求通知權限（測試分支才這樣做；正式版改成玩家開啟看螢幕模式時才問）
- App 用 Scene，所以回到前景的處理放在 `SceneDelegate.sceneDidBecomeActive`：讀 App Group 裡擴充元件寫的次數，跳一個提示框「擴充元件寫入：第 N 次」

### 修改：`.github/workflows/ios-build.yml`

- 打包 IPA 前加一步檢查：列出 `App.app/PlugIns/`，找不到 `ScreenWatchBroadcast.appex` 就讓 workflow 失敗
- 測試分支用「Run workflow」手動觸發（這個 workflow 本來就有 `workflow_dispatch`）

## 我能驗證的、不能驗證的

- ✅ 能：用 `xcodeproj` 產生專案設定、檢查 plist 和 entitlements 格式、跑現有的網頁測試確認沒影響
- ❌ 不能：在雲端編譯 Swift、在 iPhone 上執行。**編譯交給 GitHub Actions**（macOS 機器），**執行要你在 iPhone 上測**
- 如果 GitHub Actions 編譯失敗，我看錯誤訊息修，再跑一次

## 你要做的測試步驟

1. 到 GitHub → Actions →「iOS 測試版 IPA」→ Run workflow → 選測試分支
2. 下載 IPA，用 Sideloadly 安裝。**注意 Sideloadly 有沒有出現跟擴充元件或 App Group 有關的警告或錯誤**，有的話截圖
3. 打開 App 一次，允許通知
4. 控制中心 → 長按「螢幕錄影」→ 看清單裡有沒有「203 Phone」→ 選它 → 開始廣播
5. 切去別的 App 滑 5 分鐘，看有沒有每 30 秒收到通知，**截圖通知內容**
6. 停止廣播，回到 App，看有沒有跳出「擴充元件寫入：第 N 次」

## 測試結果怎麼決定下一步

| 結果 | 下一步 |
|---|---|
| 五項都過 | 照設計做完整版 |
| 1 不過（沒打包進去） | 我修專案設定或 workflow |
| 2 不過（選單裡沒有） | 可能是 Sideloadly 沒簽擴充元件：查 Sideloadly 設定；不行就評估其他簽名工具 |
| 3 不過（沒通知） | 改成擴充元件只寫 App Group，回到 App 再顯示；或研究其他提醒方式 |
| 4 不過（被系統關掉） | 降低縮圖尺寸、抽樣頻率再測 |
| 5 不過（App Group 不能用） | 用設計文件裡的備案：回覆只出現在通知裡、不寫回聊天；設定要另外想辦法傳給擴充元件 |
| 2 和 3 都不過 | iOS 進階版在自簽安裝下做不到，改做「背面輕點截圖」簡單版 |

## Android

Android 的螢幕擷取（MediaProjection）在自己裝的 APK 上是正常可用的，不需要可行性測試。iOS 測完後直接做完整版。

## 預估

- 我寫程式＋讓 GitHub Actions 編譯過：一個工作階段
- 你測試：大約 15 分鐘
