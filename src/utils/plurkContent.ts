/**
 * 噗浪內文渲染：先切出標記，一般文字一律跳脫，輸出只會有這裡產生的標籤
 * 支援：@提及、[sticker:名稱|網址]、<image>配圖</image>（含舊格式）、<br>
 */

export interface RenderPlurkOptions {
  /** 貼圖沒帶網址時，用名稱查網址 */
  resolveSticker?: (name: string) => string | null;
  /** 拍立得上的日期，預設今天 */
  date?: Date;
}

const TOKEN_SOURCE =
  "<image>([\\s\\S]*?)<\\/image>|\\[IMAGE\\]([\\s\\S]*?)\\[\\/IMAGE\\]|<pic\\b[^>]*>([\\s\\S]*?)<\\/pic>|<圖片描述>([\\s\\S]*?)<\\/圖片描述>|\\[sticker:([^\\]]+)\\]|<br\\s*\\/?>|<reactions>[\\s\\S]*?<\\/reactions>";

const MENTION_PATTERN = /@([^\s@]+)/g;

function tokenPattern(): RegExp {
  return new RegExp(TOKEN_SOURCE, "gi");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeWithBreaks(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br>");
}

function renderText(raw: string): string {
  let out = "";
  let last = 0;
  for (const m of raw.matchAll(MENTION_PATTERN)) {
    out += escapeWithBreaks(raw.slice(last, m.index));
    out += `<span class="plurk-mention">@${escapeHtml(m[1])}</span>`;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + escapeWithBreaks(raw.slice(last));
}

/** 配圖只取「中文描述｜英文提示詞」的中文部分 */
function imageCaption(raw: string): string {
  return raw.split(/[|｜]/)[0].trim() || "圖片";
}

function renderPolaroid(caption: string, date: Date): string {
  const d = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  return (
    `<div class="plurk-polaroid"><div class="plurk-polaroid-photo">` +
    `<span class="plurk-polaroid-caption">${escapeHtml(caption)}</span></div>` +
    `<span class="plurk-polaroid-date">${d}</span></div>`
  );
}

function isHttpUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url.trim());
}

function renderSticker(data: string, original: string, opts: RenderPlurkOptions): string {
  const [rawName, rawUrl] = data.split("|");
  const name = rawName.trim();
  const url = rawUrl !== undefined ? rawUrl.trim() : (opts.resolveSticker?.(name) ?? null);
  if (!isHttpUrl(url)) return escapeHtml(original);
  const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
  return `<img src="${escapeHtml(proxied)}" alt="${escapeHtml(name)}" class="plurk-sticker" loading="lazy">`;
}

export function renderPlurkContent(raw: string, opts: RenderPlurkOptions = {}): string {
  if (!raw) return "";
  const date = opts.date ?? new Date();
  let out = "";
  let last = 0;
  for (const m of raw.matchAll(tokenPattern())) {
    out += renderText(raw.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const [whole, image, legacyImage, pic, imageDesc, sticker] = m;
    const caption = image ?? legacyImage ?? pic ?? imageDesc;
    if (caption !== undefined) {
      out += renderPolaroid(imageCaption(caption), date);
    } else if (sticker !== undefined) {
      out += renderSticker(sticker, whole, opts);
    } else if (/^<br/i.test(whole)) {
      out += "<br>";
    }
    // <reactions> 直接丟掉
  }
  out += renderText(raw.slice(last));
  return out.replace(/^(?:<br>)+|(?:<br>)+$/g, "");
}

/** 純文字摘要：預覽、通知用 */
export function plurkPlainText(raw: string, max = 60): string {
  const text = (raw || "")
    .replace(tokenPattern(), (whole, image, legacyImage, pic, imageDesc, sticker) => {
      if ((image ?? legacyImage ?? pic ?? imageDesc) !== undefined) return "[圖]";
      if (sticker !== undefined) return "[貼圖]";
      if (/^<br/i.test(whole)) return " ";
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
