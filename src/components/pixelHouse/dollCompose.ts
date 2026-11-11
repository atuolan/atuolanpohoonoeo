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
  // 還沒畫睡覺的圖：用正面（沒有就用側面走路第一格）自動做一張（閉眼、只留頭，身體蓋在棉被裡）
  if (!manifest.poses[SLEEP_POSE] && autoSleepSource(manifest)) {
    const auto = await composeAutoSleep(manifest, asset, outfit, customs, bob);
    if (auto) out[SLEEP_POSE] = [auto];
  }
  return out;
}

/** 睡覺的動作：doll.json 有畫就用畫的，沒有就自動做 */
export const SLEEP_POSE = "sleep";

/** 自動做睡覺圖時用哪個動作：正面的頭直接放在枕頭上；只有側面的話顯示時再轉 90 度 */
export function autoSleepSource(manifest: DollManifest): "front" | "walk" | null {
  if (manifest.poses.front) return "front";
  if (manifest.poses.walk) return "walk";
  return null;
}

/** 衣服這幾層最上面那一列就是脖子：睡覺時從這裡以下蓋在棉被裡 */
const CLOTHES_LAYERS = ["underwear", "shirt", "jacket"];

/**
 * 自動做的睡覺圖：正面站姿（沒有就用走路第一格），眼睛換成閉眼的一條線，脖子以下清掉。
 * 髮型、髮色、膚色、上傳的頭髮都跟著現在的外觀，不用另外畫；頭放在枕頭上，身體是床那張鼓起來的被子。
 */
async function composeAutoSleep(
  manifest: DollManifest,
  asset: string,
  outfit: Outfit,
  customs: CustomPart[],
  bob: number[],
): Promise<string | null> {
  const source = autoSleepSource(manifest);
  const pose = source ? manifest.poses[source] : null;
  if (!source || !pose) return null;
  const { w, h } = pose;
  const plan = buildLayerPlan(manifest, source, 0, outfit, customs);
  const layers = await Promise.all(plan.map((l) => layerPixels(l, asset, w, h, 0, bob)));
  const ctx = canvas(w, h);
  const tmp = canvas(w, h);
  let neck: number | null = null;
  let eyes: ImageData | null = null;
  plan.forEach((l, i) => {
    const px = layers[i];
    if (!px) return;
    if (l.layer === "eyes") {
      eyes = px.data;
      return;
    }
    if (CLOTHES_LAYERS.includes(l.layer)) {
      const top = topRow(px.data.data, w, h);
      if (top !== null) neck = neck === null ? top : Math.min(neck, top);
    }
    tmp.putImageData(px.data, 0, 0);
    ctx.drawImage(tmp.canvas, 0, px.dy);
  });
  const out = ctx.getImageData(0, 0, w, h);
  const d = out.data;
  if (eyes) drawClosedEyes(d, (eyes as ImageData).data, w, h);
  // 脖子以下蓋在棉被裡（留一列領口，跟棉被接起來）
  const cut = Math.min(h, (neck ?? Math.round(h * 0.42)) + 1);
  for (let i = cut * w * 4; i < d.length; i++) d[i] = 0;
  ctx.putImageData(out, 0, 0);
  return ctx.canvas.toDataURL("image/png");
}

/** 閉眼：眼睛那一層的範圍裡，在最下面那一列畫一條線，顏色用眼睛裡最深的那個 */
function drawClosedEyes(target: Uint8ClampedArray, eyes: Uint8ClampedArray, w: number, h: number): void {
  let minX = w;
  let maxX = -1;
  let maxY = -1;
  let dark: [number, number, number] | null = null;
  let darkSum = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (eyes[i + 3] === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const sum = eyes[i] + eyes[i + 1] + eyes[i + 2];
      if (sum < darkSum) {
        darkSum = sum;
        dark = [eyes[i], eyes[i + 1], eyes[i + 2]];
      }
    }
  }
  if (!dark || maxX < 0) return;
  for (let x = minX; x <= maxX; x++) {
    const i = (maxY * w + x) * 4;
    target[i] = dark[0];
    target[i + 1] = dark[1];
    target[i + 2] = dark[2];
    target[i + 3] = 255;
  }
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
