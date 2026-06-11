param(
  [string]$Repo = "https://huggingface.co/spaces/lonson0215/aguaphone-sync",
  [string]$SourceDir = "aguaphone-sync-hf-space-root"
)

$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$CommandArguments = @()
  )

  & $FilePath @CommandArguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令失敗：$FilePath $($CommandArguments -join ' ')"
  }
}

$workspace = (Get-Location).Path
$source = Join-Path $workspace $SourceDir
if (-not (Test-Path $source)) {
  throw "找不到本地 HF Space 根目錄：$source"
}
if (-not (Test-Path (Join-Path $source "src\server.js"))) {
  throw "找不到新版 server.js：$(Join-Path $source 'src\server.js')"
}
if (-not (Test-Path (Join-Path $source "src\admin.html"))) {
  throw "找不到 admin.html：$(Join-Path $source 'src\admin.html')"
}

Write-Host "這個腳本會把 $source 的內容部署到 $Repo" -ForegroundColor Cyan
Write-Host "請貼上 Hugging Face WRITE token。輸入時畫面不會顯示，貼上後按 Enter。" -ForegroundColor Yellow
Write-Host "注意：token 必須有 WRITE 權限，而且要能寫入 lonson0215/aguaphone-sync 這個 Space。" -ForegroundColor Yellow
$secureToken = Read-Host "Hugging Face WRITE token" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Token 是空的，已停止。"
}

$encodedToken = [System.Uri]::EscapeDataString($token.Trim())
$authRepo = $Repo -replace "^https://", "https://hf:$encodedToken@"
$tempRoot = Join-Path $env:TEMP ("aguaphone-hf-space-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
  Write-Host "正在 clone HF Space repo..." -ForegroundColor Cyan
  Invoke-CheckedCommand -FilePath git -CommandArguments @("clone", $authRepo, $tempRoot)

  Write-Host "正在覆蓋 HF Space 根目錄檔案..." -ForegroundColor Cyan
  Get-ChildItem -Force $tempRoot | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
  Copy-Item -Path (Join-Path $source "*") -Destination $tempRoot -Recurse -Force

  Push-Location $tempRoot
  try {
    Invoke-CheckedCommand -FilePath git -CommandArguments @("config", "user.name", "Aguaphone Deploy Bot")
    Invoke-CheckedCommand -FilePath git -CommandArguments @("config", "user.email", "deploy@aguaphone.local")
    Invoke-CheckedCommand -FilePath git -CommandArguments @("add", "-A")
    $changes = git status --porcelain

    if (-not $changes) {
      Write-Host "HF Space repo 已經是最新，沒有需要提交的變更。" -ForegroundColor Green
    } else {
      git status --short
      Invoke-CheckedCommand -FilePath git -CommandArguments @("commit", "-m", "Update Aguaphone background generation server")
      Write-Host "正在 push 到 HF Space..." -ForegroundColor Cyan
      Invoke-CheckedCommand -FilePath git -CommandArguments @("push", "origin", "main")
      Write-Host "Push 完成。HF Space 會開始 rebuild。" -ForegroundColor Green
    }
  } finally {
    Pop-Location
  }
} finally {
  $token = $null
  $encodedToken = $null
  $authRepo = $null
  if (Test-Path $tempRoot) {
    Remove-Item -Recurse -Force $tempRoot
  }
}

Write-Host "部署流程完成。請等待 HF Space 顯示 Running，然後打開：" -ForegroundColor Green
Write-Host "https://lonson0215-aguaphone-sync.hf.space/health" -ForegroundColor Cyan
Write-Host "確認 endpoints 裡出現 POST /generate。" -ForegroundColor Green
