import { useTimeTheme } from "@/composables/useTimeTheme";
import { useDivinationStore, type ThemeMode } from "@/stores/divination";
import { computed } from "vue";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = { auto: "day", day: "night", night: "auto" };

/** 占卜區日夜主題：預設跟時間（20:00–05:00 夜間），可手動切換並記住 */
export function useFateTheme() {
  const store = useDivinationStore();
  const { isDark } = useTimeTheme();

  const mode = computed(() => store.themeMode);
  const isNight = computed(() => (mode.value === "auto" ? isDark.value : mode.value === "night"));
  const themeClass = computed(() => (isNight.value ? "fate-theme--night" : "fate-theme--day"));

  function cycleMode() {
    void store.setThemeMode(NEXT_MODE[mode.value]);
  }

  return { mode, isNight, themeClass, cycleMode };
}
