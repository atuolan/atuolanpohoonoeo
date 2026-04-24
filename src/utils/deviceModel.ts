/**
 * 裝置機型偵測：從 User-Agent / userAgentData 擷取簡短、可讀的機型描述。
 *
 * 目標是給同步裝置清單顯示一個比指紋更人類可讀的標籤，例如：
 *  - "iPhone"
 *  - "iPad"
 *  - "Pixel 7 (Android)"
 *  - "Windows 11 · Chrome"
 *  - "macOS · Safari"
 *
 * 不使用第三方 UA parser 以保持 bundle 輕量，偵測結果是 best-effort。
 */

type UserAgentDataLike = {
  platform?: string;
  mobile?: boolean;
  brands?: Array<{ brand?: string; version?: string }>;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    platform?: string;
    platformVersion?: string;
    model?: string;
    mobile?: boolean;
    architecture?: string;
  }>;
};

function getNavigator(): (Navigator & { userAgentData?: UserAgentDataLike }) | null {
  if (typeof navigator === "undefined") return null;
  return navigator as Navigator & { userAgentData?: UserAgentDataLike };
}

function detectBrowser(ua: string): string | null {
  if (/EdgA?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua) && !/Edg|OPR|SamsungBrowser/.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
  return null;
}

function detectFromUserAgent(ua: string): string {
  // iPhone / iPad / iPod
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/iPod/.test(ua)) return "iPod";

  // Android：嘗試從 UA 擷取機型字串，例如 "(Linux; Android 14; Pixel 7) AppleWebKit/..."
  const androidMatch = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/|[;)])/i);
  if (androidMatch) {
    const model = androidMatch[1].trim();
    if (model && !/^wv$/i.test(model)) return `${model} (Android)`;
    return "Android";
  }
  if (/Android/.test(ua)) return "Android";

  // Desktop OS + browser
  const browser = detectBrowser(ua);
  if (/Windows NT 10/.test(ua)) return browser ? `Windows 10/11 · ${browser}` : "Windows";
  if (/Windows/.test(ua)) return browser ? `Windows · ${browser}` : "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return browser ? `macOS · ${browser}` : "macOS";
  if (/CrOS/.test(ua)) return browser ? `ChromeOS · ${browser}` : "ChromeOS";
  if (/Linux/.test(ua)) return browser ? `Linux · ${browser}` : "Linux";

  return browser ? `Web · ${browser}` : "Web";
}

/**
 * 嘗試以高熵 User-Agent Client Hints 取得更精確的 Android 機型，
 * 若不可用則 fall back 到 UA 字串解析。
 */
export async function detectDeviceModel(): Promise<string> {
  const nav = getNavigator();
  if (!nav) return "Unknown";
  const ua = nav.userAgent ?? "";

  const uaData = nav.userAgentData;
  if (uaData?.getHighEntropyValues) {
    try {
      const hints = await uaData.getHighEntropyValues([
        "platform",
        "platformVersion",
        "model",
      ]);
      const platform = hints.platform ?? uaData.platform ?? "";
      const model = (hints.model ?? "").trim();
      if (platform === "Android" && model) {
        return `${model} (Android)`;
      }
      if (platform && !model) {
        // 沒拿到型號但有平台，讓後面的 UA 解析補上 browser 資訊
      }
    } catch {
      // 忽略，fall back 到 UA 解析
    }
  }

  return detectFromUserAgent(ua);
}

/** 同步版：僅用 UA 字串偵測，不等待 high-entropy hints。 */
export function detectDeviceModelSync(): string {
  const nav = getNavigator();
  if (!nav) return "Unknown";
  return detectFromUserAgent(nav.userAgent ?? "");
}
