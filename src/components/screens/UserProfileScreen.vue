<script setup lang="ts">
import ExpandableTextarea from "@/components/common/ExpandableTextarea.vue";
import ImageCachePicker from "@/components/common/ImageCachePicker.vue";
import {
  useCharactersStore,
  useImageCacheStore,
  useLorebooksStore,
} from "@/stores";
import {
  PersonaDescriptionPosition,
  useUserStore,
  type UserPersona,
} from "@/stores/user";
import { computed, onMounted, ref, watch } from "vue";

// Emits
const emit = defineEmits<{
  (e: "back"): void;
}>();

// Stores
const userStore = useUserStore();
const lorebooksStore = useLorebooksStore();
const imageCacheStore = useImageCacheStore();
const charactersStore = useCharactersStore();

// 當前編輯的角色
const editingPersona = ref<UserPersona | null>(null);

// 顯示圖片緩存選擇器
const showImagePicker = ref(false);

// 顯示世界書選擇器
const showLorebookPicker = ref(false);

// persona-list 滾動容器
const personaListRef = ref<HTMLElement | null>(null);

// 展開的區域
const expandedSections = ref({
  basic: true,
  skills: true,
  group: true,
  description: false,
  lorebook: false,
  advanced: false,
});

// 可用世界書列表
const availableLorebooks = computed(() =>
  lorebooksStore.lorebooks.map((lb) => ({ id: lb.id, name: lb.name })),
);

// 可用角色列表
const availableCharacters = computed(() =>
  charactersStore.characters.map((c) => ({
    id: c.id,
    name: c.nickname || c.data.name,
    avatar: c.avatar || "",
  })),
);

// 已綁定的角色數量
const boundCharacterCount = computed(() => {
  return editingPersona.value?.boundCharacterIds?.length || 0;
});

// 描述位置選項
const positionOptions = [
  { value: PersonaDescriptionPosition.IN_PROMPT, label: "在提示詞中" },
  { value: PersonaDescriptionPosition.TOP_AN, label: "作者筆記頂部" },
  { value: PersonaDescriptionPosition.BOTTOM_AN, label: "作者筆記底部" },
  { value: PersonaDescriptionPosition.AT_DEPTH, label: "指定深度" },
  { value: PersonaDescriptionPosition.NONE, label: "不使用" },
];

// 角色選項
const roleOptions = [
  { value: 0, label: "System" },
  { value: 1, label: "User" },
  { value: 2, label: "Assistant" },
];

// 個人技能：風格標籤（多選）
const styleTagOptions = [
  "簡約",
  "高靈活",
  "低花俏",
  "區分歸納",
  "反覆測試",
  "體感優先",
];

// 初始化
onMounted(async () => {
  // 優先載入使用者資料（頁面核心數據）
  if (!userStore.isLoaded) {
    await userStore.loadUserData();
  }
  // 載入當前角色到編輯狀態
  if (userStore.currentPersona) {
    editingPersona.value = { ...userStore.currentPersona };
  }

  // 非阻塞載入其他 store（不影響頁面首次渲染）
  if (lorebooksStore.lorebooks.length === 0) {
    lorebooksStore.loadLorebooks();
  }
  if (!imageCacheStore.isLoaded) {
    imageCacheStore.loadImageCache();
  }
  if (charactersStore.characters.length === 0) {
    charactersStore.loadCharacters();
  }
});

// 監聽當前角色變化
watch(
  () => userStore.currentPersona,
  (newPersona) => {
    if (newPersona) {
      editingPersona.value = { ...newPersona };
    }
  },
  { deep: true },
);

// 切換區域展開
function toggleSection(section: keyof typeof expandedSections.value) {
  expandedSections.value[section] = !expandedSections.value[section];
}

// 滑鼠滾輪橫向滾動
function handlePersonaListWheel(e: WheelEvent) {
  if (personaListRef.value) {
    e.preventDefault();
    personaListRef.value.scrollLeft += e.deltaY;
  }
}

// 處理返回
function handleBack() {
  emit("back");
}

// 處理儲存
async function handleSave() {
  if (!editingPersona.value) return;

  if (!editingPersona.value.name.trim()) {
    alert("請輸入名稱");
    return;
  }

  userStore.updatePersona(editingPersona.value.id, editingPersona.value);
  await userStore.saveUserData();
}

