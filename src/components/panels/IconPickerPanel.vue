<script setup lang="ts">
import DrawIconPanel from "@/components/panels/DrawIconPanel.vue";
import {
    Activity,
    Archive,
    AtSign,
    // 系統
    Bell,
    Bike,
    Bluetooth,
    // 工作學習
    Book,
    Bookmark,
    Box,
    Briefcase,
    Bus,
    Cake,
    Calendar,
    Camera,
    // 交通
    Car,
    Check,
    Clock,
    Code,
    Coffee,
    Compass,
    CreditCard,
    Download,
    // 健康生活
    Dumbbell,
    FileText,
    Film,
    Folder,
    Fuel,
    Gamepad2,
    Gift,
    // 其他
    Globe,
    GraduationCap,
    Heart,
    Home,
    Image,
    Layers,
    LayoutGrid,
    Link2,
    Mail,
    MapPin,
    // 常用
    MessageCircle,
    MessageSquare,
    Mic,
    Moon,
    Music,
    Navigation,
    Package,
    Pencil,
    PenTool,
    // 社交
    Phone,
    Pill,
    Plane,
    Puzzle,
    // 工具
    Search,
    Send,
    Settings,
    Share2,
    Ship,
    ShoppingBag,
    // 購物娛樂
    ShoppingCart,
    Sparkles,
    Star,
    Sun,
    Thermometer,
    Train,
    Trash2,
    Trophy,
    Truck,
    Upload,
    User,
    UserPlus,
    Users,
    Utensils,
    Volume2,
    Wallet,
    Wifi,
    Wine,
    X,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{
  select: [iconName: string];
  selectCustom: [imageUrl: string];
  close: [];
}>();

// 圖標分類
const categories = [
  { id: "common", label: "常用" },
  { id: "social", label: "社交" },
  { id: "tools", label: "工具" },
  { id: "system", label: "系統" },
  { id: "shop", label: "購物" },
  { id: "life", label: "生活" },
  { id: "work", label: "工作" },
  { id: "transport", label: "交通" },
  { id: "other", label: "其他" },
];

const activeCategory = ref("common");

// 圖標映射
const iconGroups: Record<string, { name: string; component: any }[]> = {
  common: [
    { name: "MessageCircle", component: MessageCircle },
    { name: "Settings", component: Settings },
    { name: "Sparkles", component: Sparkles },
    { name: "Music", component: Music },
    { name: "Heart", component: Heart },
    { name: "Star", component: Star },
    { name: "Home", component: Home },
    { name: "User", component: User },
  ],
  social: [
    { name: "Phone", component: Phone },
    { name: "Mail", component: Mail },
    { name: "Send", component: Send },
    { name: "Share2", component: Share2 },
    { name: "Users", component: Users },
    { name: "UserPlus", component: UserPlus },
    { name: "MessageSquare", component: MessageSquare },
    { name: "AtSign", component: AtSign },
  ],
  tools: [
    { name: "Search", component: Search },
    { name: "Camera", component: Camera },
    { name: "Image", component: Image },
    { name: "Film", component: Film },
    { name: "Mic", component: Mic },
    { name: "Volume2", component: Volume2 },
    { name: "Wifi", component: Wifi },
    { name: "Bluetooth", component: Bluetooth },
  ],
  system: [
    { name: "Bell", component: Bell },
    { name: "Calendar", component: Calendar },
    { name: "Clock", component: Clock },
    { name: "MapPin", component: MapPin },
    { name: "Navigation", component: Navigation },
    { name: "Compass", component: Compass },
    { name: "Sun", component: Sun },
    { name: "Moon", component: Moon },
  ],
  shop: [
    { name: "ShoppingCart", component: ShoppingCart },
    { name: "ShoppingBag", component: ShoppingBag },
    { name: "CreditCard", component: CreditCard },
    { name: "Wallet", component: Wallet },
    { name: "Gift", component: Gift },
    { name: "Gamepad2", component: Gamepad2 },
    { name: "Trophy", component: Trophy },
    { name: "Puzzle", component: Puzzle },
  ],
  life: [
    { name: "Dumbbell", component: Dumbbell },
    { name: "Activity", component: Activity },
    { name: "Thermometer", component: Thermometer },
    { name: "Pill", component: Pill },
    { name: "Coffee", component: Coffee },
    { name: "Utensils", component: Utensils },
    { name: "Wine", component: Wine },
    { name: "Cake", component: Cake },
  ],
  work: [
    { name: "Book", component: Book },
    { name: "Briefcase", component: Briefcase },
    { name: "GraduationCap", component: GraduationCap },
    { name: "Folder", component: Folder },
    { name: "FileText", component: FileText },
    { name: "Pencil", component: Pencil },
    { name: "Bookmark", component: Bookmark },
    { name: "Link2", component: Link2 },
  ],
  transport: [
    { name: "Car", component: Car },
    { name: "Plane", component: Plane },
    { name: "Train", component: Train },
    { name: "Bike", component: Bike },
    { name: "Ship", component: Ship },
    { name: "Bus", component: Bus },
    { name: "Truck", component: Truck },
    { name: "Fuel", component: Fuel },
  ],
  other: [
    { name: "Globe", component: Globe },
    { name: "LayoutGrid", component: LayoutGrid },
    { name: "Layers", component: Layers },
    { name: "Box", component: Box },
    { name: "Package", component: Package },
    { name: "Archive", component: Archive },
    { name: "Trash2", component: Trash2 },
    { name: "Download", component: Download },
  ],
};

const currentIcons = computed(() => iconGroups[activeCategory.value] || []);

// 自定義圖片上傳
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadedImage = ref<string | null>(null);
const isUploading = ref(false);

// 繪圖面板狀態
const showDrawPanel = ref(false);

// SVG 代碼輸入
const showSvgInput = ref(false);
const svgCode = ref("");
const svgPreviewUrl = ref<string | null>(null);
const svgError = ref("");

const MAX_ICON_DATA_URL_LENGTH = 120_000;

async function normalizeIconDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  if (dataUrl.length <= MAX_ICON_DATA_URL_LENGTH) return dataUrl;

  return new Promise((resolve) => {
    const img = document.createElement("img");

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      const maxSide = 128;
      const scale = Math.min(
        maxSide / img.naturalWidth,
        maxSide / img.naturalHeight,
        1,
      );
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const candidates = [
        canvas.toDataURL("image/webp", 0.75),
        canvas.toDataURL("image/jpeg", 0.72),
        canvas.toDataURL("image/png", 0.72),
      ];

      const best =
        candidates.find((x) => x.length <= MAX_ICON_DATA_URL_LENGTH) ||
        candidates.reduce(
          (prev, curr) => (curr.length < prev.length ? curr : prev),
          candidates[0],
        );
      resolve(best);
    };

    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function toggleSvgInput() {
  showSvgInput.value = !showSvgInput.value;
  if (!showSvgInput.value) {
    svgCode.value = "";
    svgPreviewUrl.value = null;
    svgError.value = "";
  }
}

function parseSvgCode() {
  svgError.value = "";
  svgPreviewUrl.value = null;

  const code = svgCode.value.trim();
  if (!code) {
    svgError.value = "請輸入 SVG 代碼";
    return;
  }

  // 基本驗證：必須包含 <svg 標籤
  if (!code.includes("<svg")) {
    svgError.value = "無效的 SVG 代碼，需包含 <svg> 標籤";
    return;
  }

  // 安全清理：移除 script 標籤和事件處理器
  const cleaned = code
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "");

  try {
    const blob = new Blob([cleaned], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    // 用 canvas 轉成 PNG data URL
    const img = document.createElement("img");
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      // 居中繪製，保持比例
      const scale = Math.min(128 / img.naturalWidth, 128 / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
      svgPreviewUrl.value = canvas.toDataURL("image/png");
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      svgError.value = "SVG 解析失敗，請檢查代碼格式";
      URL.revokeObjectURL(url);
    };
    img.src = url;
  } catch {
    svgError.value = "SVG 處理失敗";
  }
}

async function confirmSvgIcon() {
  if (svgPreviewUrl.value) {
    const optimized = await normalizeIconDataUrl(svgPreviewUrl.value);
    emit("selectCustom", optimized);
  }
}

function triggerUpload() {
  fileInputRef.value?.click();
}

// 處理繪製的圖標
async function handleDrawnIcon(imageUrl: string) {
  showDrawPanel.value = false;
  const optimized = await normalizeIconDataUrl(imageUrl);
  emit("selectCustom", optimized);
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  // 檢查文件類型
  if (!file.type.startsWith("image/")) {
    alert("請選擇圖片文件");
    return;
  }

  // 檢查文件大小（最大 2MB）
  if (file.size > 2 * 1024 * 1024) {
    alert("圖片大小不能超過 2MB");
    return;
  }

  isUploading.value = true;

  try {
    // 讀取並壓縮圖片
    const imageUrl = await readAndCompressImage(file);
    uploadedImage.value = await normalizeIconDataUrl(imageUrl);
  } catch (error) {
    console.error("圖片處理失敗:", error);
    alert("圖片處理失敗，請重試");
  } finally {
    isUploading.value = false;
  }
}

function readAndCompressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        // 創建 canvas 進行壓縮
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        // 限制最大尺寸為 128x128
        const maxSize = 128;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // 繪製圖片
        ctx.drawImage(img, 0, 0, width, height);

        // 轉換為 Base64
        const dataUrl = canvas.toDataURL("image/webp", 0.8);
        resolve(dataUrl);
      };

      img.onerror = reject;
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function confirmCustomIcon() {
  if (uploadedImage.value) {
    emit("selectCustom", uploadedImage.value);
  }
}

function clearUploadedImage() {
  uploadedImage.value = null;
  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
}

function selectIcon(iconName: string) {
  emit("select", iconName);
}

// 防止滾動穿透
onMounted(() => {
  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";
});

onUnmounted(() => {
  document.body.style.overflow = "";
  document.body.style.touchAction = "";
});
</script>

<template>
  <div class="icon-picker-panel" @touchmove.prevent>
    <div class="panel-backdrop" @click="emit('close')" @touchmove.prevent></div>

    <div class="panel-content" @touchmove.stop>
      <!-- 標題 -->
      <div class="panel-header">
        <h3>選擇圖標</h3>
        <button class="close-btn" @click="emit('close')">
          <X :size="20" :stroke-width="2" />
        </button>
      </div>

      <!-- 自定義上傳區域 -->
      <div class="upload-section">
        <div class="upload-label">自定義圖標</div>
        <div class="upload-buttons">
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            @change="handleFileUpload"
            hidden
          />

          <div v-if="uploadedImage" class="uploaded-preview">
            <img :src="uploadedImage" alt="預覽" />
            <div class="preview-actions">
              <button class="action-btn confirm" @click="confirmCustomIcon">
                <Check :size="16" />
                使用
              </button>
              <button class="action-btn cancel" @click="clearUploadedImage">
                <X :size="16" />
                取消
              </button>
            </div>
          </div>

          <template v-else>
            <button
              class="custom-btn upload"
              :disabled="isUploading"
              @click="triggerUpload"
            >
              <Upload :size="20" />
              <span>{{ isUploading ? "處理中..." : "上傳圖片" }}</span>
            </button>
            <button class="custom-btn draw" @click="showDrawPanel = true">
              <PenTool :size="20" />
              <span>手繪圖標</span>
            </button>
            <button class="custom-btn svg-code" @click="toggleSvgInput">
              <Code :size="20" />
              <span>SVG 代碼</span>
            </button>
          </template>
        </div>

        <!-- SVG 代碼輸入區 -->
        <div v-if="showSvgInput" class="svg-input-section">
          <textarea
            v-model="svgCode"
            class="svg-textarea"
            placeholder='貼上 SVG 代碼，例如：&#10;<svg viewBox="0 0 24 24">&#10;  <path d="M..." />&#10;</svg>'
            rows="5"
            @input="svgError = ''"
          />
          <div v-if="svgError" class="svg-error">{{ svgError }}</div>
          <div class="svg-actions">
            <div v-if="svgPreviewUrl" class="svg-preview-box">
              <img :src="svgPreviewUrl" alt="SVG 預覽" />
            </div>
            <div class="svg-btns">
              <button
                class="action-btn confirm"
                @click="svgPreviewUrl ? confirmSvgIcon() : parseSvgCode()"
              >
                <Check :size="16" />
                {{ svgPreviewUrl ? "使用" : "預覽" }}
              </button>
              <button
                v-if="svgPreviewUrl"
                class="action-btn cancel"
                @click="svgPreviewUrl = null"
              >
                <X :size="16" />
                重選
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 分隔線 -->
      <div class="divider">
        <span>或選擇預設圖標</span>
      </div>

      <!-- 分類標籤 -->
      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat.id"
          :class="['tab', { active: activeCategory === cat.id }]"
          @click="activeCategory = cat.id"
        >
          {{ cat.label }}
        </button>
      </div>

      <!-- 圖標網格 -->
      <div class="icons-grid">
        <button
          v-for="icon in currentIcons"
          :key="icon.name"
          class="icon-item"
          @click="selectIcon(icon.name)"
        >
          <component :is="icon.component" :size="28" :stroke-width="1.5" />
        </button>
      </div>
    </div>

    <!-- 繪圖面板 -->
    <DrawIconPanel
      v-if="showDrawPanel"
      @save="handleDrawnIcon"
      @close="showDrawPanel = false"
    />
  </div>
</template>

<style lang="scss" scoped>
.icon-picker-panel {
  position: fixed;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.panel-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.panel-content {
  position: relative;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  background: #ffffff;
  border-radius: 24px 24px 0 0;
  padding: 20px;
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  transform: translateZ(0);
  will-change: transform;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }
}

// 上傳區域
.upload-section {
  margin-bottom: 16px;
}

.upload-label {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.upload-buttons {
  display: flex;
  gap: 12px;
}

.custom-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;

  &.upload {
    background: #f3f4f6;
    color: #6b7280;
    border: 2px dashed #d1d5db;

    &:hover {
      background: #e5e7eb;
      border-color: #9ca3af;
      color: #374151;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &.draw {
    background: #fef3c7;
    color: #92400e;
    border: 2px solid transparent;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(253, 230, 138, 0.4);
    }
  }

  &.svg-code {
    background: #ede9fe;
    color: #5b21b6;
    border: 2px solid transparent;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(237, 233, 254, 0.6);
    }
  }
}

