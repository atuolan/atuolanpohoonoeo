// ===== 組件類型 → Vue 組件對應表 =====
// 畫布與組件設定面板的即時預覽共用，新增組件類型時只需改這裡。
import AffinityMeterWidget from "@/components/widgets/AffinityMeterWidget.vue";
import BatteryRingWidget from "@/components/widgets/BatteryRingWidget.vue";
import BookmarkSticky from "@/components/widgets/BookmarkSticky.vue";
import CalendarWidget from "@/components/widgets/CalendarWidget.vue";
import CharJournalWidget from "@/components/widgets/CharJournalWidget.vue";
import CharPhoneWidget from "@/components/widgets/CharPhoneWidget.vue";
import CharStatusWidget from "@/components/widgets/CharStatusWidget.vue";
import ClockWidget from "@/components/widgets/ClockWidget.vue";
import ColorBlockWidget from "@/components/widgets/ColorBlockWidget.vue";
import CompanionPetWidget from "@/components/widgets/CompanionPetWidget.vue";
import CountdownSticky from "@/components/widgets/CountdownSticky.vue";
import FluidButtonWidget from "@/components/widgets/FluidButtonWidget.vue";
import FocusTimerWidget from "@/components/widgets/FocusTimerWidget.vue";
import HabitTrackerWidget from "@/components/widgets/HabitTrackerWidget.vue";
import MoodDiarySticky from "@/components/widgets/MoodDiarySticky.vue";
import MusicPlayerWidget from "@/components/widgets/MusicPlayerWidget.vue";
import PhotoFrameWidget from "@/components/widgets/PhotoFrameWidget.vue";
import PolaroidSticky from "@/components/widgets/PolaroidSticky.vue";
import ProgressRingWidget from "@/components/widgets/ProgressRingWidget.vue";
import QuoteSticky from "@/components/widgets/QuoteSticky.vue";
import RecentChatWidget from "@/components/widgets/RecentChatWidget.vue";
import RelationshipCounterWidget from "@/components/widgets/RelationshipCounterWidget.vue";
import StickerWidget from "@/components/widgets/StickerWidget.vue";
import TextBannerWidget from "@/components/widgets/TextBannerWidget.vue";
import TodoSticky from "@/components/widgets/TodoSticky.vue";
import WashiTapeWidget from "@/components/widgets/WashiTapeWidget.vue";
import WeatherWidget from "@/components/widgets/WeatherWidget.vue";
import WorldBookWidget from "@/components/widgets/WorldBookWidget.vue";
import type { Component } from "vue";

export const widgetComponents: Record<string, Component> = {
  clock: ClockWidget,
  weather: WeatherWidget,
  calendar: CalendarWidget,
  "mood-diary": MoodDiarySticky,
  polaroid: PolaroidSticky,
  todo: TodoSticky,
  quote: QuoteSticky,
  countdown: CountdownSticky,
  bookmark: BookmarkSticky,
  "fluid-button": FluidButtonWidget,
  music: MusicPlayerWidget,
  "habit-tracker": HabitTrackerWidget,
  "focus-timer": FocusTimerWidget,
  "world-book": WorldBookWidget,
  "char-phone": CharPhoneWidget,
  "progress-ring": ProgressRingWidget,
  "washi-tape": WashiTapeWidget,
  "photo-frame": PhotoFrameWidget,
  sticker: StickerWidget,
  "battery-ring": BatteryRingWidget,
  "color-block": ColorBlockWidget,
  "text-banner": TextBannerWidget,
  "relationship-counter": RelationshipCounterWidget,
  "affinity-meter": AffinityMeterWidget,
  "recent-chat": RecentChatWidget,
  "char-status": CharStatusWidget,
  "companion-pet": CompanionPetWidget,
  "char-journal": CharJournalWidget,
};
