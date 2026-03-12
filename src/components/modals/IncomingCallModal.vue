<template>
  <Teleport to="body">
    <div class="incoming-call-overlay" @click.self="handleDecline">
      <div class="incoming-call-container" :class="{ 'is-ending': isEnding }">
        <!-- 背景效果 -->
        <div class="call-background">
          <div
            v-if="pendingCall.characterAvatar"
            class="character-bg-img"
            :style="{ backgroundImage: `url(${pendingCall.characterAvatar})` }"
          ></div>
          <div class="blur-circle c1"></div>
          <div class="blur-circle c2"></div>
          
          <!-- 粒子效果 -->
          <div class="particles">
            <div class="particle" v-for="i in 8" :key="i" :style="{
              '--delay': `${i * 0.2}s`,
              '--x': `${Math.random() * 100}%`,
              '--y': `${Math.random() * 100}%`
            }"></div>
          </div>
        </div>

        <!-- 主內容 -->
        <div class="call-content">
          <!-- 來電標籤 -->
          <div class="incoming-label">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              class="phone-icon ringing"
            >
              <path
                d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
              />
            </svg>
            <span>來電</span>
          </div>

          <!-- 角色頭像 -->
          <div class="avatar-section">
            <div class="avatar-ring pulsing">
              <div class="avatar">
                <img
                  v-if="pendingCall.characterAvatar"
                  :src="pendingCall.characterAvatar"
                  :alt="pendingCall.characterName"
                />
                <div v-else class="avatar-placeholder">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <h2 class="character-name">{{ pendingCall.characterName }}</h2>
            <p class="call-status">{{ statusText }}</p>
          </div>

          <!-- 倒計時提示 -->
          <div v-if="remainingSeconds > 0" class="timeout-hint">
            {{ remainingSeconds }} 秒後自動掛斷
          </div>
        </div>

        <!-- 控制按鈕 -->
        <div class="call-controls">
          <button
            class="control-btn decline"
            @click="handleDecline"
            :disabled="isEnding"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
              />
            </svg>
            <span>拒接</span>
          </button>
          <button
            class="control-btn accept"
            @click="handleAccept"
            :disabled="isEnding"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
              />
            </svg>
            <span>接聽</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useSettingsStore } from "@/stores/settings";
import type { PendingCall } from "@/types/incomingCall";
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  pendingCall: PendingCall;
}>();

const emit = defineEmits<{
  accept: [];
  decline: [];
  missed: [];
}>();

const settingsStore = useSettingsStore();

// 狀態
const isEnding = ref(false);
const remainingSeconds = ref(30);

// 計時器
let timeoutTimer: ReturnType<typeof setInterval> | null = null;

// 來電鈴聲（WebAudio / 自訂音檔）
let ringtoneContext: AudioContext | null = null;
let ringtoneTimer: ReturnType<typeof setInterval> | null = null;
let vibrationTimer: ReturnType<typeof setInterval> | null = null;
let ringtoneAudio: HTMLAudioElement | null = null;

function getEffectiveRingtoneId(): string {
  const selected = settingsStore.incomingCallRingtone.selectedRingtoneId;
  if (
    selected === "custom" &&
    !settingsStore.incomingCallRingtone.customAudioDataUrl
  ) {
    return "classic";
  }
  return selected || "classic";
}

function playPatternChunk(ringtoneId: string, volume: number): void {
  if (!ringtoneContext || ringtoneContext.state === "closed") {
    ringtoneContext = new AudioContext();
  }

  if (ringtoneContext.state === "suspended") {
    void ringtoneContext.resume();
  }

  const now = ringtoneContext.currentTime;
  const gain = ringtoneContext.createGain();
  gain.connect(ringtoneContext.destination);

  const safeVolume = Math.min(1, Math.max(0, volume));
  const baseGain = 0.1 * safeVolume;

  const scheduleTone = (freq: number, start: number, duration: number) => {
    const osc = ringtoneContext!.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  };

  if (ringtoneId === "digital") {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);

    scheduleTone(988, now, 0.14);
    scheduleTone(1318, now + 0.16, 0.14);
    scheduleTone(988, now + 0.34, 0.14);
  } else if (ringtoneId === "soft") {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain * 0.8, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    scheduleTone(523.25, now, 0.28);
    scheduleTone(659.25, now + 0.3, 0.28);
  } else {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    scheduleTone(880, now, 0.2);
    scheduleTone(660, now + 0.22, 0.2);
  }
}

