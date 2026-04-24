---
title: Aguaphone Sync Server
emoji: 🔄
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Aguaphone Self-Hosted Sync Server

最小可跑的自架同步後端，對齊前端的 SelfHostedSync API contract。

**需求：Node.js ≥ 18 或 Docker。無需資料庫，資料存在本機 JSON 檔。**

---

## 給想使用同步功能的用戶

### 步驟 1：部署這個伺服器

選擇一種方式：

#### 方式 A：Docker Compose（推薦）

```bash
# 下載這個資料夾（或 clone 整個 repo）
cd self-hosted-sync-server

# 修改 docker-compose.yml 裡的 ADMIN_PASSWORD
# 然後啟動
docker compose up -d
```

伺服器會跑在 `http://你的主機IP:3004`

#### 方式 B：Hugging Face Spaces（免費，無需信用卡）

1. 到 [huggingface.co/new-space](https://huggingface.co/new-space) 建立 Space
2. **SDK 選 Docker**，Visibility 可設 Public 或 Private
3. 把 `self-hosted-sync-server/` 資料夾的所有檔案上傳到 Space 的根目錄（Dockerfile、src/、package.json 等）
4. 在 Space 的 **Settings → Repository secrets** 設定以下環境變數：
   - `ADMIN_PASSWORD`：Admin UI 密碼（**務必設定**）
   - `SYNC_TOKEN_SECRET`：隨機字串，確保重啟後 token 不失效
5. Space 自動 build 並啟動，取得 `https://你的帳號-aguaphone-sync-server.hf.space` 這樣的公開 URL

> ⚠️ **注意**：免費 HF Spaces 的儲存空間是**暫時性的**，Space 休眠或重啟後 `data/store.json` 會消失（即所有帳號和資料）。請務必設定 `SYNC_TOKEN_SECRET` 讓 secret 固定，並告知用戶資料可能遺失，或升級為 [HF Spaces 持久化儲存](https://huggingface.co/docs/hub/spaces-storage)（付費功能，掛載至 `/data`，此時請另設 `SYNC_DATA_DIR=/data`）。

#### 方式 C：Railway / Render / Fly.io 等雲平台

1. 把 `self-hosted-sync-server/` 資料夾上傳到你的 Git repo
2. 在平台上指定這個資料夾為部署根目錄（有 Dockerfile 會自動識別）
3. 設定環境變數（見下方）
4. 取得平台給的公開 URL（如 `https://xxx.railway.app`）

#### 方式 D：VPS / 本機直接跑

```bash
cd self-hosted-sync-server
npm install
node src/server.js
```

預設會監聽 `http://0.0.0.0:3004`

### 步驟 2：在前端填入伺服器網址

打開 Aguaphone 應用程式 → 設定 → 自架同步伺服器，填入：

```
http://你的主機IP:3004
# 或雲平台給的 URL，例如：
https://xxx.railway.app
```

然後注冊帳號即可開始使用。

---

## 環境變數

| 變數 | 說明 | 預設值 |
|---|---|---|
| `PORT` | 監聽 port | `7860`（HF Spaces）/ `3004`（docker-compose）|
| `ADMIN_PASSWORD` | Admin UI 密碼，**務必修改** | `admin` |
| `SYNC_TOKEN_SECRET` | JWT 簽名 secret | 自動生成並存入 data/store.json |
| `SYNC_DATA_DIR` | 資料目錄 | `./data` |
| `SYNC_ACCESS_TOKEN_TTL_SECONDS` | Access token 有效期（秒） | `3600`（1 小時） |
| `SYNC_REFRESH_TOKEN_TTL_SECONDS` | Refresh token 有效期（秒） | `2592000`（30 天） |
| `ADMIN_TOKEN_TTL_SECONDS` | Admin session 有效期（秒） | `28800`（8 小時） |

> **注意**：`SYNC_TOKEN_SECRET` 如果不手動指定，伺服器會在首次啟動時自動生成並存入 `data/store.json`。只要 `data/` 目錄有持久化（volume 掛載），重啟後 secret 不會改變，用戶不需要重新登入。

---

## API 端點

- `GET /` — 伺服器資訊與版本
- `GET /health` — 健康檢查
- `POST /auth/register` — 注冊帳號
- `POST /auth/login` — 登入
- `POST /auth/refresh` — 刷新 token
- `GET /sync/status` — 同步狀態（需 token）
- `GET /sync/meta` — 裝置與同步元資料（需 token）
- `POST /sync/push` — 推送資料（需 token）
- `GET /sync/pull?since=...` — 拉取資料（需 token）
- `GET /sync/ws?token=...` — WebSocket 即時通知
- `GET /admin` — Admin UI（需 ADMIN_PASSWORD）

---

## 儲存方式

資料寫入 `data/store.json`（純 JSON，無需資料庫）。適合個人使用、小型團體、或先打通流程再遷移到更強壯的後端。

---

## 本機開發

```bash
cd self-hosted-sync-server
npm install
node src/server.js
```

Admin UI：`http://127.0.0.1:3004/admin`（預設密碼：`admin`）
