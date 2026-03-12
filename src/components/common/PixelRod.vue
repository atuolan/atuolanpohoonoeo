<script setup lang="ts">
/**
 * 像素風格魚竿組件
 * 根據魚竿 ID 顯示對應的像素圖案
 */

defineProps<{
  rodId: string;
  size?: number;
}>();

// 魚竿顏色配置
const rodColors: Record<
  string,
  {
    handle: string;
    handleDark: string;
    rod: string[];
    reel: string;
    accent: string;
  }
> = {
  rod_bamboo: {
    handle: "#a16207",
    handleDark: "#78350f",
    rod: ["#a16207", "#ca8a04", "#eab308", "#fbbf24"], // 竹子色
    reel: "#78716c",
    accent: "#451a03",
  },
  rod_carbon: {
    handle: "#374151",
    handleDark: "#1f2937",
    rod: ["#374151", "#4b5563", "#6b7280", "#9ca3af"], // 碳纖維灰黑
    reel: "#6b7280",
    accent: "#111827",
  },
  rod_pro: {
    handle: "#1e40af",
    handleDark: "#1e3a8a",
    rod: ["#1e40af", "#2563eb", "#3b82f6", "#60a5fa"], // 專業藍
    reel: "#9ca3af",
    accent: "#1e3a8a",
  },
  rod_gold: {
    handle: "#b45309",
    handleDark: "#92400e",
    rod: ["#b45309", "#d97706", "#f59e0b", "#fbbf24"], // 黃金色
    reel: "#fcd34d",
    accent: "#78350f",
  },
  rod_legendary: {
    handle: "#7c3aed",
    handleDark: "#6d28d9",
    rod: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"], // 傳說紫
    reel: "#fcd34d",
    accent: "#5b21b6",
  },
};

function getColors(rodId: string) {
  return rodColors[rodId] || rodColors.rod_bamboo;
}
</script>