// 觸發頭像上傳
function triggerAvatarUpload() {
  showImagePicker.value = true;
}

// 處理從緩存選擇圖片
function handleImageSelect(imageData: string) {
  if (editingPersona.value) {
    editingPersona.value.avatar = imageData;
  }
}

// 切換世界書關聯
function toggleLorebook(id: string) {
  if (!editingPersona.value) return;
  const ids = editingPersona.value.lorebookIds || [];
  if (ids.includes(id)) {
    editingPersona.value.lorebookIds = ids.filter((i) => i !== id);
  } else {
    editingPersona.value.lorebookIds = [...ids, id];
  }
}

// 切換角色綁定
function toggleCharacterBinding(characterId: string) {
  if (!editingPersona.value) return;
  const ids = editingPersona.value.boundCharacterIds || [];
  if (ids.includes(characterId)) {
    editingPersona.value.boundCharacterIds = ids.filter(
      (i) => i !== characterId,
    );
  } else {
    editingPersona.value.boundCharacterIds = [...ids, characterId];
  }
}

// 檢查角色是否已綁定
function isCharacterBound(characterId: string): boolean {
  return (editingPersona.value?.boundCharacterIds || []).includes(characterId);
}

// 更新默認可見性
function updateDefaultVisibility(visibility: "public" | "group-only") {
  if (!editingPersona.value) return;
  if (!editingPersona.value.qzoneSettings) {
    editingPersona.value.qzoneSettings = { defaultVisibility: visibility };
  } else {
    editingPersona.value.qzoneSettings.defaultVisibility = visibility;
  }
}

// 切換風格標籤（多選）
function toggleStyleTag(tag: string) {
  if (!editingPersona.value) return;
  const tags = editingPersona.value.styleTags || [];
  if (tags.includes(tag)) {
    editingPersona.value.styleTags = tags.filter((t) => t !== tag);
  } else {
    editingPersona.value.styleTags = [...tags, tag];
  }
}

function hasStyleTag(tag: string): boolean {
  return (editingPersona.value?.styleTags || []).includes(tag);
}

// 創建新角色
async function createNewPersona() {
  const persona = userStore.createPersona("新角色");
  userStore.switchPersona(persona.id);
  editingPersona.value = { ...persona };
  await userStore.saveUserData();
}

// 切換角色
function selectPersona(personaId: string) {
  userStore.switchPersona(personaId);
  const persona = userStore.personas.find((p) => p.id === personaId);
  if (persona) {
    editingPersona.value = { ...persona };
  }
}

// 刪除當前角色
async function deleteCurrentPersona() {
  if (!editingPersona.value) return;
  if (!confirm("確定要刪除這個角色嗎？")) return;

  const success = userStore.deletePersona(editingPersona.value.id);
  if (success) {
    await userStore.saveUserData();
    if (userStore.currentPersona) {
      editingPersona.value = { ...userStore.currentPersona };
    }
  } else {
    alert("無法刪除最後一個角色");
  }
}

// 刪除指定角色（從列表中）
async function deletePersonaById(personaId: string, event: Event) {
  event.stopPropagation(); // 防止觸發選擇

  const persona = userStore.personas.find((p) => p.id === personaId);
  if (!persona) return;

  if (!confirm(`確定要刪除「${persona.name}」嗎？`)) return;

  const success = userStore.deletePersona(personaId);
  if (success) {
    await userStore.saveUserData();
    // 如果刪除的是當前編輯的角色，更新編輯狀態
    if (editingPersona.value?.id === personaId && userStore.currentPersona) {
      editingPersona.value = { ...userStore.currentPersona };
    }
  } else {
    alert("無法刪除最後一個角色");
  }
}

// 切換預設角色
async function toggleDefaultPersona() {
  if (!editingPersona.value) return;
  userStore.setDefaultPersona(editingPersona.value.id);
  await userStore.saveUserData();
}

// 複製角色
async function duplicateCurrentPersona() {
  if (!editingPersona.value) return;
  const newPersona = userStore.duplicatePersona(editingPersona.value.id);
  if (newPersona) {
    userStore.switchPersona(newPersona.id);
    editingPersona.value = { ...newPersona };
    await userStore.saveUserData();
  }
}

// 導入 JSON input ref
const importInput = ref<HTMLInputElement | null>(null);

