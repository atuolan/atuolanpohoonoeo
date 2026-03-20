#!/usr/bin/env python3
"""
Qwen3-TTS Local Voice Synthesis Service
HTTP API (OpenAI compatible) + Web Debug UI

Start:
  python server.py
  python server.py --port 7860
  python server.py --cn-mirror
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import traceback
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import Response, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

# ── Absolute paths based on script location ──
SCRIPT_DIR = Path(__file__).resolve().parent
VOICES_DIR = SCRIPT_DIR / "voices"
OUTPUTS_DIR = SCRIPT_DIR / "outputs"

model = None
model_loaded = False


def ensure_dirs():
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)


# ── Model Loading ──

def load_model(model_id="Qwen/Qwen3-TTS-12Hz-0.6B-Base", local_files_only=False):
    global model, model_loaded
    try:
        from qwen_tts import Qwen3TTSModel
    except ImportError:
        from qwen_tts.model import Qwen3TTSModel
    print("[info] loading model...", file=sys.stderr)
    try:
        model = Qwen3TTSModel.from_pretrained(model_id, local_files_only=local_files_only)
    except TypeError:
        model = Qwen3TTSModel.from_pretrained(model_id)
    model_loaded = True
    print("[info] model ready!", file=sys.stderr)


# ── Synthesis Core ──
# 0.6B Base model ONLY supports generate_voice_clone
# All synthesis MUST have ref_audio + ref_text

def synthesize(text: str, ref_audio: str | None = None,
               ref_text: str | None = None,
               language: str = "auto",
               temperature: float = 0.7,
               top_k: int = 30,
               top_p: float = 0.9,
               repetition_penalty: float = 1.3) -> bytes:
    import soundfile as sf
    import numpy as np

    if not model_loaded or model is None:
        raise RuntimeError("Model not loaded")

    if not ref_audio or not ref_text:
        raise RuntimeError(
            "請先選擇一個音色！0.6B Base 模型必須使用參考音頻進行語音克隆。"
            "請在右側「音色製作工坊」上傳參考音頻並製作音色，然後在左側選擇該音色後再合成。"
        )

    ref_audio_path = Path(ref_audio)
    if not ref_audio_path.exists():
        raise RuntimeError(f"Reference audio file not found: {ref_audio}")

    # Load reference audio as numpy array to bypass librosa's NoBackendError.
    # qwen_tts accepts (np.ndarray, sr) tuple as AudioLike input.
    ref_wav_data, ref_sr = sf.read(str(ref_audio_path), dtype="float32", always_2d=False)
    if ref_wav_data.ndim > 1:
        ref_wav_data = np.mean(ref_wav_data, axis=-1)

    print(f"[synth] text={text[:50]!r}, temp={temperature}, top_k={top_k}, top_p={top_p}, rep_pen={repetition_penalty}", file=sys.stderr)

    wavs, sr = model.generate_voice_clone(
        text=text,
        language=language,
        ref_audio=(ref_wav_data, ref_sr),
        ref_text=ref_text,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        repetition_penalty=repetition_penalty,
    )

    audio = wavs[0] if isinstance(wavs, (list, tuple)) else wavs
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV")
    return buf.getvalue()


# ── Voice Management ──

def list_voices() -> list[str]:
    if not VOICES_DIR.exists():
        return []
    names = set()
    for f in VOICES_DIR.iterdir():
        if f.suffix == ".wav":
            txt = VOICES_DIR / f"{f.stem}.txt"
            if txt.exists():
                names.add(f.stem)
    return sorted(names)


def _convert_to_wav(audio_bytes: bytes) -> bytes:
    """Convert any audio format to 16kHz mono WAV using ffmpeg (via imageio_ffmpeg)."""
    # Check if already WAV
    if audio_bytes[:4] == b"RIFF":
        return audio_bytes
    try:
        import imageio_ffmpeg
        import subprocess
        import tempfile
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as tmp_in:
            tmp_in.write(audio_bytes)
            tmp_in_path = tmp_in.name
        tmp_out_path = tmp_in_path + ".wav"
        try:
            r = subprocess.run(
                [ffmpeg, "-y", "-i", tmp_in_path, "-ar", "16000", "-ac", "1", "-f", "wav", tmp_out_path],
                capture_output=True, timeout=30,
            )
            if r.returncode == 0 and Path(tmp_out_path).exists():
                return Path(tmp_out_path).read_bytes()
        finally:
            Path(tmp_in_path).unlink(missing_ok=True)
            Path(tmp_out_path).unlink(missing_ok=True)
    except ImportError:
        pass
    # Fallback: return as-is and hope soundfile can handle it
    return audio_bytes


def save_voice_ref(name: str, audio_bytes: bytes, ref_text: str):
    wav_bytes = _convert_to_wav(audio_bytes)
    wav_path = VOICES_DIR / f"{name}.wav"
    wav_path.write_bytes(wav_bytes)
    txt_path = VOICES_DIR / f"{name}.txt"
    txt_path.write_text(ref_text, encoding="utf-8")


def _resolve_voice(voice: str) -> tuple[str | None, str | None]:
    """Given a voice name, return (ref_audio_path, ref_text) or (None, None)."""
    if not voice:
        return None, None
    ref_wav = VOICES_DIR / f"{voice}.wav"
    ref_txt = VOICES_DIR / f"{voice}.txt"
    print(f"[voice] name={voice}, wav={ref_wav} exists={ref_wav.exists()}, txt={ref_txt} exists={ref_txt.exists()}", file=sys.stderr)
    if ref_wav.exists() and ref_txt.exists():
        spk_audio = str(ref_wav)
        spk_text = ref_txt.read_text(encoding="utf-8").strip()
        return spk_audio, spk_text
    return None, None


# ── FastAPI App ──

def create_app():
    app = FastAPI(title="Qwen3-TTS")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/v1/audio/speech")
    async def openai_speech(request: Request):
        """OpenAI-compatible TTS endpoint"""
        if not model_loaded:
            raise HTTPException(503, "Model not loaded")
        body = await request.json()
        text = body.get("input", "")
        voice = body.get("voice", "")
        if not text:
            raise HTTPException(400, "Missing input")

        spk_audio, spk_text = _resolve_voice(voice)

        try:
            wav_bytes = synthesize(
                text=text,
                ref_audio=spk_audio,
                ref_text=spk_text,
                language=body.get("language", "auto"),
                temperature=float(body.get("temperature", 0.7)),
                top_k=int(body.get("top_k", 30)),
                top_p=float(body.get("top_p", 0.9)),
                repetition_penalty=float(body.get("repetition_penalty", 1.3)),
            )
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(500, str(e))

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=speech.wav"},
        )

    @app.post("/api/tts")
    async def api_tts(request: Request):
        """Native TTS endpoint with full params"""
        if not model_loaded:
            raise HTTPException(503, "Model not loaded")
        body = await request.json()
        text = body.get("text", "")
        if not text:
            raise HTTPException(400, "Missing text")

        voice = body.get("voice", "")
        language = body.get("language", "auto")
        spk_audio, spk_text = _resolve_voice(voice)

        try:
            wav_bytes = synthesize(
                text=text,
                ref_audio=spk_audio,
                ref_text=spk_text,
                language=language,
                temperature=float(body.get("temperature", 0.7)),
                top_k=int(body.get("top_k", 30)),
                top_p=float(body.get("top_p", 0.9)),
                repetition_penalty=float(body.get("repetition_penalty", 1.3)),
            )
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(500, str(e))

        return Response(content=wav_bytes, media_type="audio/wav")

    @app.get("/api/voices")
    async def get_voices():
        return {"voices": list_voices()}

    @app.post("/api/voices/clone")
    async def clone_voice(
        name: str = Form(...),
        ref_text: str = Form(...),
        audio: UploadFile = File(...),
    ):
        if not model_loaded:
            raise HTTPException(503, "Model not loaded")
        if not name.strip():
            raise HTTPException(400, "Name required")
        if not ref_text.strip():
            raise HTTPException(400, "Reference text required")
        audio_bytes = await audio.read()
        try:
            save_voice_ref(name.strip(), audio_bytes, ref_text.strip())
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(500, str(e))
        return {"success": True, "voice": name.strip()}

    @app.delete("/api/voices/{name}")
    async def delete_voice(name: str):
        deleted = False
        for ext in [".wav", ".txt"]:
            p = VOICES_DIR / f"{name}{ext}"
            if p.exists():
                p.unlink()
                deleted = True
        if not deleted:
            raise HTTPException(404, "Voice not found")
        return {"success": True}

    @app.get("/api/test-tts")
    async def test_tts():
        """Quick test - uses first available voice"""
        try:
            voices = list_voices()
            print(f"[test-tts] voices_dir={VOICES_DIR}, voices={voices}", file=sys.stderr)
            if not voices:
                return {"success": False, "error": "No voices available. Upload one first.", "voices_dir": str(VOICES_DIR)}
            voice = voices[0]
            spk_audio, spk_text = _resolve_voice(voice)
            print(f"[test-tts] using voice={voice}, spk_audio={spk_audio}, spk_text={spk_text!r}", file=sys.stderr)
            wav_bytes = synthesize(text="Hello, this is a test.", ref_audio=spk_audio, ref_text=spk_text)
            return {"success": True, "size": len(wav_bytes), "voice_used": voice}
        except Exception as e:
            traceback.print_exc()
            return {"success": False, "error": repr(e), "type": type(e).__name__}

    @app.get("/api/status")
    async def status():
        gpu_info = None
        try:
            import torch
            if torch.cuda.is_available():
                gpu_info = {
                    "name": torch.cuda.get_device_name(0),
                    "memory_total": f"{torch.cuda.get_device_properties(0).total_mem / 1024**3:.1f}GB",
                    "memory_used": f"{torch.cuda.memory_allocated(0) / 1024**3:.1f}GB",
                }
        except Exception:
            pass
        return {"model_loaded": model_loaded, "gpu": gpu_info, "voices": list_voices()}

    @app.get("/", response_class=HTMLResponse)
    async def web_ui():
        return WEB_PAGE

    return app


# ── Web Debug Page ──

WEB_PAGE = r"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Qwen3-TTS 語音合成服務</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f5f5f5; color: #333; min-height: 100vh;
}
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white; padding: 24px; text-align: center;
}
.header h1 { font-size: 24px; margin-bottom: 4px; }
.header p { opacity: 0.85; font-size: 14px; }
.status-bar {
  background: #fff; border-bottom: 1px solid #e0e0e0;
  padding: 12px 24px; display: flex; align-items: center; gap: 16px; font-size: 13px;
}
.status-dot { width: 10px; height: 10px; border-radius: 50%; }
.status-dot.ok { background: #4caf50; }
.status-dot.loading { background: #ff9800; animation: pulse 1s infinite; }
.status-dot.error { background: #f44336; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.container {
  max-width: 1100px; margin: 0 auto; padding: 24px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
}
@media (max-width: 768px) { .container { grid-template-columns: 1fr; } }
.card {
  background: #fff; border-radius: 12px; padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.card h2 { font-size: 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #666; margin-bottom: 6px; font-weight: 500; }
.form-group textarea, .form-group input, .form-group select {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px;
  font-size: 14px; transition: border-color 0.2s;
}
.form-group textarea:focus, .form-group input:focus, .form-group select:focus {
  outline: none; border-color: #667eea;
}
.form-group textarea { resize: vertical; min-height: 80px; }
.btn {
  padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px;
  cursor: pointer; transition: all 0.2s; font-weight: 500;
}
.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white; width: 100%;
}
.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-danger { background: #f44336; color: white; }
.audio-player { margin-top: 12px; width: 100%; }
.audio-player audio { width: 100%; }
.voice-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.voice-chip {
  padding: 6px 14px; background: #f0f0f0; border-radius: 20px;
  font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;
  transition: all 0.2s; border: 2px solid transparent;
}
.voice-chip:hover { background: #e8e8ff; }
.voice-chip.active { border-color: #667eea; background: #f0f0ff; }
.voice-chip .delete-btn { color: #999; font-size: 16px; line-height: 1; }
.voice-chip .delete-btn:hover { color: #f44336; }
.upload-area {
  border: 2px dashed #ddd; border-radius: 8px; padding: 24px;
  text-align: center; cursor: pointer; transition: all 0.2s;
}
.upload-area:hover { border-color: #667eea; background: #fafafe; }
.upload-area.dragover { border-color: #667eea; background: #f0f0ff; }
.spinner {
  display: inline-block; width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.toast {
  position: fixed; bottom: 24px; right: 24px; padding: 12px 20px;
  background: #333; color: white; border-radius: 8px; font-size: 14px;
  opacity: 0; transition: opacity 0.3s; z-index: 100;
}
.toast.show { opacity: 1; }
.api-info {
  background: #f8f8f8; border-radius: 8px; padding: 16px;
  font-size: 13px; margin-top: 16px;
}
.api-info code {
  background: #e8e8e8; padding: 2px 6px; border-radius: 4px;
  font-family: 'Consolas', monospace; font-size: 12px;
}
.range-row { display: flex; align-items: center; gap: 12px; }
.range-row input[type=range] { flex: 1; }
.range-row .range-val { min-width: 36px; text-align: center; font-size: 13px; }
</style>
</head>
<body>

<div class="header">
  <h1>&#127908; Qwen3-TTS 語音合成服務</h1>
  <p>本地語音合成 &middot; 音色克隆 &middot; OpenAI 兼容 API</p>
</div>

<div class="status-bar">
  <span class="status-dot loading" id="statusDot"></span>
  <span id="statusText">正在檢查服務狀態...</span>
  <span style="margin-left:auto" id="gpuInfo"></span>
</div>

<div class="container">
  <!-- Left: TTS Test -->
  <div class="card">
    <h2>&#128266; 試聽實驗室</h2>

    <div class="form-group">
      <label>選擇音色（必選，0.6B Base 模型需要參考音頻）</label>
      <select id="voiceSelect">
        <option value="">-- 請先製作或選擇音色 --</option>
      </select>
    </div>

    <div class="form-group">
      <label>語速 (Speed)</label>
      <div class="range-row">
        <span>0.5</span>
        <input type="range" id="speedRange" min="0.5" max="2.0" step="0.1" value="1.0">
        <span>2.0</span>
        <span class="range-val" id="speedVal">1.0</span>
      </div>
    </div>

    <details style="margin-bottom:16px">
      <summary style="cursor:pointer;font-size:13px;color:#667eea;font-weight:500">&#9881; 進階參數（防結巴調整）</summary>
      <div style="margin-top:12px">
        <div class="form-group">
          <label>Temperature（越低越穩定，越高越有變化）</label>
          <div class="range-row">
            <span>0.1</span>
            <input type="range" id="tempRange" min="0.1" max="1.5" step="0.05" value="0.7">
            <span>1.5</span>
            <span class="range-val" id="tempVal">0.7</span>
          </div>
        </div>
        <div class="form-group">
          <label>Repetition Penalty（越高越不容易結巴重複）</label>
          <div class="range-row">
            <span>1.0</span>
            <input type="range" id="repPenRange" min="1.0" max="2.0" step="0.05" value="1.3">
            <span>2.0</span>
            <span class="range-val" id="repPenVal">1.3</span>
          </div>
        </div>
        <div class="form-group">
          <label>Top-K（候選詞數量，越小越集中）</label>
          <div class="range-row">
            <span>1</span>
            <input type="range" id="topKRange" min="1" max="100" step="1" value="30">
            <span>100</span>
            <span class="range-val" id="topKVal">30</span>
          </div>
        </div>
        <div class="form-group">
          <label>Top-P（累積概率截斷）</label>
          <div class="range-row">
            <span>0.1</span>
            <input type="range" id="topPRange" min="0.1" max="1.0" step="0.05" value="0.9">
            <span>1.0</span>
            <span class="range-val" id="topPVal">0.9</span>
          </div>
        </div>
      </div>
    </details>

    <div class="form-group">
      <label>測試文本</label>
      <textarea id="ttsText" placeholder="輸入要合成的文字...">你好，歡迎使用本地語音合成服務。這是一段測試語音。</textarea>
    </div>

    <button class="btn btn-primary" id="synthesizeBtn" onclick="doSynthesize()">
      &#127925; 立即合成
    </button>

    <div class="audio-player" id="audioPlayer" style="display:none">
      <audio id="audioEl" controls></audio>
    </div>

    <div class="api-info">
      <strong>API 接入資訊</strong><br><br>
      OpenAI 兼容: <code>POST /v1/audio/speech</code><br>
      原生接口: <code>POST /api/tts</code><br>
      音色列表: <code>GET /api/voices</code><br><br>
      在小手機中填入本機地址即可使用，無需 API Key。<br>
      例如: <code id="apiUrlExample">http://localhost:7860</code>
    </div>
  </div>

  <!-- Right: Voice Clone -->
  <div class="card">
    <h2>&#127908; 音色製作工坊</h2>
    <p style="font-size:13px;color:#888;margin-bottom:16px">
      上傳一段 3-10 秒的清晰人聲，即可克隆出獨一無二的音色。
    </p>

    <div class="upload-area" id="uploadArea" onclick="document.getElementById('audioFile').click()">
      <input type="file" id="audioFile" accept="audio/*" style="display:none" onchange="handleFileSelect(event)">
      <div id="uploadLabel">&#128228; 點擊上傳音頻素材<br><small>支援 WAV / MP3 / FLAC</small></div>
      <div id="uploadPreview" style="display:none">
        <audio id="refAudioEl" controls style="width:100%"></audio>
      </div>
    </div>

    <div class="form-group" style="margin-top:16px">
      <label>參考文本（音頻對應的文字內容，越準確效果越好）</label>
      <textarea id="refText" placeholder="輸入參考音頻對應的文字內容..."></textarea>
    </div>

    <div class="form-group">
      <label>音色命名（必填）</label>
      <input type="text" id="voiceName" placeholder="例如：溫柔女聲">
    </div>

    <button class="btn btn-primary" id="cloneBtn" onclick="doClone()">
      &#127912; 開始製作音色
    </button>

    <div style="margin-top:20px">
      <h3 style="font-size:15px;margin-bottom:8px">已保存的音色</h3>
      <div class="voice-list" id="voiceList">
        <span style="color:#999;font-size:13px">暫無音色</span>
      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const BASE = window.location.origin;
let currentVoices = [];

document.getElementById('apiUrlExample').textContent = BASE;

// Speed slider
const speedRange = document.getElementById('speedRange');
const speedVal = document.getElementById('speedVal');
speedRange.addEventListener('input', () => { speedVal.textContent = speedRange.value; });

// Advanced param sliders
const tempRange = document.getElementById('tempRange');
const tempVal = document.getElementById('tempVal');
tempRange.addEventListener('input', () => { tempVal.textContent = tempRange.value; });

const repPenRange = document.getElementById('repPenRange');
const repPenVal = document.getElementById('repPenVal');
repPenRange.addEventListener('input', () => { repPenVal.textContent = repPenRange.value; });

const topKRange = document.getElementById('topKRange');
const topKVal = document.getElementById('topKVal');
topKRange.addEventListener('input', () => { topKVal.textContent = topKRange.value; });

const topPRange = document.getElementById('topPRange');
const topPVal = document.getElementById('topPVal');
topPRange.addEventListener('input', () => { topPVal.textContent = topPRange.value; });

// Status check — preserves voice select value
async function checkStatus() {
  try {
    const r = await fetch(BASE + '/api/status');
    const d = await r.json();
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusText');
    const gpu = document.getElementById('gpuInfo');
    if (d.model_loaded) {
      dot.className = 'status-dot ok';
      txt.textContent = '模型已就緒';
    } else {
      dot.className = 'status-dot loading';
      txt.textContent = '模型載入中...';
    }
    if (d.gpu) {
      gpu.textContent = '\uD83D\uDDA5 ' + d.gpu.name + ' (' + d.gpu.memory_total + ')';
    }
    currentVoices = d.voices || [];
    renderVoices();
  } catch(e) {
    document.getElementById('statusDot').className = 'status-dot error';
    document.getElementById('statusText').textContent = '服務連接失敗';
  }
}

function renderVoices() {
  const sel = document.getElementById('voiceSelect');
  const list = document.getElementById('voiceList');

  // ★ KEY FIX: preserve current selection across status polling
  const prevVal = sel.value;

  sel.innerHTML = '<option value="">-- 請先製作或選擇音色 --</option>';
  currentVoices.forEach(v => {
    sel.innerHTML += '<option value="' + v + '">' + v + '</option>';
  });

  // Restore previous selection if it still exists
  if (prevVal && currentVoices.includes(prevVal)) {
    sel.value = prevVal;
  }

  // Update chip list
  if (currentVoices.length === 0) {
    list.innerHTML = '<span style="color:#999;font-size:13px">暫無音色</span>';
  } else {
    list.innerHTML = currentVoices.map(v =>
      '<div class="voice-chip' + (sel.value === v ? ' active' : '') + '" onclick="selectVoice(\'' + v + '\')">' +
      '<span>' + v + '</span>' +
      '<span class="delete-btn" onclick="event.stopPropagation();deleteVoice(\'' + v + '\')">×</span>' +
      '</div>'
    ).join('');
  }
}

function selectVoice(name) {
  document.getElementById('voiceSelect').value = name;
  renderVoices();
  showToast('已選擇音色: ' + name);
}

async function deleteVoice(name) {
  if (!confirm('確定刪除音色「' + name + '」？')) return;
  try {
    await fetch(BASE + '/api/voices/' + name, { method: 'DELETE' });
    showToast('已刪除: ' + name);
    checkStatus();
  } catch(e) { showToast('刪除失敗'); }
}

// Synthesize
async function doSynthesize() {
  const text = document.getElementById('ttsText').value.trim();
  const voice = document.getElementById('voiceSelect').value;
  if (!text) { showToast('請輸入文字'); return; }
  if (!voice) { showToast('請先選擇一個音色！0.6B 模型必須使用參考音頻。'); return; }

  const btn = document.getElementById('synthesizeBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 合成中...';
  try {
    const body = {
      input: text, voice: voice, speed: parseFloat(speedRange.value),
      temperature: parseFloat(tempRange.value),
      top_k: parseInt(topKRange.value),
      top_p: parseFloat(topPRange.value),
      repetition_penalty: parseFloat(repPenRange.value)
    };
    const r = await fetch(BASE + '/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const e = await r.json();
      throw new Error(e.detail || 'Synthesis failed');
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const player = document.getElementById('audioPlayer');
    const audio = document.getElementById('audioEl');
    audio.src = url;
    player.style.display = 'block';
    audio.play();
    showToast('合成完成！');
  } catch(e) {
    showToast('合成失敗: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '&#127925; 立即合成';
  }
}

// File upload
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('uploadLabel').style.display = 'none';
  const preview = document.getElementById('uploadPreview');
  preview.style.display = 'block';
  document.getElementById('refAudioEl').src = URL.createObjectURL(file);
}

// Drag & drop
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) {
    document.getElementById('audioFile').files = e.dataTransfer.files;
    handleFileSelect({ target: { files: e.dataTransfer.files } });
  }
});

// Clone voice
async function doClone() {
  const file = document.getElementById('audioFile').files[0];
  const refText = document.getElementById('refText').value.trim();
  const name = document.getElementById('voiceName').value.trim();
  if (!file) { showToast('請上傳音頻檔案'); return; }
  if (!name) { showToast('請輸入音色名稱'); return; }
  if (!refText) { showToast('請輸入參考文本'); return; }

  const btn = document.getElementById('cloneBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 製作中...';
  try {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('ref_text', refText);
    fd.append('audio', file);
    const r = await fetch(BASE + '/api/voices/clone', { method: 'POST', body: fd });
    if (!r.ok) {
      const e = await r.json();
      throw new Error(e.detail || 'Clone failed');
    }
    showToast('音色「' + name + '」製作完成！');
    // Auto-select the newly created voice
    await checkStatus();
    document.getElementById('voiceSelect').value = name;
    renderVoices();
  } catch(e) {
    showToast('製作失敗: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '&#127912; 開始製作音色';
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// Init
checkStatus();
setInterval(checkStatus, 10000);
</script>
</body>
</html>"""