<template>
  <svg
    viewBox="0 0 100 40"
    :width="size || 100"
    :height="(size || 100) * 0.4"
    shape-rendering="crispEdges"
    class="pixel-rod"
  >
    <!-- 傳說之竿 - 發光特效 -->
    <template v-if="rodId === 'rod_legendary'">
      <!-- 握把 -->
      <rect
        x="0"
        y="20"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect
        x="0"
        y="24"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect
        x="0"
        y="28"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect x="4" y="20" width="4" height="4" :fill="getColors(rodId).handle" />
      <rect x="4" y="24" width="4" height="4" :fill="getColors(rodId).handle" />
      <rect
        x="4"
        y="28"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <!-- 握把裝飾 - 金色 -->
      <rect x="0" y="22" width="8" height="2" fill="#fbbf24" />
      <rect x="0" y="26" width="8" height="2" fill="#fbbf24" />

      <!-- 竿身 - 漸變紫色 -->
      <rect x="8" y="18" width="4" height="4" :fill="getColors(rodId).rod[0]" />
      <rect
        x="12"
        y="16"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[0]"
      />
      <rect
        x="16"
        y="14"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="20"
        y="12"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="24"
        y="10"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="28"
        y="10"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[2]"
      />
      <rect x="32" y="8" width="4" height="4" :fill="getColors(rodId).rod[2]" />
      <rect x="36" y="8" width="4" height="4" :fill="getColors(rodId).rod[2]" />
      <rect x="40" y="6" width="4" height="4" :fill="getColors(rodId).rod[2]" />
      <rect x="44" y="6" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="48" y="4" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="52" y="4" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="56" y="4" width="4" height="2" :fill="getColors(rodId).rod[3]" />
      <rect x="60" y="2" width="4" height="2" :fill="getColors(rodId).rod[3]" />
      <rect x="64" y="2" width="4" height="2" fill="#ddd6fe" />
      <rect x="68" y="0" width="4" height="2" fill="#ede9fe" />
      <rect x="72" y="0" width="4" height="2" fill="#f5f3ff" />
      <rect x="76" y="0" width="2" height="2" fill="#fff" />

      <!-- 發光點 -->
      <rect x="30" y="7" width="2" height="2" fill="#fff" opacity="0.8" />
      <rect x="50" y="3" width="2" height="2" fill="#fff" opacity="0.8" />
      <rect x="70" y="0" width="1" height="1" fill="#fff" />

      <!-- 金色捲線器 -->
      <rect x="6" y="30" width="4" height="4" fill="#d97706" />
      <rect x="10" y="30" width="4" height="4" fill="#f59e0b" />
      <rect x="6" y="34" width="4" height="4" fill="#f59e0b" />
      <rect x="10" y="34" width="4" height="4" fill="#d97706" />
      <rect x="8" y="32" width="4" height="4" fill="#fbbf24" />
    </template>

    <!-- 黃金竿 -->
    <template v-else-if="rodId === 'rod_gold'">
      <!-- 握把 -->
      <rect
        x="0"
        y="20"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect
        x="0"
        y="24"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect
        x="0"
        y="28"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect x="4" y="20" width="4" height="4" :fill="getColors(rodId).handle" />
      <rect x="4" y="24" width="4" height="4" :fill="getColors(rodId).handle" />
      <rect
        x="4"
        y="28"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect x="0" y="22" width="8" height="2" :fill="getColors(rodId).accent" />
      <rect x="0" y="26" width="8" height="2" :fill="getColors(rodId).accent" />

      <!-- 竿身 - 金色漸變 -->
      <rect x="8" y="18" width="4" height="4" :fill="getColors(rodId).rod[0]" />
      <rect
        x="12"
        y="16"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[0]"
      />
      <rect
        x="16"
        y="14"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="20"
        y="12"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="24"
        y="10"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[2]"
      />
      <rect
        x="28"
        y="10"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[2]"
      />
      <rect x="32" y="8" width="4" height="4" :fill="getColors(rodId).rod[2]" />
      <rect x="36" y="8" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="40" y="6" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="44" y="6" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="48" y="4" width="4" height="4" fill="#fcd34d" />
      <rect x="52" y="4" width="4" height="4" fill="#fcd34d" />
      <rect x="56" y="4" width="4" height="2" fill="#fde68a" />
      <rect x="60" y="2" width="4" height="2" fill="#fde68a" />
      <rect x="64" y="2" width="4" height="2" fill="#fef3c7" />
      <rect x="68" y="0" width="4" height="2" fill="#fef3c7" />
      <rect x="72" y="0" width="4" height="2" fill="#fffbeb" />
      <rect x="76" y="0" width="2" height="2" fill="#fff" />

      <!-- 金色捲線器 -->
      <rect x="6" y="30" width="4" height="4" fill="#d97706" />
      <rect x="10" y="30" width="4" height="4" fill="#f59e0b" />
      <rect x="6" y="34" width="4" height="4" fill="#f59e0b" />
      <rect x="10" y="34" width="4" height="4" fill="#d97706" />
      <rect x="8" y="32" width="4" height="4" fill="#fbbf24" />
    </template>

    <!-- 專業竿 - 藍色 -->
    <template v-else-if="rodId === 'rod_pro'">
      <!-- 握把 -->
      <rect
        x="0"
        y="20"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect
        x="0"
        y="24"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect
        x="0"
        y="28"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect x="4" y="20" width="4" height="4" :fill="getColors(rodId).handle" />
      <rect x="4" y="24" width="4" height="4" :fill="getColors(rodId).handle" />
      <rect
        x="4"
        y="28"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect x="0" y="22" width="8" height="2" :fill="getColors(rodId).accent" />
      <rect x="0" y="26" width="8" height="2" :fill="getColors(rodId).accent" />

      <!-- 竿身 - 藍色 -->
      <rect x="8" y="18" width="4" height="4" :fill="getColors(rodId).rod[0]" />
      <rect
        x="12"
        y="16"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[0]"
      />
      <rect
        x="16"
        y="14"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="20"
        y="12"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="24"
        y="10"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[2]"
      />
      <rect
        x="28"
        y="10"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[2]"
      />
      <rect x="32" y="8" width="4" height="4" :fill="getColors(rodId).rod[2]" />
      <rect x="36" y="8" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="40" y="6" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="44" y="6" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="48" y="4" width="4" height="4" fill="#93c5fd" />
      <rect x="52" y="4" width="4" height="4" fill="#93c5fd" />
      <rect x="56" y="4" width="4" height="2" fill="#bfdbfe" />
      <rect x="60" y="2" width="4" height="2" fill="#bfdbfe" />
      <rect x="64" y="2" width="4" height="2" fill="#dbeafe" />
      <rect x="68" y="0" width="4" height="2" fill="#dbeafe" />
      <rect x="72" y="0" width="4" height="2" fill="#eff6ff" />
      <rect x="76" y="0" width="2" height="2" fill="#fff" />

      <!-- 銀色捲線器 -->
      <rect x="6" y="30" width="4" height="4" fill="#6b7280" />
      <rect x="10" y="30" width="4" height="4" fill="#9ca3af" />
      <rect x="6" y="34" width="4" height="4" fill="#9ca3af" />
      <rect x="10" y="34" width="4" height="4" fill="#6b7280" />
      <rect x="8" y="32" width="4" height="4" fill="#d1d5db" />
    </template>

    <!-- 碳纖竿 - 灰黑色 -->
    <template v-else-if="rodId === 'rod_carbon'">
      <!-- 握把 -->
      <rect
        x="0"
        y="20"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect
        x="0"
        y="24"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect
        x="0"
        y="28"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect x="4" y="20" width="4" height="4" :fill="getColors(rodId).handle" />
      <rect x="4" y="24" width="4" height="4" :fill="getColors(rodId).handle" />
      <rect
        x="4"
        y="28"
        width="4"
        height="4"
        :fill="getColors(rodId).handleDark"
      />
      <rect x="0" y="22" width="8" height="2" :fill="getColors(rodId).accent" />
      <rect x="0" y="26" width="8" height="2" :fill="getColors(rodId).accent" />

      <!-- 竿身 - 碳纖維灰 -->
      <rect x="8" y="18" width="4" height="4" :fill="getColors(rodId).rod[0]" />
      <rect
        x="12"
        y="16"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[0]"
      />
      <rect
        x="16"
        y="14"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="20"
        y="12"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[1]"
      />
      <rect
        x="24"
        y="10"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[2]"
      />
      <rect
        x="28"
        y="10"
        width="4"
        height="4"
        :fill="getColors(rodId).rod[2]"
      />
      <rect x="32" y="8" width="4" height="4" :fill="getColors(rodId).rod[2]" />
      <rect x="36" y="8" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="40" y="6" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="44" y="6" width="4" height="4" :fill="getColors(rodId).rod[3]" />
      <rect x="48" y="4" width="4" height="4" fill="#d1d5db" />
      <rect x="52" y="4" width="4" height="4" fill="#d1d5db" />
      <rect x="56" y="4" width="4" height="2" fill="#e5e7eb" />
      <rect x="60" y="2" width="4" height="2" fill="#e5e7eb" />
      <rect x="64" y="2" width="4" height="2" fill="#f3f4f6" />
      <rect x="68" y="0" width="4" height="2" fill="#f3f4f6" />
      <rect x="72" y="0" width="4" height="2" fill="#f9fafb" />
      <rect x="76" y="0" width="2" height="2" fill="#fff" />

      <!-- 灰色捲線器 -->
      <rect x="6" y="30" width="4" height="4" fill="#4b5563" />
      <rect x="10" y="30" width="4" height="4" fill="#6b7280" />
      <rect x="6" y="34" width="4" height="4" fill="#6b7280" />
      <rect x="10" y="34" width="4" height="4" fill="#4b5563" />
      <rect x="8" y="32" width="4" height="4" fill="#9ca3af" />
    </template>

    <!-- 竹竿 - 預設 -->
    <template v-else>
      <!-- 握把（深棕色） -->
      <rect x="0" y="20" width="4" height="4" fill="#78350f" />
      <rect x="0" y="24" width="4" height="4" fill="#78350f" />
      <rect x="0" y="28" width="4" height="4" fill="#78350f" />
      <rect x="4" y="20" width="4" height="4" fill="#92400e" />
      <rect x="4" y="24" width="4" height="4" fill="#92400e" />
      <rect x="4" y="28" width="4" height="4" fill="#78350f" />
      <!-- 握把裝飾線 -->
      <rect x="0" y="22" width="8" height="2" fill="#451a03" />
      <rect x="0" y="26" width="8" height="2" fill="#451a03" />

      <!-- 竿身第一段（粗，棕色） -->
      <rect x="8" y="18" width="4" height="4" fill="#a16207" />
      <rect x="12" y="16" width="4" height="4" fill="#a16207" />
      <rect x="16" y="14" width="4" height="4" fill="#a16207" />
      <rect x="20" y="12" width="4" height="4" fill="#ca8a04" />

      <!-- 竿身第二段（中等，淺棕） -->
      <rect x="24" y="10" width="4" height="4" fill="#ca8a04" />
      <rect x="28" y="10" width="4" height="4" fill="#ca8a04" />
      <rect x="32" y="8" width="4" height="4" fill="#eab308" />
      <rect x="36" y="8" width="4" height="4" fill="#eab308" />
      <rect x="40" y="6" width="4" height="4" fill="#eab308" />
      <rect x="44" y="6" width="4" height="4" fill="#eab308" />

      <!-- 竿身第三段（細，金黃） -->
      <rect x="48" y="4" width="4" height="4" fill="#fbbf24" />
      <rect x="52" y="4" width="4" height="4" fill="#fbbf24" />
      <rect x="56" y="4" width="4" height="2" fill="#fbbf24" />
      <rect x="60" y="2" width="4" height="2" fill="#fbbf24" />
      <rect x="64" y="2" width="4" height="2" fill="#fcd34d" />

      <!-- 竿尖（最細，亮黃） -->
      <rect x="68" y="0" width="4" height="2" fill="#fcd34d" />
      <rect x="72" y="0" width="4" height="2" fill="#fef08a" />
      <rect x="76" y="0" width="2" height="2" fill="#fef08a" />

      <!-- 捲線器（圓形，灰色） -->
      <rect x="6" y="30" width="4" height="4" fill="#6b7280" />
      <rect x="10" y="30" width="4" height="4" fill="#9ca3af" />
      <rect x="6" y="34" width="4" height="4" fill="#9ca3af" />
      <rect x="10" y="34" width="4" height="4" fill="#6b7280" />
      <rect x="8" y="32" width="4" height="4" fill="#d1d5db" />
    </template>
  </svg>
</template>

<style scoped lang="scss">
.pixel-rod {
  image-rendering: pixelated;
}
</style>
