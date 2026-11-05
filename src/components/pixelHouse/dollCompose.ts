/**
 * 把一套外觀疊成圖：每個動作、每一格各一張（data URL），小屋和衣櫃預覽都用這個。
 * 每層先換色（wardrobeLogic.recolorPixels）再疊；用戶上傳的從整張圖切那一格。
 */
import {
  bobOffsets,
  buildLayerPlan,
  recolorPixels,
  type CustomPart,
  type DollManifest,
  type Outfit,
  type PlanLayer,
  type WardrobeCatalog,
} from "./wardrobeLogic";

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}

function canvas(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c.getContext("2d", { willReadFrequently: true })!;
}

/** 這一格整個是空的嗎 */
function isEmpty(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return false;
  return true;
}

/** 最上面有東西的那一列（頭頂） */
function topRow(data: Uint8ClampedArray, w: number, h: number): number | null {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) return y;
  return null;
}

/** 一層的像素（已換色）和要往下移幾格 */
async function layerPixels(
  l: PlanLayer,
  asset: string,
  w: number,
  h: number,
  frame: number,
  bob: number[],
): Promise<{ data: ImageData; dy: number } | null> {
  const ctx = canvas(w, h);
  let dy = 0;
  if (l.source.kind === "file") {
    const img = await loadImage(`${asset}${l.source.path}`);
    if (!img) return null;
    ctx.drawImage(img, 0, 0);
  } else {
    const img = await loadImage(l.source.part.sheet);
    if (!img) return null;
    const draw = (cell: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, cell * w, 0, w, h, 0, 0, w, h);
    };
    let cell = l.source.cell;
    draw(cell);
    if (l.source.fallbackCell !== null && isEmpty(ctx.getImageData(0, 0, w, h).data)) {
      cell = l.source.fallbackCell;
      draw(cell);
    }
    // 走路第 2~4 格借用「走路 1」那格：跟著身體上下
    if (cell === 2 && frame > 0) dy = bob[frame] ?? 0;
  }
  const data = ctx.getImageData(0, 0, w, h);
  if (l.color) recolorPixels(data.data, l.color, { keepNeutrals: l.keepNeutrals });
  return { data, dy };
}

/** 走路每格身體的上下位移（用身體那層的頭頂算） */
async function walkBob(manifest: DollManifest, asset: string): Promise<number[]> {
  const pose = manifest.poses.walk;
  const body = pose?.layers.find((l) => l.slot === "body");
  const files = body ? Object.values(body.styles)[0] : null;
  if (!pose || !Array.isArray(files)) return [];
  const tops = await Promise.all(
    files.map(async (f) => {
      const img = await loadImage(`${asset}${f}`);
      if (!img) return null;
      const ctx = canvas(pose.w, pose.h);
      ctx.drawImage(img, 0, 0);
      return topRow(ctx.getImageData(0, 0, pose.w, pose.h).data, pose.w, pose.h);
    }),
  );
  return bobOffsets(tops);
}

export type ComposedLook = Record<string, string[]>;

const composed = new Map<string, Promise<ComposedLook>>();

/** 每個動作每一格疊好的圖；同一套外觀只算一次 */
export function composeLook(manifest: DollManifest, asset: string, outfit: Outfit, customs: CustomPart[]): Promise<ComposedLook> {
  const usedCustoms = customs.filter((c) => Object.values(outfit.parts).includes(c.id)).map((c) => c.id + c.createdAt);
  const key = JSON.stringify([asset, outfit.base, outfit.parts, outfit.colors, usedCustoms]);
  let p = composed.get(key);
  if (!p) {
    p = composeLookNow(manifest, asset, outfit, customs);
    composed.set(key, p);
    if (composed.size > 40) composed.delete(composed.keys().next().value!);
  }
  return p;
}

