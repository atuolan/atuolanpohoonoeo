/** 小屋裡每個 App 的像素圖示：先畫好一份，下面那一排、「全部 App」、「常用 App」都用同一份 */
import { HOUSE_APPS, INK, type HouseApp } from "./houseData";
import { glyphSvg } from "./pixelArt";

export interface HouseAppIcon extends HouseApp {
  /** 畫好的圖示（SVG data URI） */
  icon: string;
}

export const HOUSE_APP_ICONS: HouseAppIcon[] = HOUSE_APPS.map((a) => ({ ...a, icon: glyphSvg(a.glyph, INK) }));

const byId = new Map(HOUSE_APP_ICONS.map((a) => [a.app, a]));

/** 照 id 的順序拿圖示，認不得的跳過 */
export function houseAppIcons(ids: string[]): HouseAppIcon[] {
  return ids.flatMap((id) => byId.get(id) ?? []);
}
