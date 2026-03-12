/**
 * 音樂 API 整合服務
 * 使用外部 Music.js API (https://drive.baibai.cv/f/ZKEBuW/Music.js)
 * 以及 QQ 音樂搜索 API (https://api.vkeys.cn)
 */

// 聲明全局 Music 對象類型
declare global {
  interface Window {
    Music?: {
      SearchMusic: (name: string) => Promise<MusicSearchResult | null>;
    };
  }
}

// API 返回的結果類型
interface MusicSearchResult {
  Url: string;
  Cover: string;
  Name: string;
  Singer: string;
  Source: string;
  Lyric: string;
}

// QQ 音樂歌曲搜索 API 返回類型 (search/song)
interface QQMusicSongSearchResponse {
  code: number;
  data?: {
    list?: Array<{
      songID: number;
      songMID: string;
      mediaMid: string;
      title: string;
      album: string;
      singer: string;
      cover: string;
      interval: number; // 時長（秒）
      pay: string;
    }>;
    meta?: {
      total: number;
      nextPage: number;
      perPage: number;
    };
  };
}

// QQ 音樂播放鏈接 API 返回類型 (song/link)
interface QQMusicLinkResponse {
  code: number;
  message: string;
  data?: {
    id: number;
    mid: string;
    song: string;
    singer: string;
    cover: string;
    url: string;
    quality: string;
    interval: string;
  };
}

export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  album?: string;
  url: string;
  cover?: string;
  lrc?: string;
  duration?: number;
  source: string;
}

export interface SearchResult {
  tracks: MusicTrack[];
  source: string;
  error?: string;
}

// 本地音樂數據庫（用於搜索建議和離線模式）
const LOCAL_MUSIC_DB: MusicTrack[] = [
  // 毛不易
  {
    id: "mby_1",
    name: "平凡的一天",
    artist: "毛不易",
    album: "平凡的一天",
    duration: 276,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "mby_2",
    name: "像我這樣的人",
    artist: "毛不易",
    album: "巨星不易工作室",
    duration: 258,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "mby_3",
    name: "消愁",
    artist: "毛不易",
    album: "巨星不易工作室",
    duration: 285,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "mby_4",
    name: "借",
    artist: "毛不易",
    album: "小王",
    duration: 267,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "mby_5",
    name: "盛夏",
    artist: "毛不易",
    album: "盛夏",
    duration: 243,
    url: "",
    cover: "",
    source: "local",
  },

  // 周杰倫
  {
    id: "zjl_1",
    name: "晴天",
    artist: "周杰倫",
    album: "葉惠美",
    duration: 269,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "zjl_2",
    name: "稻香",
    artist: "周杰倫",
    album: "魔杰座",
    duration: 223,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "zjl_3",
    name: "七里香",
    artist: "周杰倫",
    album: "七里香",
    duration: 299,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "zjl_4",
    name: "告白氣球",
    artist: "周杰倫",
    album: "周杰倫的床邊故事",
    duration: 215,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "zjl_5",
    name: "夜曲",
    artist: "周杰倫",
    album: "十一月的蕭邦",
    duration: 245,
    url: "",
    cover: "",
    source: "local",
  },

  // 林俊傑
  {
    id: "ljj_1",
    name: "江南",
    artist: "林俊傑",
    album: "第二天堂",
    duration: 264,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "ljj_2",
    name: "她說",
    artist: "林俊傑",
    album: "她說",
    duration: 275,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "ljj_3",
    name: "修煉愛情",
    artist: "林俊傑",
    album: "因你而在",
    duration: 283,
    url: "",
    cover: "",
    source: "local",
  },

  // 陳奕迅
  {
    id: "cyx_1",
    name: "十年",
    artist: "陳奕迅",
    album: "黑白灰",
    duration: 205,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "cyx_2",
    name: "孤勇者",
    artist: "陳奕迅",
    album: "孤勇者",
    duration: 262,
    url: "",
    cover: "",
    source: "local",
  },

  // 五月天
  {
    id: "wyt_1",
    name: "倔強",
    artist: "五月天",
    album: "神的孩子都在跳舞",
    duration: 274,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "wyt_2",
    name: "突然好想你",
    artist: "五月天",
    album: "後青春期的詩",
    duration: 324,
    url: "",
    cover: "",
    source: "local",
  },

  // 薛之謙
  {
    id: "xzq_1",
    name: "演員",
    artist: "薛之謙",
    album: "紳士",
    duration: 270,
    url: "",
    cover: "",
    source: "local",
  },

  // 鄧紫棋
  {
    id: "dzq_1",
    name: "光年之外",
    artist: "鄧紫棋",
    album: "光年之外",
    duration: 235,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "dzq_2",
    name: "泡沫",
    artist: "鄧紫棋",
    album: "Xposed",
    duration: 268,
    url: "",
    cover: "",
    source: "local",
  },

  // 李榮浩
  {
    id: "lrh_1",
    name: "李白",
    artist: "李榮浩",
    album: "模特",
    duration: 261,
    url: "",
    cover: "",
    source: "local",
  },
  {
    id: "lrh_2",
    name: "年少有為",
    artist: "李榮浩",
    album: "耳朵",
    duration: 247,
    url: "",
    cover: "",
    source: "local",
  },
];

