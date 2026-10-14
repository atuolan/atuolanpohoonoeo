/**
 * 語音辨識結果簡轉繁（opencc-js 詞組級轉換，台灣用詞）
 *
 * 辨識服務一律輸出簡體；專案原本的逐字對照表會把「喂」轉成「餵」、「吃」轉成「喫」，
 * 所以這裡用 opencc。轉換表約 1MB，第一次用到才載入；載入失敗就回傳原文。
 */

type Convert = (text: string) => string;

const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/u;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

async function defaultLoader(): Promise<Convert> {
  const OpenCC = await import("opencc-js/cn2t");
  return OpenCC.Converter({ from: "cn", to: "twp" });
}

let loadConverter: () => Promise<Convert> = defaultLoader;
let converterPromise: Promise<Convert | null> | null = null;

/** 有漢字、沒有假名（日文）才需要轉 */
export function shouldConvertToTraditional(text: string): boolean {
  return CJK_RE.test(text) && !KANA_RE.test(text);
}

export async function toTraditional(text: string): Promise<string> {
  if (!text || !shouldConvertToTraditional(text)) return text;
  if (!converterPromise) {
    converterPromise = loadConverter().catch((err) => {
      console.warn("[toTraditional] 繁體轉換資料載入失敗，先使用原文:", err);
      converterPromise = null; // 下次再試
      return null;
    });
  }
  const convert = await converterPromise;
  return convert ? convert(text) : text;
}

/** 僅供測試：替換載入函式；傳 null 還原 */
export function __setConverterLoaderForTest(loader: (() => Promise<Convert>) | null): void {
  loadConverter = loader ?? defaultLoader;
  converterPromise = null;
}
