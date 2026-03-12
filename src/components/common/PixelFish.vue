<script setup lang="ts">
/**
 * 像素風格魚類圖案組件
 * 根據魚的 ID 顯示對應的像素圖案
 */

defineProps<{
  fishId: string;
  size?: number;
}>();

// 魚的顏色配置
const fishColors: Record<
  string,
  { body: string[]; accent: string; eye: string }
> = {
  // Tier 1
  fish_crucian: {
    body: ["#94a3b8", "#cbd5e1", "#e2e8f0", "#f1f5f9"], // 銀灰色鯽魚
    accent: "#64748b",
    eye: "#1e293b",
  },
  fish_loach: {
    body: ["#78716c", "#a8a29e", "#d6d3d1", "#e7e5e4"], // 棕灰色泥鰍
    accent: "#57534e",
    eye: "#1c1917",
  },
  fish_minnow: {
    body: ["#fda4af", "#fecdd3", "#ffe4e6", "#fff1f2"], // 粉紅小蝦
    accent: "#f43f5e",
    eye: "#1e293b",
  },
  fish_goldfish: {
    body: ["#f97316", "#fb923c", "#fdba74", "#fed7aa"], // 橘色金魚
    accent: "#ea580c",
    eye: "#1e293b",
  },
  // Tier 2
  fish_carp: {
    body: ["#dc2626", "#ef4444", "#f87171", "#fca5a5"], // 紅色鯉魚
    accent: "#b91c1c",
    eye: "#1e293b",
  },
  fish_bass: {
    body: ["#15803d", "#22c55e", "#4ade80", "#86efac"], // 綠色鱸魚
    accent: "#166534",
    eye: "#1e293b",
  },
  fish_catfish: {
    body: ["#525252", "#737373", "#a3a3a3", "#d4d4d4"], // 深灰鯰魚
    accent: "#404040",
    eye: "#fef08a",
  },
  fish_tilapia: {
    body: ["#0891b2", "#22d3ee", "#67e8f9", "#a5f3fc"], // 青色吳郭魚
    accent: "#0e7490",
    eye: "#1e293b",
  },
  // Tier 3
  fish_salmon: {
    body: ["#f97316", "#fb923c", "#fdba74", "#fed7aa"], // 橘紅鮭魚
    accent: "#c2410c",
    eye: "#1e293b",
  },
  fish_snapper: {
    body: ["#e11d48", "#f43f5e", "#fb7185", "#fda4af"], // 紅色鯛魚
    accent: "#be123c",
    eye: "#1e293b",
  },
  fish_trout: {
    body: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"], // 紫色鱒魚
    accent: "#6d28d9",
    eye: "#1e293b",
  },
  fish_eel: {
    body: ["#1e3a5f", "#2563eb", "#3b82f6", "#60a5fa"], // 深藍鰻魚
    accent: "#1e40af",
    eye: "#fef08a",
  },
  // Tier 4
  fish_tuna: {
    body: ["#1e3a8a", "#2563eb", "#3b82f6", "#93c5fd"], // 藍色金槍魚
    accent: "#1e40af",
    eye: "#1e293b",
  },
  fish_marlin: {
    body: ["#0f172a", "#1e293b", "#334155", "#64748b"], // 深藍旗魚
    accent: "#020617",
    eye: "#fef08a",
  },
  fish_grouper: {
    body: ["#854d0e", "#a16207", "#ca8a04", "#eab308"], // 棕黃石斑
    accent: "#713f12",
    eye: "#1e293b",
  },
  fish_sturgeon: {
    body: ["#374151", "#4b5563", "#6b7280", "#9ca3af"], // 灰色鱘魚
    accent: "#1f2937",
    eye: "#fef08a",
  },
  // Tier 5
  fish_giant: {
    body: ["#0c4a6e", "#0369a1", "#0284c7", "#0ea5e9"], // 深海藍巨魚
    accent: "#075985",
    eye: "#fef08a",
  },
  fish_dragon: {
    body: ["#dc2626", "#f97316", "#fbbf24", "#fef08a"], // 紅金龍魚
    accent: "#b91c1c",
    eye: "#1e293b",
  },
  fish_golden_carp: {
    body: ["#ca8a04", "#eab308", "#facc15", "#fef08a"], // 金色鯉魚
    accent: "#a16207",
    eye: "#1e293b",
  },
  fish_moonfish: {
    body: ["#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff"], // 銀白月光魚
    accent: "#8b5cf6",
    eye: "#6d28d9",
  },
};

function getColors(fishId: string) {
  return fishColors[fishId] || fishColors.fish_goldfish;
}
</script>

