/**
 * 房間的位置（96×64 的格子）。換成自己的圖時，可以在這裡調整位置。
 *
 * bottom：家具底部對齊的那一列；cx：水平置中的那一欄
 */
export const ROOM_SIZE = { w: 96, h: 64 };

export const ROOM_LAYOUT = {
  window: { x: 38, y: 5 },
  wallA: { cx: 15, y: 8 },
  wallB: { cx: 70, y: 8 },
  shelf: { x: 3, y: 28 },
  wardrobe: { x: 80, bottom: 42 },
  corner: { cx: 36, bottom: 44 },
  rug: { x: 33, bottom: 60 },
  bed: { x: 2, bottom: 48 },
  desk: { x: 54, bottom: 44 },
  /** 站著的時候 */
  stand: { x: 44, bottom: 56 },
} as const;