/**
 * 檢查 Music API 是否可用
 */
function isMusicApiAvailable(): boolean {
  return (
    typeof window !== "undefined" && window.Music?.SearchMusic !== undefined
  );
}

/**
 * 使用網易雲音樂 API 獲取播放 URL（備用方案）
 */
async function searchWithNetease(
  name: string,
  artist?: string,
): Promise<MusicTrack | null> {
  try {
    const searchQuery = artist ? `${name}-${artist}` : name;
    const searchUrl = `https://music-api.gdstudio.xyz/api.php?types=search&name=${encodeURIComponent(searchQuery)}&count=5&pages=1`;

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) return null;

    const searchResults = await searchResponse.json();
    if (
      !searchResults ||
      !Array.isArray(searchResults) ||
      searchResults.length === 0
    ) {
      return null;
    }

    // 歌手匹配輔助函數
    const normalizeForCompare = (s: string) =>
      s.toLowerCase().replace(/\s+/g, "");
    const targetArtists = artist
      ? artist
          .split(/[\/,、&]/)
          .map((a) => normalizeForCompare(a.trim()))
          .filter(Boolean)
      : [];

    // 先按歌手匹配度排序：優先選歌手匹配的結果
    const sortedResults = [...searchResults].sort((a, b) => {
      if (targetArtists.length === 0) return 0;
      const aArtists = (a.artist || [])
        .map((ar: string) => normalizeForCompare(ar))
        .join(",");
      const bArtists = (b.artist || [])
        .map((ar: string) => normalizeForCompare(ar))
        .join(",");
      const aMatch = targetArtists.some((ta) => aArtists.includes(ta)) ? 0 : 1;
      const bMatch = targetArtists.some((ta) => bArtists.includes(ta)) ? 0 : 1;
      return aMatch - bMatch;
    });

    // 嘗試獲取第一個有效的播放 URL（已按歌手匹配度排序）
    for (const song of sortedResults) {
      const songId = song.id;
      if (!songId) continue;

      // 獲取播放 URL
      const urlResponse = await fetch(
        `https://music-api.gdstudio.xyz/api.php?types=url&id=${songId}`,
      );
      if (!urlResponse.ok) continue;

      const urlData = await urlResponse.json();
      if (!urlData?.url) continue;

      // 獲取封面和歌詞（並行請求）
      const [lrcResponse, picResponse] = await Promise.all([
        fetch(
          `https://music-api.gdstudio.xyz/api.php?types=lyric&id=${songId}`,
        ).catch(() => null),
        fetch(
          `https://music-api.gdstudio.xyz/api.php?types=pic&id=${song.pic_id || songId}`,
        ).catch(() => null),
      ]);

      const lrcData = lrcResponse
        ? await lrcResponse.json().catch(() => null)
        : null;
      const picData = picResponse
        ? await picResponse.json().catch(() => null)
        : null;

      return {
        id: `netease_${songId}`,
        name: song.name || name,
        artist: song.artist?.join(",") || artist || "未知歌手",
        url: urlData.url,
        cover: picData?.url || "",
        lrc: lrcData?.lyric || "",
        source: "netease",
      };
    }

    return null;
  } catch (error) {
    console.error("[MusicApi] 網易雲 API 搜索失敗:", error);
    return null;
  }
}