async function composeLookNow(manifest: DollManifest, asset: string, outfit: Outfit, customs: CustomPart[]): Promise<ComposedLook> {
  const bob = await walkBob(manifest, asset);
  const out: ComposedLook = {};
  for (const [name, pose] of Object.entries(manifest.poses)) {
    const frames = Math.max(1, pose.frames ?? 1);
    out[name] = [];
    for (let f = 0; f < frames; f++) {
      const plan = buildLayerPlan(manifest, name, f, outfit, customs);
      const layers = await Promise.all(plan.map((l) => layerPixels(l, asset, pose.w, pose.h, f, bob)));
      const ctx = canvas(pose.w, pose.h);
      const tmp = canvas(pose.w, pose.h);
      for (const l of layers) {
        if (!l) continue;
        tmp.putImageData(l.data, 0, 0);
        ctx.drawImage(tmp.canvas, 0, l.dy);
      }
      out[name].push(ctx.canvas.toDataURL("image/png"));
    }
  }
  return out;
}

/** 只疊一個部位（衣櫃的款式小圖）：身體＋這個部位 */
export async function composePartPreview(
  manifest: DollManifest,
  asset: string,
  outfit: Outfit,
  customs: CustomPart[],
  keepLayers: string[],
): Promise<string> {
  const pose = manifest.poses.front;
  if (!pose) return "";
  const plan = buildLayerPlan(manifest, "front", 0, outfit, customs).filter((l) => keepLayers.includes(l.layer));
  const layers = await Promise.all(plan.map((l) => layerPixels(l, asset, pose.w, pose.h, 0, [])));
  const ctx = canvas(pose.w, pose.h);
  const tmp = canvas(pose.w, pose.h);
  for (const l of layers) {
    if (!l) continue;
    tmp.putImageData(l.data, 0, 0);
    ctx.drawImage(tmp.canvas, 0, l.dy);
  }
  return ctx.canvas.toDataURL("image/png");
}

/**
 * 讀用戶選的檔案：檢查尺寸，縮回 1 倍（整數倍匯出的），回傳 1 倍的 data URL。
 * 半透明的像素補成全不透明或全透明（跟拆你的圖一樣）。
 */
export async function readUploadSheet(
  file: File,
  cellW: number,
  cellH: number,
  check: (w: number, h: number) => { ok: true; cells: 3 | 6; scale: number } | { ok: false; error: string },
): Promise<{ ok: true; sheet: string; cells: 3 | 6 } | { ok: false; error: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    });
    if (!img) return { ok: false, error: "讀不到這張圖，請用 PNG" };
    const r = check(img.naturalWidth, img.naturalHeight);
    if (!r.ok) return r;
    const w = cellW * r.cells;
    const ctx = canvas(w, cellH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, cellH);
    const data = ctx.getImageData(0, 0, w, cellH);
    const d = data.data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] >= 128) d[i] = 255;
      else d[i - 3] = d[i - 2] = d[i - 1] = d[i] = 0;
    }
    if (isEmpty(d)) return { ok: false, error: "這張圖是空的" };
    ctx.putImageData(data, 0, 0);
    return { ok: true, sheet: ctx.canvas.toDataURL("image/png"), cells: r.cells };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ===== 讀紙娃娃清單、款式清單（同一個身體只讀一次） =====

const manifests = new Map<string, Promise<DollManifest | null>>();
const catalogs = new Map<string, Promise<WardrobeCatalog | null>>();

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** chars/<身體>/doll.json；沒有（例如女生還沒畫）回傳 null */
export function loadDollManifest(charsAsset: string, base: string): Promise<DollManifest | null> {
  const url = `${charsAsset}${base}/doll.json`;
  let p = manifests.get(url);
  if (!p) {
    p = fetchJson<DollManifest>(url).then((d) => (d?.poses && Object.keys(d.poses).length ? d : null));
    manifests.set(url, p);
  }
  return p;
}

export function loadWardrobeCatalog(charsAsset: string, base: string): Promise<WardrobeCatalog | null> {
  const url = `${charsAsset}${base}/wardrobe.json`;
  let p = catalogs.get(url);
  if (!p) {
    p = fetchJson<WardrobeCatalog>(url);
    catalogs.set(url, p);
  }
  return p;
}
