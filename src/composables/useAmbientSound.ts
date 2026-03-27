/**
 * 白噪音 / 環境音效 Composable
 * 使用本地音頻檔案循環播放
 */

import { onBeforeUnmount, reactive } from 'vue'

export interface AmbientChannel {
  id: string
  label: string
  emoji: string
  src: string
}

/** 預設音效頻道（對應 public/audio/ambient/ 下的檔案） */
export const AMBIENT_CHANNELS: AmbientChannel[] = [
  { id: 'light-rain', label: '小雨', emoji: '🌦️', src: '/audio/ambient/小雨.mp3' },
  { id: 'heavy-rain', label: '大雨', emoji: '🌧️', src: '/audio/ambient/大雨.mp3' },
  { id: 'window-rain', label: '窗戶雨聲', emoji: '🪟', src: '/audio/ambient/窗戶雨聲.mp3' },
  { id: 'umbrella-rain', label: '雨傘雨聲', emoji: '☂️', src: '/audio/ambient/雨傘雨聲.mp3' },
  { id: 'car-rain', label: '車頂雨聲', emoji: '🚗', src: '/audio/ambient/車頂雨聲.mp3' },
  { id: 'tent-rain', label: '帳篷雨聲', emoji: '⛺', src: '/audio/ambient/帳篷雨聲.mp3' },
  { id: 'leaf-rain', label: '樹葉雨聲', emoji: '🍃', src: '/audio/ambient/樹葉雨聲.mp3' },
  { id: 'thunder', label: '雷聲', emoji: '⛈️', src: '/audio/ambient/雷聲.mp3' },
  { id: 'campfire', label: '營火', emoji: '🔥', src: '/audio/ambient/營火.mp3' },
  { id: 'ocean', label: '海浪', emoji: '🌊', src: '/audio/ambient/海浪.mp3' },
  { id: 'river', label: '河流', emoji: '🏞️', src: '/audio/ambient/河流.mp3' },
  { id: 'waterfall', label: '瀑布', emoji: '💧', src: '/audio/ambient/瀑布.mp3' },
  { id: 'drip', label: '水滴', emoji: '💦', src: '/audio/ambient/水滴.mp3' },
  { id: 'wind', label: '風聲', emoji: '🌬️', src: '/audio/ambient/風聲.mp3' },
  { id: 'howling-wind', label: '呼嘯風聲', emoji: '🌪️', src: '/audio/ambient/呼嘯風聲.mp3' },
  { id: 'tree-wind', label: '樹林風聲', emoji: '🌲', src: '/audio/ambient/樹林風聲.mp3' },
  { id: 'jungle', label: '叢林', emoji: '🦜', src: '/audio/ambient/叢林.mp3' },
  { id: 'snow-walk', label: '雪地行走', emoji: '❄️', src: '/audio/ambient/雪地行走.mp3' },
]

interface ChannelState {
  playing: boolean
  volume: number
}

export function useAmbientSound() {
  const audioElements = new Map<string, HTMLAudioElement>()

  const channels = reactive<Record<string, ChannelState>>(
    Object.fromEntries(AMBIENT_CHANNELS.map(c => [c.id, { playing: false, volume: 0.5 }]))
  )

  function startChannel(channelId: string) {
    const channel = AMBIENT_CHANNELS.find(c => c.id === channelId)
    const state = channels[channelId]
    if (!channel || !state || state.playing) return

    let audio = audioElements.get(channelId)
    if (!audio) {
      audio = new Audio(channel.src)
      audio.loop = true
      audio.preload = 'auto'
      audioElements.set(channelId, audio)
    }
    audio.volume = state.volume
    audio.play().catch(e => console.warn('[Ambient] 播放失敗:', channelId, e))
    state.playing = true
  }

  function stopChannel(channelId: string) {
    const state = channels[channelId]
    if (!state?.playing) return

    const audio = audioElements.get(channelId)
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    state.playing = false
  }

  function toggleChannel(channelId: string) {
    channels[channelId]?.playing ? stopChannel(channelId) : startChannel(channelId)
  }

  function setVolume(channelId: string, volume: number) {
    const v = Math.max(0, Math.min(1, volume))
    const state = channels[channelId]
    if (!state) return
    state.volume = v

    const audio = audioElements.get(channelId)
    if (audio) audio.volume = v
  }

  function stopAll() {
    for (const ch of AMBIENT_CHANNELS) stopChannel(ch.id)
  }

  function isAnyPlaying(): boolean {
    return Object.values(channels).some(c => c.playing)
  }

  onBeforeUnmount(() => {
    stopAll()
    audioElements.forEach(a => { a.pause(); a.src = '' })
    audioElements.clear()
  })

  return { channels, AMBIENT_CHANNELS, toggleChannel, setVolume, stopAll, isAnyPlaying }
}
