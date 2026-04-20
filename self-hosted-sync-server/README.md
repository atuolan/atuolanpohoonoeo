# Aguaphone Self-Hosted Sync Server

最小可跑的自架同步後端，對齊目前前端的 SelfHostedSync API contract。

## 功能

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /sync/status`
- `POST /sync/push`
- `GET /sync/pull?since=...`

## 啟動

### 本機

```bash
cd self-hosted-sync-server
node src/server.js
```

預設會監聽 `http://127.0.0.1:3004`

### Windows 快速啟動

```powershell
cd self-hosted-sync-server
.\start-server.ps1
```

或指定其他 port：

```powershell
cd self-hosted-sync-server
.\start-server.ps1 -Port 3005
```

也可以用批次檔：

```bat
cd self-hosted-sync-server
start-server.bat 3004
```

### Docker

```bash
docker build -t aguaphone-sync-server ./self-hosted-sync-server
docker run --rm -p 3004:3004 -v %cd%/self-hosted-sync-server/data:/app/data aguaphone-sync-server
```

## 可用環境變數

- `PORT`：預設 `3004`
- `SYNC_DATA_DIR`：預設 `./data`
- `SYNC_ACCESS_TOKEN_TTL_SECONDS`：預設 `3600`
- `SYNC_REFRESH_TOKEN_TTL_SECONDS`：預設 `2592000`
- `SYNC_TOKEN_SECRET`：自訂 token secret，不填時會在首次啟動自動生成並寫入資料檔

## 儲存方式

目前採用 JSON 檔持久化，資料會寫到：

- `data/store.json`

適合本機測試、單機部署與先打通前後端流程。