/**
 * 使用 QQ 音樂歌曲搜索 API（返回更多結果和封面）
 */
async function searchWithQQMusic(keyword: string): Promise<MusicTrack[]> {
  try {
    const response = await fetch(
      `/api/music/vkeys/music/tencent/search/song?keyword=${encodeURIComponent(keyword)}&limit=20`,
    );

    if (!response.ok) {
      console.warn("[MusicApi] QQ 音樂 API 請求失敗:", response.status);
      return [];
    }

    const data: QQMusicSongSearchResponse = await response.json();

    // API 返回 code: 0 表示成功
    if (data.code !== 0 || !data.data?.list) {
      console.warn("[MusicApi] QQ 音樂 API 返回無效數據:", data.code);
      return [];
    }

    // 轉換為 MusicTrack 格式
    return data.data.list.map((item) => ({
      id: `qq_${item.songMID}`,
      name: item.title,
      artist: item.singer,
      album: item.album,
      url: "", // URL 需要在播放時獲取
      cover: item.cover || "",
      duration: item.interval,
      source: "qq",
    }));
  } catch (error) {
    console.error("[MusicApi] QQ 音樂搜索失敗:", error);
    return [];
  }
}

/**
 * 使用落月 API 獲取 QQ 音樂播放鏈接
 * 通過 songMID 直接獲取播放 URL，不需要繞道 Music.js 或網易雲
 */
async function getQQMusicLink(mid: string): Promise<{
  url: string;
  cover: string;
  song: string;
  singer: string;
} | null> {
  try {
    const response = await fetch(
      `/api/music/vkeys/music/tencent/song/link?mid=${encodeURIComponent(mid)}&quality=8`,
    );
    if (!response.ok) return null;

    const data: QQMusicLinkResponse = await response.json();
    if ((data.code !== 200 && data.code !== 0) || !data.data?.url) {
      return null;
    }

    return {
      url: data.data.url,
      cover: data.data.cover || "",
      song: data.data.song || "",
      singer: data.data.singer || "",
    };
  } catch (error) {
    console.error("[MusicApi] QQ 音樂 link API 失敗:", error);
    return null;
  }
}

/**
 * 使用外部 API 搜索音樂
 */
async function searchWithApi(keyword: string): Promise<MusicTrack | null> {
  if (!isMusicApiAvailable()) {
    console.warn("[MusicApi] Music API 未載入");
    return null;
  }

  try {
    const result = await window.Music!.SearchMusic(keyword);
    if (!result || !result.Url) {
      return null;
    }

    return {
      id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: result.Name || keyword,
      artist: result.Singer || "未知歌手",
      url: result.Url,
      cover: result.Cover || "",
      lrc: result.Lyric || "",
      source: result.Source || "api",
    };
  } catch (error) {
    console.error("[MusicApi] API 搜索失敗:", error);
    return null;
  }
}

/**
 * 本地搜索音樂
 */
function searchLocal(keyword: string): MusicTrack[] {
  if (!keyword.trim()) {
    return [...LOCAL_MUSIC_DB];
  }

  const lowerKeyword = keyword.toLowerCase();
  return LOCAL_MUSIC_DB.filter(
    (track) =>
      track.name.toLowerCase().includes(lowerKeyword) ||
      track.artist.toLowerCase().includes(lowerKeyword) ||
      (track.album?.toLowerCase().includes(lowerKeyword) ?? false),
  );
}

