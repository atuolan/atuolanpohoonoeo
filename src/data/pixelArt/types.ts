/**
 * 像素圖格式
 *
 * 每張圖是一組字串（一個字元一格，"." 是透明）加上色票。
 * 色票的值可以是顏色（#hex），也可以是 "$鍵名"——畫的時候由呼叫端給顏色，
 * 例如角色的髮色 $hair、膚色 $skin，同一張圖就能換色。
 *
 * 想換成自己畫的圖：在 pixelArtImages.ts 裡把 artId 對到圖檔路徑，
 * 程式會改畫那張圖（照同樣的寬高、位置），不用改其他程式。
 */

export interface PixelArt {
  w: number;
  h: number;
  rows: string[];
  palette: Record<string, string>;
}

/** 用長方形畫一張像素圖：ops 依序蓋上去，[字元, x, y, 寬, 高] */
export type PaintOp = [string, number, number, number, number];

export function paint(w: number, h: number, palette: Record<string, string>, ops: PaintOp[]): PixelArt {
  const grid: string[][] = Array.from({ length: h }, () => Array(w).fill("."));
  for (const [ch, x, y, rw, rh] of ops) {
    for (let yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) grid[yy][xx] = ch;
    }
  }
  return { w, h, palette, rows: grid.map((r) => r.join("")) };
}

/** 直接用字串畫（每行補齊到同樣寬） */
export function fromRows(rows: string[], palette: Record<string, string>): PixelArt {
  const w = Math.max(...rows.map((r) => r.length));
  return { w, h: rows.length, palette, rows: rows.map((r) => r.padEnd(w, ".")) };
}

/** 把 overlay 蓋在 base 上（overlay 的 "." 不蓋），從 base 的 (dx, dy) 開始 */
export function overlay(base: PixelArt, top: PixelArt, dx = 0, dy = 0): PixelArt {
  const rows = base.rows.map((r) => r.split(""));
  top.rows.forEach((line, y) => {
    const ty = y + dy;
    if (ty < 0 || ty >= base.h) return;
    line.split("").forEach((ch, x) => {
      const tx = x + dx;
      if (ch !== "." && tx >= 0 && tx < base.w) rows[ty][tx] = ch;
    });
  });
  return { ...base, palette: { ...base.palette, ...top.palette }, rows: rows.map((r) => r.join("")) };
}

/** 換掉某個字元（例如睡著時把眼睛 e 換成膚色 s） */
export function replaceChar(art: PixelArt, from: string, to: string): PixelArt {
  return { ...art, rows: art.rows.map((r) => r.split(from).join(to)) };
}

/** 逆時針轉 90 度（站姿變躺姿，頭朝左） */
export function rotateLeft(art: PixelArt): PixelArt {
  const rows: string[] = [];
  for (let x = art.w - 1; x >= 0; x--) {
    let line = "";
    for (let y = 0; y < art.h; y++) line += art.rows[y][x];
    rows.push(line);
  }
  return { ...art, w: art.h, h: art.w, rows };
}
