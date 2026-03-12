<script setup lang="ts">
import { getIconSource, useWidgetStyle } from "@/composables/useWidgetStyle";
import { useCanvasStore, useThemeStore } from "@/stores";
import { getShapeStyle } from "@/styles/shape-presets";
import type { WidgetCustomStyle } from "@/types";
import {
    Activity,
    Archive,
    AtSign,
    Bell,
    Bike,
    Bluetooth,
    Book,
    Bookmark,
    BookOpen,
    Box,
    Briefcase,
    Bus,
    Cake,
    Calendar,
    Camera,
    Car,
    Clock,
    Coffee,
    Compass,
    CreditCard,
    Download,
    Dumbbell,
    FileText,
    Film,
    Folder,
    Fuel,
    Gamepad2,
    Gift,
    Globe,
    GraduationCap,
    HardHat,
    Heart,
    Home,
    Image,
    Layers,
    LayoutGrid,
    Link2,
    Mail,
    MapPin,
    MessageCircle,
    MessageSquare,
    Mic,
    Moon,
    Music,
    Navigation,
    Package,
    Pencil,
    // 額外的圖標用於自定義選擇
    Phone,
    Pill,
    Plane,
    Puzzle,
    Search,
    Send,
    Settings,
    Share2,
    Ship,
    ShoppingBag,
    ShoppingCart,
    Sparkles,
    Star,
    Sun,
    Thermometer,
    Train,
    Trash2,
    Trophy,
    Truck,
    User,
    UserCircle,
    UserPlus,
    Users,
    Utensils,
    Volume2,
    Wallet,
    Wifi,
    Wine,
} from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  data?: {
    type?: string;
    label?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  navigate: [page: string];
}>();

const canvasStore = useCanvasStore();
const themeStore = useThemeStore();

// 處理點擊事件
function handleClick() {
  // 編輯模式下不觸發導航
  if (canvasStore.isEditMode) return;

  const label = props.data?.label;
  if (!label) return;

  // 根據標籤映射到對應的頁面
  const pageMap: Record<string, string> = {
    訊息: "message",
    設置: "settings",
    空間: "space",
    音樂: "music",
    購物: "shop",
    外賣: "外賣",
    世界書: "book",
    角色: "character",
    使用者: "user",
    頭盔TA: "peek-phone",
    偷窺TA: "peek-phone",
    閱讀: "media-log",
    書架: "bookshelf",
    行事曆: "calendar",
    占卜: "fate",
  };

  const page = pageMap[label] || label;
  emit("navigate", page);
}

// 使用自定義樣式 composable
const { containerStyle, contentStyle, hasCustomBackground, hasCustomIcon } =
  useWidgetStyle(props.data?.customStyle);

// 從主題 store 獲取桌布亮度判斷（根據實際桌布顏色而非僅時間）
const isDark = computed(() => themeStore.isWallpaperDark);