/**
 * 搜索音樂
 * 同時搜索本地、QQ 音樂 API 和外部 Music.js API，返回合併結果
 */
export async function searchMusic(keyword: string): Promise<MusicTrack[]> {
  // 如果沒有關鍵詞，返回本地音樂
  if (!keyword.trim()) {
    return searchLocal(keyword);
  }

  // 並行搜索：本地 + QQ 音樂 API
  const [localResults, qqResults] = await Promise.all([
    Promise.resolve(searchLocal(keyword)),
    searchWithQQMusic(keyword),
  ]);

  // 合併結果，QQ 音樂結果在前，標記為線上
  const onlineResults = qqResults.map((track) => ({
    ...track,
    source: "online",
  }));

  // 去重：如果 QQ 結果和本地結果有相同歌曲，保留 QQ 結果
  const localFiltered = localResults.filter(
    (local) =>
      !onlineResults.some(
        (online) =>
          online.name === local.name && online.artist === local.artist,
      ),
  );

  return [...onlineResults, ...localFiltered];
}

/**
 * 檢查 API 返回的結果是否與目標曲目匹配
 * 同時驗證歌名和歌手，避免播到同名但不同歌手的版本
 */
function isResultMatchingTrack(
  result: MusicTrack,
  target: MusicTrack,
): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[\(（].*[\)）]/g, "");

  const resultName = normalize(result.name);
  const targetName = normalize(target.name);

  // 歌名必須有交集（包含關係）
  const nameMatch =
    resultName.includes(targetName) || targetName.includes(resultName);
  if (!nameMatch) return false;

  // 歌手也要匹配（至少有一個歌手名有交集）
  const normalizeArtist = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[\(（].*[\)）]/g, "");

  // 把歌手拆分（可能有多個歌手用 / , 、 分隔）
  const resultArtists = result.artist
    .split(/[\/,、&]/)
    .map((a) => normalizeArtist(a.trim()))
    .filter(Boolean);
  const targetArtists = target.artist
    .split(/[\/,、&]/)
    .map((a) => normalizeArtist(a.trim()))
    .filter(Boolean);

  // 任一目標歌手出現在結果歌手中（或反過來包含）就算匹配
  const artistMatch = targetArtists.some((ta) =>
    resultArtists.some((ra) => ra.includes(ta) || ta.includes(ra)),
  );

  return artistMatch;
}

/**
 * 獲取歌曲播放 URL
 * 優先使用落月 API (api.vkeys.cn) 的 link 接口
 * 備用：Music.js API → 網易雲 API
 */
export async function getMusicUrl(track: MusicTrack): Promise<string> {
  // 如果已有有效 URL，直接返回
  if (track.url && track.url.startsWith("http")) {
    return track.url;
  }

  // 1. QQ 音樂曲目：直接用 songMID 拿播放鏈接
  const qqMid = extractQQMid(track.id);
  if (qqMid) {
    const linkResult = await getQQMusicLink(qqMid);
    if (linkResult?.url) {
      track.url = linkResult.url;
      track.cover = linkResult.cover || track.cover;
      return linkResult.url;
    }
    console.warn("[MusicApi] QQ link API 失敗，嘗試備用方案:", track.name);
  }

  // 2. 非 QQ 曲目（本地等）：先搜 QQ 音樂拿 MID，再用 link 接口
  if (!qqMid) {
    const qqUrl = await searchQQAndGetLink(track);
    if (qqUrl) return qqUrl;
  }

  // 3. 備用：Music.js API → 網易雲 API
  const cleanName = track.name.replace(/\s*[\(（].*[\)）]\s*/g, "").trim();
  const cleanArtist = track.artist.split(/[\/,、]/)[0].trim();

  const searchQueries = [
    `${track.name} ${track.artist}`,
    `${cleanName} ${cleanArtist}`,
    track.name,
  ];

  for (const query of searchQueries) {
    let apiResult = await searchWithApi(query);

    if (!apiResult?.url) {
      apiResult = await searchWithNetease(
        query.includes(track.artist) ? track.name : query,
        query.includes(track.artist) ? track.artist : undefined,
      );
    }

    if (apiResult?.url) {
      if (!isResultMatchingTrack(apiResult, track)) {
        console.warn(
          `[MusicApi] 結果不匹配，跳過: 搜索「${track.name}」但得到「${apiResult.name} - ${apiResult.artist}」`,
        );
        continue;
      }

      track.url = apiResult.url;
      track.cover = apiResult.cover || track.cover;
      track.lrc = apiResult.lrc || track.lrc;
      return apiResult.url;
    }
  }

  console.warn("[MusicApi] 無法獲取播放 URL:", track.name);
  return "";
}

