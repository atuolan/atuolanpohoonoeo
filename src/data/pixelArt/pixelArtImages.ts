/**
 * 換成自己的圖：artId → 圖檔路徑
 *
 * 把圖放進 public/pixel-art/，在這裡加一行，例如：
 *   "furniture:bed-double": "/pixel-art/bed-double.png",
 *
 * 圖會照原本像素圖的寬高畫在同一個位置（房間是 96×64 的格子，放大顯示）。
 * 角色小人：用 "char:<體型>:<姿勢>" 當 id（例如 "char:standard:stand"），
 * 有圖就整張換掉，不再套髮型、衣服的色塊。
 *
 * artId 一覽見 src/data/pixelArt/furniture.ts（FURNITURE_ART）和 character.ts。
 */
export const PIXEL_ART_IMAGES: Record<string, string> = {};
