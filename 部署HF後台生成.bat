@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo  Aguaphone HF Space 一鍵部署
echo ========================================
echo.
echo 這會把 aguaphone-sync-hf-space-root 的新版伺服器上傳到：
echo https://huggingface.co/spaces/lonson0215/aguaphone-sync
echo.
echo 等一下會要求貼上 Hugging Face WRITE token。
echo 貼上後按 Enter；輸入時不顯示是正常的。
echo.
pause
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-hf-space.ps1
echo.
echo 如果上面顯示 Push 完成，請等待 Hugging Face rebuild。
echo 然後打開：
echo https://lonson0215-aguaphone-sync.hf.space/health
echo 檢查有沒有 POST /generate。
echo.
pause