function startRingtone() {
  const ringtoneId = getEffectiveRingtoneId();
  const volume = settingsStore.incomingCallRingtone.volume;

  if (
    ringtoneId === "custom" &&
    settingsStore.incomingCallRingtone.customAudioDataUrl
  ) {
    try {
      ringtoneAudio = new Audio(settingsStore.incomingCallRingtone.customAudioDataUrl);
      ringtoneAudio.volume = Math.min(1, Math.max(0, volume));
      ringtoneAudio.loop = true;
      void ringtoneAudio.play();
    } catch (error) {
      console.warn("[IncomingCallModal] 自訂鈴聲播放失敗，改用內建鈴聲:", error);
    }
  }

  if (!ringtoneAudio) {
    try {
      playPatternChunk(ringtoneId, volume);
      ringtoneTimer = setInterval(() => {
        playPatternChunk(ringtoneId, volume);
      }, 1800);
    } catch (error) {
      console.warn("[IncomingCallModal] 內建鈴聲播放失敗:", error);
    }
  }

  if ("vibrate" in navigator) {
    navigator.vibrate([180, 120, 180]);
    vibrationTimer = setInterval(() => {
      navigator.vibrate([180, 120, 180]);
    }, 1800);
  }
}

function stopRingtone() {
  if (ringtoneTimer) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }

  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio.currentTime = 0;
    ringtoneAudio = null;
  }

  if (vibrationTimer) {
    clearInterval(vibrationTimer);
    vibrationTimer = null;
  }

  if ("vibrate" in navigator) {
    navigator.vibrate(0);
  }

  if (ringtoneContext && ringtoneContext.state !== "closed") {
    void ringtoneContext.close();
  }
  ringtoneContext = null;
}

// 狀態文字
const statusText = computed(() => {
  if (isEnding.value) {
    return "通話結束";
  }
  return "來電中...";
});

// 接聽
function handleAccept() {
  if (isEnding.value) return;
  isEnding.value = true;
  stopTimer();
  stopRingtone();
  emit("accept");
}

// 拒接
function handleDecline() {
  if (isEnding.value) return;
  isEnding.value = true;
  stopTimer();
  stopRingtone();
  emit("decline");
}

// 未接（超時）
function handleMissed() {
  if (isEnding.value) return;
  isEnding.value = true;
  stopTimer();
  stopRingtone();
  emit("missed");
}

// 停止計時器
function stopTimer() {
  if (timeoutTimer) {
    clearInterval(timeoutTimer);
    timeoutTimer = null;
  }
}

// 啟動 30 秒倒計時
onMounted(() => {
  startRingtone();

  timeoutTimer = setInterval(() => {
    remainingSeconds.value--;
    if (remainingSeconds.value <= 0) {
      handleMissed();
    }
  }, 1000);
});

onUnmounted(() => {
  stopTimer();
  stopRingtone();
});
</script>

<style lang="scss" scoped>
.incoming-call-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(20, 20, 40, 0.95) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(10px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(10px);
  }
}

.incoming-call-container {
  position: relative;
  width: 100%;
  max-width: 420px;
  height: auto;
  min-height: 560px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 32px;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 
    0 20px 60px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1px rgba(255, 255, 255, 0.05);

  @media (max-width: 480px) {
    max-width: 100%;
    min-height: 100%;
    border-radius: 0;
    box-shadow: none;
  }

  &.is-ending {
    opacity: 0.7;
    transform: scale(0.95);
    filter: grayscale(0.3);
  }
}