.upload-area {
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  transition: all 0.2s;

  &:hover {
    border-color: #9ca3af;
  }
}

.upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  padding: 12px 24px;
  width: 100%;

  &:hover {
    color: #374151;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.uploaded-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  width: 100%;

  img {
    width: 64px;
    height: 64px;
    border-radius: 12px;
    object-fit: cover;
    border: 2px solid #e5e7eb;
  }
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;

  &.confirm {
    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
    color: #065f46;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(132, 250, 176, 0.3);
    }
  }

  &.cancel {
    background: #f3f4f6;
    color: #6b7280;

    &:hover {
      background: #e5e7eb;
    }
  }
}

// SVG 代碼輸入區
.svg-input-section {
  margin-top: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 12px;
}

.svg-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  font-family: "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  background: #fff;
  color: #1f2937;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #7c3aed;
  }

  &::placeholder {
    color: #9ca3af;
  }
}

.svg-error {
  margin-top: 6px;
  font-size: 12px;
  color: #e53e3e;
}

.svg-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}

.svg-preview-box {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: 1.5px solid #e5e7eb;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.svg-btns {
  display: flex;
  gap: 8px;
}

// 分隔線
.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e5e7eb;
  }

  span {
    font-size: 12px;
    color: #9ca3af;
  }
}

// 分類標籤
.category-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;

  &::-webkit-scrollbar {
    display: none;
  }

  .tab {
    padding: 6px 14px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    background: #f3f4f6;
    white-space: nowrap;
    transition: all 0.2s;

    &:hover {
      background: #e5e7eb;
    }

    &.active {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
  }
}

// 圖標網格
.icons-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.icon-item {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: #f8fafc;
  color: #374151;
  transition: all 0.2s;

  &:hover {
    background: linear-gradient(135deg, #e0e7ff 0%, #ddd6fe 100%);
    color: #4f46e5;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}
</style>