// 觸發導入
function triggerImport() {
  importInput.value?.click();
}

// 處理導入 JSON
async function handleImportJson(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!file.name.endsWith(".json")) {
    alert("請選擇 JSON 檔案");
    return;
  }

  try {
    const text = await file.text();
    const jsonData = JSON.parse(text);

    // 檢查是否為 SillyTavern personas 格式
    if (!jsonData.personas || !jsonData.persona_descriptions) {
      alert(
        "無效的 personas JSON 格式\n需要包含 personas 和 persona_descriptions",
      );
      return;
    }

    const count = await userStore.importFromSillyTavern(jsonData);
    alert(`成功導入 ${count} 個角色`);

    // 更新編輯狀態
    if (userStore.currentPersona) {
      editingPersona.value = { ...userStore.currentPersona };
    }
  } catch (e) {
    console.error("導入失敗:", e);
    alert("導入失敗: " + (e as Error).message);
  }

  // 清空 input
  input.value = "";
}

// 導出 JSON
function handleExportJson() {
  const data = userStore.exportToSillyTavern();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `personas_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 清空所有角色
async function handleClearAll() {
  if (!confirm("確定要清空所有角色嗎？此操作不可恢復！")) return;
  if (!confirm("再次確認：這將刪除所有角色資料！")) return;

  await userStore.clearAllPersonas();
  if (userStore.currentPersona) {
    editingPersona.value = { ...userStore.currentPersona };
  }
  alert("已清空所有角色");
}
</script>

<template>
  <div class="screen-container user-profile-screen">
    <!-- 標題欄 -->
    <header class="soft-header gradient">
      <button class="header-back" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>

      <h1 class="header-title">使用者設定</h1>

      <div class="header-actions">
        <button class="header-btn primary" title="儲存" @click="handleSave">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- 內容區 -->
    <main class="soft-content edit-content">
      <!-- 角色選擇器 -->
      <section class="persona-selector">
        <div
          ref="personaListRef"
          class="persona-list"
          @wheel="handlePersonaListWheel"
        >
          <div
            v-for="persona in userStore.personas"
            :key="persona.id"
            class="persona-item"
            :class="{ active: persona.id === userStore.currentPersonaId }"
            @click="selectPersona(persona.id)"
          >
            <!-- 刪除按鈕（只有多於一個角色時顯示） -->
            <button
              v-if="userStore.personas.length > 1"
              class="persona-delete-btn"
              title="刪除此角色"
              @click="deletePersonaById(persona.id, $event)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
            <div class="persona-avatar-small">
              <img v-if="persona.avatar" :src="persona.avatar" alt="" />
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
              </svg>
            </div>
            <span class="persona-name-small">{{ persona.name }}</span>
            <!-- 預設角色標記 -->
            <span
              v-if="persona.id === userStore.defaultPersonaId"
              class="persona-default-badge"
              title="預設角色"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                />
              </svg>
            </span>
          </div>
          <button class="add-persona-btn" @click="createNewPersona">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>
      </section>

      <!-- 頭像區域 -->
      <section class="avatar-section" v-if="editingPersona">
        <div class="avatar-wrapper" @click="triggerAvatarUpload">
          <img
            v-if="editingPersona.avatar"
            :src="editingPersona.avatar"
            alt="頭像"
            class="avatar-preview"
          />
          <div v-else class="avatar-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
          </div>
          <div class="avatar-edit-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </svg>
          </div>
        </div>
        <p class="avatar-hint">點擊選擇或上傳頭像</p>
        <button
          class="default-persona-btn"
          :class="{ active: editingPersona.id === userStore.defaultPersonaId }"
          @click="toggleDefaultPersona"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
            />
          </svg>
          {{
            editingPersona.id === userStore.defaultPersonaId
              ? "取消預設角色"
              : "設為預設角色"
          }}
        </button>
        <p class="avatar-cache-hint">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
            />
          </svg>
          已緩存 {{ imageCacheStore.count }} 張圖片
        </p>
      </section>

      <!-- 圖片緩存選擇器 -->
      <ImageCachePicker
        :visible="showImagePicker"
        @close="showImagePicker = false"
        @select="handleImageSelect"
      />

      <!-- 基本信息 -->
      <section class="edit-section" v-if="editingPersona">
        <div class="section-header" @click="toggleSection('basic')">
          <h3 class="section-title">基本信息</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.basic }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.basic" class="section-content">
            <div class="form-group">
              <label class="form-label"
                >名稱 <span class="required">*</span></label
              >
              <input
                v-model="editingPersona.name"
                type="text"
                class="soft-input"
                placeholder="輸入你的名稱"
              />
              <p class="form-hint">
                這個名稱會在聊天中顯示，也會替換 &#123;&#123;user&#125;&#125;
                巨集
              </p>
            </div>
          </div>
        </Transition>
      </section>

      <!-- 使用者設定 -->
      <section class="edit-section" v-if="editingPersona">
        <div class="section-header" @click="toggleSection('skills')">
          <h3 class="section-title">使用者設定</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.skills }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.skills" class="section-content">
            <div class="form-group">
              <label class="form-label">描述</label>
              <ExpandableTextarea
                v-model="editingPersona.description"
                :rows="6"
                placeholder="描述你的角色設定、外觀、性格等..."
                label="描述"
              />
              <p class="form-hint">這段描述會被注入到 AI 的提示詞中</p>
            </div>

            <div class="form-group">
              <label class="form-label">NAI 使用者串</label>
              <ExpandableTextarea
                v-model="editingPersona.naiUserPrompt"
                :rows="3"
                placeholder="例如：male, short hair, glasses"
                label="NAI 使用者串"
              />
              <p class="form-hint">
                需在聊天頁開啟「使用 User Tag」後，生圖時才會注入
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">
                <svg viewBox="0 0 24 24" fill="currentColor" class="label-icon">
                  <path
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                  />
                </svg>
                用戶的秘密
              </label>
              <ExpandableTextarea
                v-model="editingPersona.secrets"
                :rows="4"
                placeholder="你有什麼不想讓對方知道的秘密？"
                label="用戶的秘密"
              />
              <p class="form-hint">
                這些秘密只有用戶主動說出來，AI角色才會知道。用於思考框架中的用戶秘密層面。
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">
                <svg viewBox="0 0 24 24" fill="currentColor" class="label-icon">
                  <path
                    d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"
                  />
                </svg>
                與AI角色的權力關係
              </label>
              <ExpandableTextarea
                v-model="editingPersona.powerDynamic"
                :rows="4"
                placeholder="例如：我是他的上司 / 我們是平等的朋友 / 他是我的導師..."
                label="與AI角色的權力關係"
              />
              <p class="form-hint">
                描述你與AI角色之間的權力動態，這會影響對話的態度和互動方式。
              </p>
            </div>


          </div>
        </Transition>
      </section>

      <!-- 我的群組 -->
      <section class="edit-section" v-if="editingPersona">
        <div class="section-header" @click="toggleSection('group')">
          <h3 class="section-title">
            <svg viewBox="0 0 24 24" fill="currentColor" class="section-icon">
              <path
                d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
              />
            </svg>
            我的群組
          </h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.group }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.group" class="section-content">
            <!-- 群組名稱 -->
            <div class="form-group">
              <label class="form-label">群組名稱</label>
              <input
                v-model="editingPersona.groupName"
                type="text"
                class="soft-input"
                placeholder="例如：閨蜜群、工作夥伴..."
              />
              <p class="form-hint">
                給你的群組取個名字，會顯示在噗浪空間發文時
              </p>
            </div>

            <!-- 群組成員 -->
            <div class="form-group">
              <label class="form-label"
                >群組成員（已選 {{ boundCharacterCount }} 位）</label
              >
              <div class="character-list">
                <div
                  v-for="char in availableCharacters"
                  :key="char.id"
                  class="character-item"
                  :class="{ bound: isCharacterBound(char.id) }"
                  @click="toggleCharacterBinding(char.id)"
                >
                  <div class="character-checkbox">
                    <svg
                      v-if="isCharacterBound(char.id)"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                      />
                    </svg>
                  </div>
                  <div class="character-avatar">
                    <img v-if="char.avatar" :src="char.avatar" alt="" />
                    <svg v-else viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                      />
                    </svg>
                  </div>
                  <span class="character-name">{{ char.name }}</span>
                </div>
                <p
                  v-if="availableCharacters.length === 0"
                  class="no-characters"
                >
                  還沒有角色，請先創建角色
                </p>
              </div>
              <p class="form-hint">
                勾選的角色會成為你的群組成員，同時也會綁定到此使用者身份。<br />
                打開已綁定角色的聊天時，系統會自動切換為此使用者角色。
              </p>
            </div>

            <!-- 默認可見性 -->
            <div class="form-group">
              <label class="form-label">默認發文可見性</label>
              <div class="visibility-options">
                <label
                  class="visibility-option"
                  :class="{
                    active:
                      editingPersona.qzoneSettings?.defaultVisibility ===
                        'public' ||
                      !editingPersona.qzoneSettings?.defaultVisibility,
                  }"
                >
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    :checked="
                      editingPersona.qzoneSettings?.defaultVisibility ===
                        'public' ||
                      !editingPersona.qzoneSettings?.defaultVisibility
                    "
                    @change="updateDefaultVisibility('public')"
                  />
                  <svg viewBox="0 0 24 24" fill="currentColor" class="vis-icon">
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
                    />
                  </svg>
                  <span>全員可見</span>
                </label>
                <label
                  class="visibility-option"
                  :class="{
                    active:
                      editingPersona.qzoneSettings?.defaultVisibility ===
                      'group-only',
                  }"
                >
                  <input
                    type="radio"
                    name="visibility"
                    value="group-only"
                    :checked="
                      editingPersona.qzoneSettings?.defaultVisibility ===
                      'group-only'
                    "
                    @change="updateDefaultVisibility('group-only')"
                  />
                  <svg viewBox="0 0 24 24" fill="currentColor" class="vis-icon">
                    <path
                      d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                    />
                  </svg>
                  <span>僅群組成員</span>
                </label>
              </div>
              <p class="form-hint">
                全員可見：所有角色都可以看見並留言<br />
                僅群組成員：只有上方選擇的角色可以看見
              </p>
            </div>
          </div>
        </Transition>
      </section>



      <!-- 綁定世界書 -->
      <section class="edit-section" v-if="editingPersona">
        <div class="section-header" @click="toggleSection('lorebook')">
          <h3 class="section-title">綁定世界書</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.lorebook }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.lorebook" class="section-content">
            <div class="lorebook-list">
              <div
                v-for="lbId in editingPersona.lorebookIds"
                :key="lbId"
                class="lorebook-item"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="lorebook-icon"
                >
                  <path
                    d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
                  />
                </svg>
                <span class="lorebook-name">{{
                  availableLorebooks.find((lb) => lb.id === lbId)?.name ||
                  "未知世界書"
                }}</span>
                <button class="lorebook-remove" @click="toggleLorebook(lbId)">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                  </svg>
                </button>
              </div>
              <button
                class="add-lorebook-btn"
                @click="showLorebookPicker = !showLorebookPicker"
              >
                + 綁定世界書
              </button>
            </div>

            <Transition name="slide">
              <div v-if="showLorebookPicker" class="lorebook-picker">
                <label
                  v-for="lb in availableLorebooks"
                  :key="lb.id"
                  class="lorebook-option"
                >
                  <input
                    type="checkbox"
                    :checked="editingPersona.lorebookIds?.includes(lb.id)"
                    @change="toggleLorebook(lb.id)"
                  />
                  <span>{{ lb.name }}</span>
                </label>
                <p v-if="availableLorebooks.length === 0" class="no-lorebooks">
                  還沒有世界書
                </p>
              </div>
            </Transition>
          </div>
        </Transition>
      </section>

      <!-- 進階設定 -->
      <section class="edit-section" v-if="editingPersona">
        <div class="section-header" @click="toggleSection('advanced')">
          <h3 class="section-title">進階設定</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.advanced }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.advanced" class="section-content">
            <div class="form-group">
              <label class="form-label">描述位置</label>
              <select
                v-model="editingPersona.descriptionPosition"
                class="soft-input"
              >
                <option
                  v-for="opt in positionOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
              <p class="form-hint">決定角色描述在提示詞中的位置</p>
            </div>

            <div
              class="form-group"
              v-if="
                editingPersona.descriptionPosition ===
                PersonaDescriptionPosition.AT_DEPTH
              "
            >
              <label class="form-label">深度</label>
              <input
                v-model.number="editingPersona.descriptionDepth"
                type="number"
                class="soft-input"
                min="0"
                max="999"
              />
              <p class="form-hint">0 = 最新消息之後，數字越大越靠前</p>
            </div>

            <div class="form-group">
              <label class="form-label">角色類型</label>
              <select
                v-model="editingPersona.descriptionRole"
                class="soft-input"
              >
                <option
                  v-for="opt in roleOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
              <p class="form-hint">描述消息的角色類型</p>
            </div>

            <div class="action-buttons">
              <button class="action-btn" @click="duplicateCurrentPersona">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                  />
                </svg>
                複製角色
              </button>
              <button class="action-btn danger" @click="deleteCurrentPersona">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
                刪除角色
              </button>
            </div>
          </div>
        </Transition>
      </section>

      <!-- 導入/導出 -->
      <section class="edit-section import-export-section">
        <div class="section-header">
          <h3 class="section-title">導入 / 導出</h3>
        </div>
        <div class="section-content">
          <p class="form-hint" style="margin-bottom: 12px">
            支援 SillyTavern personas JSON 格式
          </p>
          <div class="action-buttons">
            <button class="action-btn import" @click="triggerImport">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
              </svg>
              導入 JSON
            </button>
            <button class="action-btn export" @click="handleExportJson">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              導出 JSON
            </button>
            <button class="action-btn danger" @click="handleClearAll">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                />
              </svg>
              清空所有角色
            </button>
          </div>
          <input
            ref="importInput"
            type="file"
            accept=".json"
            class="hidden-input"
            @change="handleImportJson"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.user-profile-screen {
  background: #f5f5f5;
}

.edit-content {
  padding: 16px;
  padding-bottom: calc(16px + var(--safe-bottom, 0px));
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

// 角色選擇器
.persona-selector {
  margin-bottom: 16px;
  width: 100%;
  overflow: hidden;
}

.persona-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 8px 4px;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  box-sizing: border-box;

  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;

    &:hover {
      background: rgba(0, 0, 0, 0.3);
    }
  }
}

.persona-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 64px;
  position: relative;

  &:hover {
    background: rgba(0, 0, 0, 0.05);

    .persona-delete-btn {
      opacity: 1;
    }
  }

  &.active {
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

    .persona-avatar-small {
      border-color: var(--color-primary, #7dd3a8);
    }
  }
}

.persona-delete-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: rgba(239, 68, 68, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition:
    opacity 0.2s,
    transform 0.2s;
  z-index: 1;

  svg {
    width: 12px;
    height: 12px;
    color: white;
  }

  &:hover {
    transform: scale(1.1);
    background: #ef4444;
  }

  &:active {
    transform: scale(0.95);
  }

  // 在觸控設備上始終顯示
  @media (hover: none) {
    opacity: 0.8;
  }
}

.persona-avatar-small {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid transparent;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 24px;
    height: 24px;
    color: #9ca3af;
  }
}

.persona-name-small {
  font-size: 12px;
  color: #666;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.persona-default-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 14px;
    height: 14px;
    color: #f59e0b;
  }
}

.add-persona-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px dashed #ccc;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

  svg {
    width: 24px;
    height: 24px;
    color: #9ca3af;
  }

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
    background: rgba(125, 211, 168, 0.1);

    svg {
      color: var(--color-primary, #7dd3a8);
    }
  }
}

// 頭像區域
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

.avatar-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  cursor: pointer;

  &:hover .avatar-edit-badge {
    transform: scale(1.1);
  }
}

.avatar-preview {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4px solid #e0e0e0;

  svg {
    width: 48px;
    height: 48px;
    color: #9ca3af;
  }
}

.avatar-edit-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 36px;
  height: 36px;
  background: var(--color-primary, #7dd3a8);
  border-radius: 50%;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;

  svg {
    width: 18px;
    height: 18px;
    color: white;
  }
}

.avatar-hint {
  margin-top: 12px;
  font-size: 13px;
  color: #6b7280;
}

.default-persona-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  background: #f9fafb;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 16px;
    height: 16px;
    color: #9ca3af;
  }

  &:hover {
    background: #f0f0f0;
  }

  &.active {
    background: #fff8e1;
    border-color: #f59e0b;
    color: #d97706;

    svg {
      color: #f59e0b;
    }
  }
}

.avatar-cache-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;

  svg {
    width: 14px;
    height: 14px;
  }
}

.hidden-input {
  display: none;
}

// 區域樣式
.edit-section {
  background: white;
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f9fafb;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.section-icon {
  width: 20px;
  height: 20px;
  color: var(--color-primary, #7dd3a8);
}

.section-chevron {
  width: 20px;
  height: 20px;
  color: #9ca3af;
  transition: transform 0.2s;

  &.open {
    transform: rotate(180deg);
  }
}

.section-content {
  padding: 0 16px 16px;
  width: 100%;
  box-sizing: border-box;
}

// 角色列表（群組成員選擇）
.character-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.character-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e8e8e8;
  }

  &.bound {
    background: rgba(125, 211, 168, 0.15);
    border: 1px solid var(--color-primary, #7dd3a8);

    .character-checkbox {
      background: var(--color-primary, #7dd3a8);
      border-color: var(--color-primary, #7dd3a8);

      svg {
        color: white;
      }
    }
  }
}

.character-checkbox {
  width: 22px;
  height: 22px;
  border: 2px solid #ccc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;

  svg {
    width: 14px;
    height: 14px;
  }
}

.character-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 20px;
    height: 20px;
    color: #9ca3af;
  }
}

.character-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.no-characters {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

// 可見性選項
.visibility-options {
  display: flex;
  gap: 12px;
}

.visibility-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: #f5f5f5;
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  input[type="radio"] {
    display: none;
  }

  .vis-icon {
    width: 28px;
    height: 28px;
    color: #9ca3af;
    transition: color 0.2s;
  }

  span {
    font-size: 13px;
    font-weight: 500;
    color: #666;
  }

  &:hover {
    background: #e8e8e8;
  }

  &.active {
    background: rgba(125, 211, 168, 0.15);
    border-color: var(--color-primary, #7dd3a8);

    .vis-icon {
      color: var(--color-primary, #7dd3a8);
    }

    span {
      color: var(--color-primary, #7dd3a8);
      font-weight: 600;
    }
  }
}

// 表單
.form-group {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;

  .required {
    color: #ef4444;
  }

  .label-icon {
    width: 16px;
    height: 16px;
    color: #9ca3af;
  }
}

.form-hint {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: #999;
}

.soft-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary, #7dd3a8);
  }

  &::placeholder {
    color: #9ca3af;
  }

  &.textarea {
    resize: vertical;
    min-height: 60px;
  }
}

select.soft-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

// 世界書列表
.lorebook-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lorebook-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;

  .lorebook-icon {
    width: 20px;
    height: 20px;
    color: var(--color-primary, #7dd3a8);
  }

  .lorebook-name {
    flex: 1;
    font-size: 14px;
  }

  .lorebook-remove {
    border: none;
    background: transparent;
    padding: 4px;
    cursor: pointer;
    transition: transform 0.2s;

    svg {
      width: 18px;
      height: 18px;
      color: #9ca3af;
    }

    &:hover {
      transform: scale(1.1);

      svg {
        color: #ef4444;
      }
    }
  }
}

.add-lorebook-btn {
  padding: 12px;
  background: #f5f5f5;
  border: 2px dashed #ccc;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e8e8e8;
    border-color: #999;
  }
}

.lorebook-picker {
  margin-top: 8px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 8px;
}

.lorebook-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: white;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
}

.no-lorebooks {
  padding: 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

// 操作按鈕
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: #f5f5f5;
  color: #666;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: #e8e8e8;
  }

  &.danger {
    background: #ffebee;
    color: #f44336;

    &:hover {
      background: #ffcdd2;
    }
  }

  &.import {
    background: #e3f2fd;
    color: #1976d2;

    &:hover {
      background: #bbdefb;
    }
  }

  &.export {
    background: #e8f5e9;
    color: #388e3c;

    &:hover {
      background: #c8e6c9;
    }
  }
}

// 個人技能：風格標籤
.style-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.style-tag {
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #4b5563;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  &.active {
    background: rgba(125, 211, 168, 0.16);
    border-color: var(--color-primary, #7dd3a8);
    color: #166534;
  }
}

// 導入導出區域
.import-export-section {
  .section-content {
    padding: 16px;
  }
}

// 標題欄按鈕
.header-btn {
  &.primary {
    background: var(--color-primary, #7dd3a8);
    color: white;

    &:hover {
      filter: brightness(0.95);
    }
  }
}

// 動畫
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
</style>