// 所有可用圖標的映射（包含預設和可選擇的圖標）
const allIconsMap: Record<string, any> = {
  // 預設標籤映射
  訊息: MessageCircle,
  設置: Settings,
  空間: Sparkles,
  音樂: Music,
  健身: Dumbbell,
  錢包: Wallet,
  相冊: LayoutGrid,
  收藏: Globe,
  遊戲: Gamepad2,
  外賣: ShoppingBag,
  購物: ShoppingCart,
  世界書: Book,
  紀念日: Heart,
  短信: Mail,
  角色: UserCircle,
  使用者: User,
  頭盔TA: HardHat,
  偷窺TA: HardHat,
  閱讀: BookOpen,
  書架: Book,
  占卜: Sparkles,
  // 可選擇的圖標名稱映射
  MessageCircle: MessageCircle,
  Settings: Settings,
  Sparkles: Sparkles,
  Music: Music,
  Dumbbell: Dumbbell,
  Wallet: Wallet,
  LayoutGrid: LayoutGrid,
  Globe: Globe,
  Gamepad2: Gamepad2,
  ShoppingBag: ShoppingBag,
  ShoppingCart: ShoppingCart,
  Book: Book,
  Heart: Heart,
  Mail: Mail,
  Phone: Phone,
  Send: Send,
  Share2: Share2,
  Users: Users,
  UserPlus: UserPlus,
  MessageSquare: MessageSquare,
  AtSign: AtSign,
  Search: Search,
  Camera: Camera,
  Image: Image,
  Film: Film,
  Mic: Mic,
  Volume2: Volume2,
  Wifi: Wifi,
  Bluetooth: Bluetooth,
  Bell: Bell,
  Calendar: Calendar,
  Clock: Clock,
  MapPin: MapPin,
  Navigation: Navigation,
  Compass: Compass,
  Sun: Sun,
  Moon: Moon,
  CreditCard: CreditCard,
  Gift: Gift,
  Trophy: Trophy,
  Puzzle: Puzzle,
  Activity: Activity,
  Thermometer: Thermometer,
  Pill: Pill,
  Coffee: Coffee,
  Utensils: Utensils,
  Wine: Wine,
  Cake: Cake,
  Briefcase: Briefcase,
  GraduationCap: GraduationCap,
  Folder: Folder,
  FileText: FileText,
  Pencil: Pencil,
  Bookmark: Bookmark,
  Link2: Link2,
  Car: Car,
  Plane: Plane,
  Train: Train,
  Bike: Bike,
  Ship: Ship,
  Bus: Bus,
  Truck: Truck,
  Fuel: Fuel,
  Layers: Layers,
  Box: Box,
  Package: Package,
  Archive: Archive,
  Trash2: Trash2,
  Download: Download,
  Star: Star,
  Home: Home,
  User: User,
};

// 獲取圖標源
const iconSource = computed(() => getIconSource(props.data?.customStyle));

// 計算當前應該顯示的圖標組件
const iconComponent = computed(() => {
  // 如果有自定義預設圖標
  if (iconSource.value.type === "preset" && iconSource.value.value) {
    return allIconsMap[iconSource.value.value] || MessageCircle;
  }
  // 使用標籤映射的預設圖標
  return allIconsMap[props.data?.label || ""] || MessageCircle;
});

// 是否使用自定義圖片
const useCustomImage = computed(() => {
  return iconSource.value.type === "custom" && iconSource.value.value;
});

// 自定義圖片 URL
const customImageUrl = computed(() => iconSource.value.value);

// 根據 type 決定不規則形狀
const blobShape = computed(() => {
  // 如果有自定義形狀，使用形狀預設
  if (props.data?.customStyle?.shape) {
    return null; // 由 getShapeStyle 處理
  }
  const shapes = [
    "62% 38% 45% 55% / 52% 58% 42% 48%",
    "45% 55% 62% 38% / 38% 45% 55% 62%",
    "55% 45% 38% 62% / 62% 38% 55% 45%",
    "38% 62% 55% 45% / 45% 62% 38% 55%",
  ];
  const idx = parseInt(props.data?.type || "1") - 1;
  return shapes[idx % shapes.length];
});

// 計算 blob 樣式（合併自定義樣式）
const blobStyle = computed(() => {
  const style: Record<string, string> = {};

  // 形狀：優先使用自定義形狀，否則使用預設 blob
  const shapeId = props.data?.customStyle?.shape;
  if (shapeId) {
    const shapeStyles = getShapeStyle(shapeId);
    Object.assign(style, shapeStyles);
  } else if (blobShape.value) {
    style.borderRadius = blobShape.value;
  }

  // 應用圖標大小
  if (props.data?.customStyle?.iconSize) {
    style["--icon-size"] = `${props.data.customStyle.iconSize}%`;
  }

  // 應用自定義背景
  if (props.data?.customStyle?.backgroundGradient) {
    style.background = props.data.customStyle.backgroundGradient;
    style.border = "none";
  } else if (props.data?.customStyle?.backgroundColor) {
    style.backgroundColor = props.data.customStyle.backgroundColor;
    style.border = "none";
  }

  // 應用自定義邊框
  if (props.data?.customStyle?.borderColor) {
    style.borderColor = props.data.customStyle.borderColor;
    style.borderWidth = `${props.data.customStyle.borderWidth || 2}px`;
    style.borderStyle = "solid";
  } else if (isDark.value) {
    // 深色模式時使用白色邊框
    style.borderColor = "rgba(255, 255, 255, 0.3)";
  }

  return style;
});