<template>
  <svg
    :viewBox="
      fishId === 'fish_minnow'
        ? '0 0 24 24'
        : fishId === 'fish_eel'
          ? '0 0 40 24'
          : fishId === 'fish_marlin'
            ? '0 0 44 32'
            : '0 0 32 32'
    "
    :width="size || 32"
    :height="size || 32"
    shape-rendering="crispEdges"
    class="pixel-fish"
  >
    <!-- 小蝦米 - 特殊造型 -->
    <template v-if="fishId === 'fish_minnow'">
      <rect
        x="8"
        y="10"
        width="2"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="10"
        y="8"
        width="4"
        height="8"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="14"
        y="9"
        width="2"
        height="6"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="16"
        y="10"
        width="2"
        height="4"
        :fill="getColors(fishId).body[3]"
      />
      <!-- 觸鬚 -->
      <rect
        x="18"
        y="9"
        width="2"
        height="1"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="18"
        y="14"
        width="2"
        height="1"
        :fill="getColors(fishId).accent"
      />
      <!-- 眼睛 -->
      <rect x="14" y="11" width="1" height="1" :fill="getColors(fishId).eye" />
      <!-- 尾巴 -->
      <rect x="4" y="9" width="2" height="2" :fill="getColors(fishId).accent" />
      <rect
        x="4"
        y="13"
        width="2"
        height="2"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="6"
        y="10"
        width="2"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
    </template>

    <!-- 鰻魚 - 長條形 -->
    <template v-else-if="fishId === 'fish_eel'">
      <rect
        x="4"
        y="10"
        width="4"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="8"
        y="9"
        width="4"
        height="6"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="12"
        y="9"
        width="4"
        height="6"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="16"
        y="9"
        width="4"
        height="6"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="20"
        y="9"
        width="4"
        height="6"
        :fill="getColors(fishId).body[3]"
      />
      <rect
        x="24"
        y="10"
        width="4"
        height="4"
        :fill="getColors(fishId).body[3]"
      />
      <rect
        x="28"
        y="11"
        width="4"
        height="2"
        :fill="getColors(fishId).body[3]"
      />
      <!-- 頭 -->
      <rect
        x="32"
        y="10"
        width="4"
        height="4"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="36"
        y="11"
        width="2"
        height="2"
        :fill="getColors(fishId).body[3]"
      />
      <!-- 眼睛 -->
      <rect x="34" y="11" width="1" height="1" :fill="getColors(fishId).eye" />
      <!-- 尾巴 -->
      <rect x="0" y="8" width="2" height="3" :fill="getColors(fishId).accent" />
      <rect
        x="0"
        y="13"
        width="2"
        height="3"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="2"
        y="9"
        width="2"
        height="6"
        :fill="getColors(fishId).body[0]"
      />
    </template>

    <!-- 旗魚 - 有長嘴 -->
    <template v-else-if="fishId === 'fish_marlin'">
      <rect
        x="6"
        y="14"
        width="2"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="8"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="10"
        y="10"
        width="4"
        height="12"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="14"
        y="12"
        width="4"
        height="8"
        :fill="getColors(fishId).body[3]"
      />
      <rect
        x="18"
        y="14"
        width="2"
        height="4"
        :fill="getColors(fishId).body[3]"
      />
      <!-- 長嘴 -->
      <rect
        x="20"
        y="15"
        width="4"
        height="2"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="24"
        y="15"
        width="4"
        height="2"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="28"
        y="15"
        width="6"
        height="2"
        :fill="getColors(fishId).body[2]"
      />
      <!-- 眼睛 -->
      <rect x="17" y="14" width="2" height="2" :fill="getColors(fishId).eye" />
      <!-- 背鰭 -->
      <rect
        x="10"
        y="6"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="12"
        y="8"
        width="2"
        height="2"
        :fill="getColors(fishId).accent"
      />
      <!-- 尾巴 -->
      <rect
        x="0"
        y="10"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="0"
        y="18"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="2"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="4"
        y="13"
        width="2"
        height="6"
        :fill="getColors(fishId).body[0]"
      />
    </template>

    <!-- 鯰魚 - 有鬍鬚 -->
    <template v-else-if="fishId === 'fish_catfish'">
      <rect
        x="8"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="10"
        y="10"
        width="2"
        height="12"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="12"
        y="9"
        width="2"
        height="14"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="14"
        y="8"
        width="4"
        height="16"
        :fill="getColors(fishId).body[3]"
      />
      <rect
        x="18"
        y="9"
        width="2"
        height="14"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="20"
        y="10"
        width="2"
        height="12"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="22"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <!-- 鬍鬚 -->
      <rect
        x="24"
        y="13"
        width="4"
        height="1"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="24"
        y="18"
        width="4"
        height="1"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="24"
        y="15"
        width="2"
        height="1"
        :fill="getColors(fishId).accent"
      />
      <!-- 眼睛 -->
      <rect x="20" y="13" width="2" height="2" :fill="getColors(fishId).eye" />
      <!-- 尾巴 -->
      <rect
        x="4"
        y="10"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="4"
        y="18"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="6"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
    </template>

    <!-- 泥鰍 - 細長 -->
    <template v-else-if="fishId === 'fish_loach'">
      <rect
        x="6"
        y="14"
        width="2"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="8"
        y="13"
        width="2"
        height="6"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="10"
        y="12"
        width="4"
        height="8"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="14"
        y="13"
        width="4"
        height="6"
        :fill="getColors(fishId).body[3]"
      />
      <rect
        x="18"
        y="14"
        width="4"
        height="4"
        :fill="getColors(fishId).body[3]"
      />
      <rect
        x="22"
        y="15"
        width="2"
        height="2"
        :fill="getColors(fishId).body[2]"
      />
      <!-- 眼睛 -->
      <rect x="20" y="15" width="1" height="1" :fill="getColors(fishId).eye" />
      <!-- 尾巴 -->
      <rect
        x="2"
        y="13"
        width="2"
        height="2"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="2"
        y="17"
        width="2"
        height="2"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="4"
        y="14"
        width="2"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
    </template>

    <!-- 龍魚 - 華麗 -->
    <template v-else-if="fishId === 'fish_dragon'">
      <rect
        x="8"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="10"
        y="10"
        width="2"
        height="12"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="12"
        y="9"
        width="2"
        height="14"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="14"
        y="8"
        width="4"
        height="16"
        :fill="getColors(fishId).body[3]"
      />
      <rect
        x="18"
        y="9"
        width="2"
        height="14"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="20"
        y="10"
        width="2"
        height="12"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="22"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <!-- 眼睛 -->
      <rect x="20" y="13" width="2" height="2" :fill="getColors(fishId).eye" />
      <rect x="21" y="13" width="1" height="1" fill="#fff" />
      <!-- 華麗背鰭 -->
      <rect
        x="12"
        y="5"
        width="2"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="14"
        y="4"
        width="2"
        height="4"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="16"
        y="5"
        width="2"
        height="3"
        :fill="getColors(fishId).body[2]"
      />
      <!-- 華麗尾巴 -->
      <rect
        x="2"
        y="8"
        width="2"
        height="4"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="2"
        y="20"
        width="2"
        height="4"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="4"
        y="10"
        width="2"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="4"
        y="18"
        width="2"
        height="4"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="6"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <!-- 鬍鬚 -->
      <rect
        x="24"
        y="12"
        width="4"
        height="1"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="24"
        y="19"
        width="4"
        height="1"
        :fill="getColors(fishId).body[2]"
      />
    </template>

    <!-- 月光魚 - 發光效果 -->
    <template v-else-if="fishId === 'fish_moonfish'">
      <rect
        x="10"
        y="10"
        width="2"
        height="12"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="12"
        y="8"
        width="4"
        height="16"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="16"
        y="8"
        width="4"
        height="16"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="20"
        y="10"
        width="2"
        height="12"
        :fill="getColors(fishId).body[3]"
      />
      <!-- 眼睛 -->
      <rect x="18" y="13" width="2" height="2" :fill="getColors(fishId).eye" />
      <!-- 發光點 -->
      <rect x="14" y="12" width="1" height="1" fill="#fff" />
      <rect x="16" y="14" width="1" height="1" fill="#fff" />
      <rect x="15" y="17" width="1" height="1" fill="#fff" />
      <!-- 尾巴 -->
      <rect
        x="4"
        y="10"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="4"
        y="18"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="6"
        y="11"
        width="2"
        height="10"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="8"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <!-- 背鰭 -->
      <rect
        x="14"
        y="5"
        width="2"
        height="3"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="16"
        y="6"
        width="2"
        height="2"
        :fill="getColors(fishId).body[0]"
      />
    </template>

    <!-- 預設魚造型 -->
    <template v-else>
      <rect
        x="8"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <rect
        x="10"
        y="10"
        width="2"
        height="12"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="12"
        y="9"
        width="2"
        height="14"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="14"
        y="8"
        width="4"
        height="16"
        :fill="getColors(fishId).body[3]"
      />
      <rect
        x="18"
        y="9"
        width="2"
        height="14"
        :fill="getColors(fishId).body[2]"
      />
      <rect
        x="20"
        y="10"
        width="2"
        height="12"
        :fill="getColors(fishId).body[1]"
      />
      <rect
        x="22"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
      <!-- 眼睛 -->
      <rect x="20" y="13" width="2" height="2" :fill="getColors(fishId).eye" />
      <rect x="21" y="13" width="1" height="1" fill="#fff" />
      <!-- 背鰭 -->
      <rect
        x="14"
        y="6"
        width="2"
        height="2"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="16"
        y="7"
        width="2"
        height="2"
        :fill="getColors(fishId).body[0]"
      />
      <!-- 腹鰭 -->
      <rect
        x="14"
        y="24"
        width="2"
        height="2"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="16"
        y="23"
        width="2"
        height="2"
        :fill="getColors(fishId).body[0]"
      />
      <!-- 尾巴 -->
      <rect
        x="4"
        y="10"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="4"
        y="18"
        width="2"
        height="4"
        :fill="getColors(fishId).accent"
      />
      <rect
        x="6"
        y="12"
        width="2"
        height="8"
        :fill="getColors(fishId).body[0]"
      />
    </template>
  </svg>
</template>

<style scoped lang="scss">
.pixel-fish {
  image-rendering: pixelated;
}
</style>