# ── Main Entry ──

def main():
    parser = argparse.ArgumentParser(description="Qwen3-TTS Local Voice Service")
    parser.add_argument("--port", type=int, default=7860, help="Server port (default: 7860)")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--model-id", default="Qwen/Qwen3-TTS-12Hz-0.6B-Base")
    parser.add_argument("--cn-mirror", action="store_true", help="Use China HF mirror")
    parser.add_argument("--local-files-only", action="store_true", help="Offline mode")
    parser.add_argument("--cache-dir", help="Model cache directory")
    parser.add_argument("--http-proxy", help="HTTP proxy")
    parser.add_argument("--https-proxy", help="HTTPS proxy")
    args = parser.parse_args()

    # Proxy
    if args.http_proxy:
        os.environ["http_proxy"] = args.http_proxy
        os.environ["HTTP_PROXY"] = args.http_proxy
    if args.https_proxy:
        os.environ["https_proxy"] = args.https_proxy
        os.environ["HTTPS_PROXY"] = args.https_proxy
    if args.cn_mirror:
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
    if args.cache_dir:
        cache = str(Path(args.cache_dir).expanduser().resolve())
        os.environ["HF_HOME"] = cache
        os.environ["HUGGINGFACE_HUB_CACHE"] = str(Path(cache) / "hub")

    ensure_dirs()

    print(f"[info] Starting Qwen3-TTS service on {args.host}:{args.port}", file=sys.stderr)
    load_model(args.model_id, args.local_files_only)

    import uvicorn
    app = create_app()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
