import { AlarmClock, Coffee, EggFried, Flame, Package, Zap } from "lucide-vue-next";
import type { Component } from "vue";

const CARE_ICONS: Record<string, Component> = {
  care_coffee: Coffee,
  care_energy: Zap,
  care_alarm: AlarmClock,
  care_breakfast: EggFried,
  care_aroma: Flame,
};

/** 照顧他的道具的圖示 */
export function getCareIcon(itemId: string): Component {
  return CARE_ICONS[itemId] ?? Package;
}