// 計算圖標樣式
const iconStyle = computed(() => {
  const style: Record<string, string> = {};

  if (props.data?.customStyle?.foregroundColor) {
    // 有自定義顏色時使用自定義顏色
    style.color = props.data.customStyle.foregroundColor;
  } else if (isDark.value) {
    // 深色模式（晚上/深夜）時使用白色
    style.color = "#ffffff";
  }

  return style;
});

// 顯示名稱映射（向後兼容舊數據）
const displayLabelMap: Record<string, string> = {
  偷窺TA: "頭盔TA",
};

const displayLabel = computed(() => {
  const label = props.data?.label || "";
  return displayLabelMap[label] || label;
});
const labelStyle = computed(() => {
  const style: Record<string, string> = {};

  if (props.data?.customStyle?.textColor) {
    style.color = props.data.customStyle.textColor;
  } else if (props.data?.customStyle?.foregroundColor) {
    style.color = props.data.customStyle.foregroundColor;
  } else if (isDark.value) {
    // 深色模式（晚上/深夜）時使用白色
    style.color = "#ffffff";
  }

  return style;
});
</script>

<template>
  <div class="fluid-button" @click="handleClick">
    <div
      class="blob-shape"
      :class="{ 'has-background': hasCustomBackground }"
      :style="blobStyle"
    >
      <!-- 自定義圖片 -->
      <img
        v-if="useCustomImage"
        :src="customImageUrl!"
        alt="自定義圖標"
        class="custom-icon-image"
      />
      <!-- 預設圖標 -->
      <component v-else :is="iconComponent" class="icon" :style="iconStyle" />
    </div>
    <span class="label" v-if="data?.label" :style="labelStyle">{{
      displayLabel
    }}</span>
  </div>
</template>

<style lang="scss" scoped>
.fluid-button {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 4px;
  box-sizing: border-box;
}

.blob-shape {
  // 自適應大小 - 填滿可用空間
  flex: 1;
  width: 100%;
  min-width: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid rgba(0, 0, 0, 0.25);
  transition: all 0.2s ease;
  overflow: hidden;

  &.has-background {
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .icon {
    // 圖標大小隨容器自適應
    width: var(--icon-size, 40%);
    height: var(--icon-size, 40%);
    min-width: 20px;
    min-height: 20px;
    max-width: 64px;
    max-height: 64px;
    color: #1f2937;
    opacity: 0.7;
    transition:
      opacity 0.2s,
      color 0.2s;
  }

  .custom-icon-image {
    width: var(--icon-size, 50%);
    height: var(--icon-size, 50%);
    min-width: 24px;
    min-height: 24px;
    max-width: 72px;
    max-height: 72px;
    object-fit: contain;
    transition: transform 0.2s;
  }
}

.fluid-button:hover .blob-shape {
  border-color: rgba(0, 0, 0, 0.4);
  background: rgba(255, 255, 255, 0.15);

  &.has-background {
    transform: scale(1.02);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  }

  .icon {
    opacity: 1;
  }

  .custom-icon-image {
    transform: scale(1.05);
  }
}

.label {
  font-size: 10px;
  font-weight: 500;
  color: #374151;
  text-align: center;
  letter-spacing: 0.2px;
  margin-top: 2px;
  flex-shrink: 0;
  transition: color 0.2s;
}
</style>