// 背景效果
.call-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;

  .character-bg-img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    opacity: 0.15;
    filter: blur(30px) grayscale(20%) brightness(0.8);
    z-index: 1;
  }

  .blur-circle {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.6;
    z-index: 0;
    mix-blend-mode: overlay;

    &.c1 {
      width: 300px;
      height: 300px;
      background: linear-gradient(135deg, var(--color-primary, #7dd3a8) 0%, #4fd1c7 100%);
      top: -100px;
      left: -80px;
      animation: float1 8s ease-in-out infinite;
    }

    &.c2 {
      width: 250px;
      height: 250px;
      background: linear-gradient(135deg, var(--color-secondary, #f5a9b8) 0%, #f687b3 100%);
      bottom: -80px;
      right: -80px;
      animation: float2 10s ease-in-out infinite;
    }
  }
}

@keyframes float1 {
  0%, 100% {
    transform: translate(0, 0) rotate(0deg);
  }
  33% {
    transform: translate(30px, 20px) rotate(120deg);
  }
  66% {
    transform: translate(-20px, 30px) rotate(240deg);
  }
}

@keyframes float2 {
  0%, 100% {
    transform: translate(0, 0) rotate(0deg);
  }
  33% {
    transform: translate(-25px, -15px) rotate(-120deg);
  }
  66% {
    transform: translate(15px, -25px) rotate(-240deg);
  }
}

// 粒子效果
.particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.particle {
  position: absolute;
  width: 2px;
  height: 2px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  top: var(--y);
  left: var(--x);
  animation: particleFloat 4s ease-in-out infinite;
  animation-delay: var(--delay);
  filter: blur(1px);
}

@keyframes particleFloat {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.3;
  }
  50% {
    transform: translate(calc(var(--x) * 0.1 - 5px), calc(var(--y) * 0.1 - 5px)) scale(1.5);
    opacity: 0.6;
  }
}

// 主內容
.call-content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
}

// 來電標籤
.incoming-label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.05) 100%);
  border-radius: 24px;
  margin-bottom: 40px;
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.5px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);

  .phone-icon {
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 0 8px rgba(125, 211, 168, 0.4));

    &.ringing {
      animation: ring 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }
  }
}

@keyframes ring {
  0%, 100% {
    transform: rotate(0deg) scale(1);
  }
  10% {
    transform: rotate(20deg) scale(1.1);
  }
  20% {
    transform: rotate(-20deg) scale(1.1);
  }
  30% {
    transform: rotate(20deg) scale(1.1);
  }
  40% {
    transform: rotate(-20deg) scale(1.1);
  }
  50% {
    transform: rotate(0deg) scale(1);
  }
}

// 頭像區域
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
}

.avatar-ring {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  padding: 6px;
  background: linear-gradient(
    135deg,
    var(--color-primary, #7dd3a8) 0%,
    var(--color-secondary, #f5a9b8) 50%,
    #667eea 100%
  );
  margin-bottom: 24px;
  position: relative;
  z-index: 1;
  box-shadow: 
    0 0 40px rgba(125, 211, 168, 0.3),
    0 0 80px rgba(245, 169, 184, 0.2),
    0 0 120px rgba(102, 126, 234, 0.1);

  &.pulsing {
    animation: pulse 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    
    &::before {
      content: '';
      position: absolute;
      top: -10px;
      left: -10px;
      right: -10px;
      bottom: -10px;
      border-radius: 50%;
      background: linear-gradient(135deg, 
        rgba(125, 211, 168, 0.3) 0%,
        rgba(245, 169, 184, 0.3) 50%,
        rgba(102, 126, 234, 0.3) 100%
      );
      z-index: -1;
      animation: pulseOuter 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      filter: blur(10px);
    }
  }
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 
      0 0 0 0 rgba(125, 211, 168, 0.4),
      0 0 0 0 rgba(245, 169, 184, 0.3),
      0 0 0 0 rgba(102, 126, 234, 0.2);
  }
  50% {
    box-shadow: 
      0 0 0 20px rgba(125, 211, 168, 0),
      0 0 0 40px rgba(245, 169, 184, 0),
      0 0 0 60px rgba(102, 126, 234, 0);
  }
}

@keyframes pulseOuter {
  0%, 100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 0.2;
    transform: scale(1.1);
  }
}

.avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%);
  border: 2px solid rgba(255, 255, 255, 0.1);
  box-shadow: 
    inset 0 0 20px rgba(0, 0, 0, 0.3),
    0 8px 32px rgba(0, 0, 0, 0.4);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }

  &:hover img {
    transform: scale(1.05);
  }
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);

  svg {
    width: 60%;
    height: 60%;
    color: rgba(255, 255, 255, 0.6);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }
}

.character-name {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  background: linear-gradient(
    135deg,
    #fff 0%,
    rgba(255, 255, 255, 0.9) 25%,
    rgba(255, 255, 255, 0.8) 50%,
    rgba(255, 255, 255, 0.9) 75%,
    #fff 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
  animation: textShine 3s ease-in-out infinite;
}

@keyframes textShine {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.call-status {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  font-weight: 400;
  letter-spacing: 0.3px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

// 倒計時提示
.timeout-hint {
  margin-top: 28px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  animation: fadeInOut 2s ease-in-out infinite;
}

@keyframes fadeInOut {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

// 控制按鈕
.call-controls {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  gap: 60px;
  padding: 40px 32px 56px;
}

.control-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none !important;
  }

  svg {
    width: 30px;
    height: 30px;
    color: #fff;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
  }

  span {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
    letter-spacing: 0.3px;
    transition: all 0.3s ease;
  }

  &.decline {
    svg {
      width: 72px;
      height: 72px;
      padding: 20px;
      background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
      border-radius: 50%;
      transform: rotate(135deg);
      box-shadow: 
        0 8px 24px rgba(229, 62, 62, 0.3),
        inset 0 2px 4px rgba(255, 255, 255, 0.1);
    }

    &:hover:not(:disabled) {
      transform: translateY(-4px);

      svg {
        background: linear-gradient(135deg, #c53030 0%, #9b2c2c 100%);
        box-shadow: 
          0 12px 32px rgba(229, 62, 62, 0.4),
          inset 0 2px 4px rgba(255, 255, 255, 0.1);
        transform: rotate(135deg) scale(1.05);
      }

      span {
        color: #fff;
        text-shadow: 0 0 8px rgba(229, 62, 62, 0.5);
      }
    }

    &:active:not(:disabled) svg {
      transform: rotate(135deg) scale(0.95);
      box-shadow: 
        0 4px 16px rgba(229, 62, 62, 0.3),
        inset 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  }

  &.accept {
    svg {
      width: 72px;
      height: 72px;
      padding: 20px;
      background: linear-gradient(135deg, #38a169 0%, #2f855a 100%);
      border-radius: 50%;
      box-shadow: 
        0 8px 24px rgba(56, 161, 105, 0.3),
        inset 0 2px 4px rgba(255, 255, 255, 0.1);
    }

    &:hover:not(:disabled) {
      transform: translateY(-4px);

      svg {
        background: linear-gradient(135deg, #2f855a 0%, #276749 100%);
        box-shadow: 
          0 12px 32px rgba(56, 161, 105, 0.4),
          inset 0 2px 4px rgba(255, 255, 255, 0.1);
        transform: scale(1.05);
      }

      span {
        color: #fff;
        text-shadow: 0 0 8px rgba(56, 161, 105, 0.5);
      }
    }

    &:active:not(:disabled) svg {
      transform: scale(0.95);
      box-shadow: 
        0 4px 16px rgba(56, 161, 105, 0.3),
        inset 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  }
}

// 添加光暈效果
.incoming-call-container::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120%;
  height: 120%;
  background: radial-gradient(
    circle at center,
    rgba(125, 211, 168, 0.1) 0%,
    rgba(245, 169, 184, 0.05) 30%,
    transparent 70%
  );
  z-index: -1;
  pointer-events: none;
  animation: glow 4s ease-in-out infinite;
}

@keyframes glow {
  0%, 100% {
    opacity: 0.5;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(1.05);
  }
}
</style>