/**
 * 對非 QQ 曲目，先搜 QQ 音樂找到匹配的 songMID，再用 link 接口拿 URL
 */
async function searchQQAndGetLink(track: MusicTrack): Promise<string> {
  try {
    const keyword = `${track.name} ${track.artist}`;
    const results = await searchWithQQMusic(keyword);
    if (results.length === 0) return "";

    // 找歌手匹配的結果
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const targetArtists = track.artist
      .split(/[\/,、&]/)
      .map((a) => normalize(a.trim()))
      .filter(Boolean);

    // 優先精確匹配歌手，其次取第一個結果
    const matched =
      results.find((r) => {
        const rArtists = r.artist
          .split(/[\/,、&]/)
          .map((a) => normalize(a.trim()))
          .filter(Boolean);
        return targetArtists.some((ta) =>
          rArtists.some((ra) => ra.includes(ta) || ta.includes(ra)),
        );
      }) || results[0];

    const mid = extractQQMid(matched.id);
    if (!mid) return "";

    const linkResult = await getQQMusicLink(mid);
    if (!linkResult?.url) return "";

    track.url = linkResult.url;
    track.cover = linkResult.cover || track.cover;
    // 更新 id 為 qq_ 格式，下次播放可以直接走快速通道
    track.id = matched.id;
    return linkResult.url;
  } catch (error) {
    console.error("[MusicApi] QQ 搜索+link 失敗:", error);
    return "";
  }
}

/**
 * 從 track.id 提取 QQ 音樂 songMID
 * id 格式為 "qq_<songMID>"
 */
function extractQQMid(trackId: string): string | null {
  if (trackId.startsWith("qq_")) {
    return trackId.slice(3);
  }
  return null;
}

/**
 * 獲取歌詞
 */
export async function getLyrics(track: MusicTrack): Promise<string> {
  if (track.lrc) return track.lrc;

  // 嘗試通過 API 獲取
  const searchQuery = `${track.name} ${track.artist}`;
  const apiResult = await searchWithApi(searchQuery);

  if (apiResult?.lrc) {
    track.lrc = apiResult.lrc;
    return apiResult.lrc;
  }

  return "";
}

/**
 * 獲取熱門/推薦歌曲
 */
export async function getHotMusic(): Promise<MusicTrack[]> {
  const shuffled = [...LOCAL_MUSIC_DB].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 20);
}

/**
 * 獲取所有本地音樂
 */
export function getAllLocalMusic(): MusicTrack[] {
  return [...LOCAL_MUSIC_DB];
}

/**
 * 按歌手獲取音樂
 */
export function getMusicByArtist(artist: string): MusicTrack[] {
  return LOCAL_MUSIC_DB.filter((track) =>
    track.artist.toLowerCase().includes(artist.toLowerCase()),
  );
}

/**
 * 直接通過歌名搜索並獲取可播放的曲目
 */
export async function searchAndGetPlayableTrack(
  musicName: string,
): Promise<MusicTrack | null> {
  const apiResult = await searchWithApi(musicName);
  return apiResult;
}
