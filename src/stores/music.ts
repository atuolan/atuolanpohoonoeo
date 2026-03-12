/**
 * 全局音樂播放器 Store
 * 管理音樂播放狀態、播放列表、當前曲目等
 */
import type { MusicTrack } from "@/api/MusicApi";
import { getLyrics, getMusicUrl, searchMusic } from "@/api/MusicApi";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type PlayMode = "sequence" | "loop" | "single" | "random";

export const useMusicStore = defineStore("music", () => {
  // 播放列表
  const playlist = ref<MusicTrack[]>([]);

  // 當前播放索引
  const currentIndex = ref(-1);

  // 播放狀態
  const isPlaying = ref(false);

  // 當前播放時間（秒）
  const currentTime = ref(0);

  // 總時長（秒）
  const duration = ref(0);

  // 音量 (0-1)
  const volume = ref(0.8);

  // 播放模式
  const playMode = ref<PlayMode>("sequence");

  // 當前歌詞
  const currentLyrics = ref("");

  // 搜索結果
  const searchResults = ref<MusicTrack[]>([]);

  // 搜索中
  const isSearching = ref(false);

  // 搜索關鍵詞
  const searchKeyword = ref("");

  // 播放錯誤通知
  const playError = ref<{ trackName: string; message: string } | null>(null);
  let playErrorTimer: ReturnType<typeof setTimeout> | null = null;

  function showPlayError(trackName: string, message: string) {
    playError.value = { trackName, message };
    if (playErrorTimer) clearTimeout(playErrorTimer);
    playErrorTimer = setTimeout(() => {
      playError.value = null;
    }, 4000);
  }

  function dismissPlayError() {
    playError.value = null;
    if (playErrorTimer) clearTimeout(playErrorTimer);
  }

  // Audio 元素引用
  let audioElement: HTMLAudioElement | null = null;

  // 當前曲目
  const currentTrack = computed(() => {
    if (currentIndex.value >= 0 && currentIndex.value < playlist.value.length) {
      return playlist.value[currentIndex.value];
    }
    return null;
  });

  // 播放進度 (0-100)
  const progress = computed(() => {
    if (duration.value === 0) return 0;
    return (currentTime.value / duration.value) * 100;
  });

  // 初始化 Audio 元素
  function initAudio() {
    if (audioElement) return audioElement;

    audioElement = new Audio();
    audioElement.volume = volume.value;

    audioElement.addEventListener("timeupdate", () => {
      currentTime.value = audioElement?.currentTime || 0;
    });

    audioElement.addEventListener("durationchange", () => {
      duration.value = audioElement?.duration || 0;
    });

    audioElement.addEventListener("ended", () => {
      handleTrackEnd();
    });

    audioElement.addEventListener("error", (e) => {
      console.warn("[Music] Audio error:", e);
      isPlaying.value = false;
    });

    return audioElement;
  }

  // 播放失敗計數（用於避免無限循環）
  let playFailCount = 0;
  const MAX_FAIL_COUNT = 3;

  // 播放指定曲目
  async function play(track?: MusicTrack, index?: number) {
    const audio = initAudio();

    if (track) {
      // 如果傳入了曲目，添加到播放列表並播放
      const existingIndex = playlist.value.findIndex((t) => t.id === track.id);
      if (existingIndex >= 0) {
        currentIndex.value = existingIndex;
      } else {
        playlist.value.push(track);
        currentIndex.value = playlist.value.length - 1;
      }
      playFailCount = 0; // 重置失敗計數
    } else if (typeof index === "number") {
      currentIndex.value = index;
      playFailCount = 0;
    }

    const current = currentTrack.value;
    if (!current) return;

    try {
      // 獲取播放 URL
      const url = await getMusicUrl(current);
      if (!url) {
        console.warn("[Music] 無法獲取播放 URL，嘗試下一首");
        showPlayError(
          `${current.name} - ${current.artist}`,
          "找不到正確版本的播放連結，自動跳過",
        );
        handlePlayError();
        return;
      }

      audio.src = url;

      // 使用 Promise 包裝播放，以便更好地處理錯誤
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("error", onError);
          reject(new Error("Audio load failed"));
        };
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("error", onError);
        audio.load();
      });

      await audio.play();
      isPlaying.value = true;
      playFailCount = 0; // 播放成功，重置計數

      // 異步獲取歌詞（不阻塞播放）
      getLyrics(current).then((lyrics) => {
        currentLyrics.value = lyrics;
      });
    } catch (error) {
      console.warn("[Music] 播放失敗:", error);
      isPlaying.value = false;
      showPlayError(current?.name || "未知曲目", "播放失敗，連結可能已失效");
      handlePlayError();
    }
  }

  // 處理播放錯誤
  function handlePlayError() {
    // 清除當前曲目的 URL，下次播放時會重新獲取
    if (currentTrack.value) {
      currentTrack.value.url = "";
    }

    playFailCount++;
    if (playFailCount < MAX_FAIL_COUNT && playlist.value.length > 1) {
      console.log("[Music] 自動跳到下一首");
      next();
    } else {
      console.warn("[Music] 連續播放失敗，停止嘗試");
      showPlayError(
        currentTrack.value?.name || "未知曲目",
        "連續多首播放失敗，已停止嘗試",
      );
      playFailCount = 0;
    }
  }

  // 暫停
  function pause() {
    if (audioElement) {
      audioElement.pause();
      isPlaying.value = false;
    }
  }

  // 切換播放/暫停
  function togglePlay() {
    if (isPlaying.value) {
      pause();
    } else if (currentTrack.value) {
      audioElement?.play();
      isPlaying.value = true;
    }
  }

  // 上一曲
  function prev() {
    if (playlist.value.length === 0) return;

    if (playMode.value === "random") {
      currentIndex.value = Math.floor(Math.random() * playlist.value.length);
    } else {
      currentIndex.value =
        (currentIndex.value - 1 + playlist.value.length) %
        playlist.value.length;
    }
    play();
  }

  // 下一曲
  function next() {
    if (playlist.value.length === 0) return;

    if (playMode.value === "random") {
      currentIndex.value = Math.floor(Math.random() * playlist.value.length);
    } else {
      currentIndex.value = (currentIndex.value + 1) % playlist.value.length;
    }
    play();
  }

  // 處理曲目結束
  function handleTrackEnd() {
    switch (playMode.value) {
      case "single":
        // 單曲循環 - 清除舊 URL 強制重新獲取
        if (currentTrack.value) {
          currentTrack.value.url = ""; // 清除 URL，強制重新獲取
          play();
        }
        break;
      case "loop":
      case "sequence":
        // 列表循環或順序播放
        next();
        break;
      case "random":
        // 隨機播放
        next();
        break;
    }
  }

  // 跳轉到指定時間
  function seek(time: number) {
    if (audioElement) {
      audioElement.currentTime = time;
      currentTime.value = time;
    }
  }

  // 設置進度 (0-100)
  function setProgress(percent: number) {
    const time = (percent / 100) * duration.value;
    seek(time);
  }

  // 設置音量
  function setVolume(vol: number) {
    volume.value = Math.max(0, Math.min(1, vol));
    if (audioElement) {
      audioElement.volume = volume.value;
    }
  }

  // 切換播放模式
  function togglePlayMode() {
    const modes: PlayMode[] = ["sequence", "loop", "single", "random"];
    const currentModeIndex = modes.indexOf(playMode.value);
    playMode.value = modes[(currentModeIndex + 1) % modes.length];
  }

  // 搜索音樂
  async function search(keyword: string) {
    searchKeyword.value = keyword;
    isSearching.value = true;

    try {
      const results = await searchMusic(keyword);
      searchResults.value = results;

      // 如果是空搜索且沒有結果，載入所有音樂
      if (!keyword.trim() && results.length === 0) {
        const { getAllLocalMusic } = await import("@/api/MusicApi");
        searchResults.value = getAllLocalMusic();
      }
    } catch (error) {
      console.error("搜索失敗:", error);
      searchResults.value = [];
    } finally {
      isSearching.value = false;
    }
  }

  // 添加到播放列表
  function addToPlaylist(track: MusicTrack) {
    const exists = playlist.value.some((t) => t.id === track.id);
    if (!exists) {
      playlist.value.push(track);
    }
  }

  // 從播放列表移除
  function removeFromPlaylist(index: number) {
    if (index < 0 || index >= playlist.value.length) return;

    playlist.value.splice(index, 1);

    // 調整當前索引
    if (index < currentIndex.value) {
      currentIndex.value--;
    } else if (index === currentIndex.value) {
      // 如果移除的是當前播放的曲目
      if (playlist.value.length === 0) {
        currentIndex.value = -1;
        pause();
      } else if (currentIndex.value >= playlist.value.length) {
        currentIndex.value = playlist.value.length - 1;
      }
    }
  }

  // 清空播放列表
  function clearPlaylist() {
    playlist.value = [];
    currentIndex.value = -1;
    pause();
  }

  // 播放全部搜索結果
  function playAll(tracks: MusicTrack[]) {
    playlist.value = [...tracks];
    currentIndex.value = 0;
    play();
  }

  return {
    // 狀態
    playlist,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    playMode,
    currentLyrics,
    searchResults,
    isSearching,
    searchKeyword,
    playError,

    // 計算屬性
    currentTrack,
    progress,

    // 方法
    play,
    pause,
    togglePlay,
    prev,
    next,
    seek,
    setProgress,
    setVolume,
    togglePlayMode,
    search,
    addToPlaylist,
    removeFromPlaylist,
    clearPlaylist,
    playAll,
    dismissPlayError,
  };
});
