<script setup lang="ts">
import { computed, ref, nextTick } from "vue";

interface GroupMemberInfo {
  characterId: string;
  name: string;
  nickname?: string;
  avatar: string;
  isAdmin: boolean;
  isMuted: boolean;
  /** 是否為用戶本人（置頂、不可移除） */
  isSelf?: boolean;
  // === 多人卡子角色徽章資訊 ===
  /** 子角色來源類型：inline/character/multichar/persona */
  subCharSource?: "inline" | "character" | "multichar" | "persona";
  /** 是否為使用者角色型（由 AI 代演） */
  isPersonaMember?: boolean;
  /** 綁定的使用者名稱（關係綁定） */
  boundPersonaName?: string;
  /** 關係標籤（戀人/青梅竹馬等） */
  relationLabel?: string;
  /** 是否引入好感度 */
  affinityEnabled?: boolean;
}

interface SelectableCharacter {
  id: string;
  name: string;
  avatar: string;
}

// === 子角色匯入來源（多人卡）===
interface CharacterSourceItem {
  id: string;
  name: string;
  avatar: string;
  description?: string;
  personality?: string;
  scenario?: string;
  privateChatId?: string;
}
interface MultiCharSourceItem {
  sourceChatId: string;
  cardName: string;
  member: {
    id: string;
    name: string;
    avatar: string;
    source?: string;
    personaSnapshot?: {
      description?: string;
      personality?: string;
      scenario?: string;
    };
  };
}
interface PersonaSourceItem {
  id: string;
  name: string;
  avatar: string;
  description?: string;
}
interface BindablePersona {
  id: string;
  name: string;
}

/** 加子角色 emit payload（與 useMultiCharMembers.AddSubCharPayload 對齊） */
interface AddSubCharEmitPayload {
  name: string;
  avatar?: string;
  source?: "inline" | "character" | "multichar" | "persona";
  sourceId?: string;
  sourceChatId?: string;
  personaSnapshot?: {
    description?: string;
    personality?: string;
    scenario?: string;
  };
  isPersonaMember?: boolean;
  userBinding?: {
    mode: "none" | "bound";
    boundPersonaId?: string;
    boundPersonaName?: string;
    relationLabel?: string;
    flaunt?: boolean;
  };
  affinity?: {
    enabled: boolean;
    sourceChatId?: string;
  };
}

interface LorebookInfo {
  id: string;
  name: string;
  entries: unknown[];
}

const props = defineProps<{
  displayAvatar: string;
  characterName: string;
  isGroupChat: boolean;
  groupDisplayName: string;
  displayCharacterName: string;
  groupMemberCount?: number;
  isCharBlocked: boolean;
  groupMembers?: GroupMemberInfo[];
  /** 用戶本人名稱（顯示於成員列表頂部） */
  currentUserName?: string;
  /** 用戶本人頭像 */
  currentUserAvatar?: string;
  isMultiCharCard?: boolean;
  groupAvatar?: string;
  availableCharacters?: SelectableCharacter[];
  groupLorebookIds?: string[];
  availableLorebooks?: LorebookInfo[];
  // === 子角色匯入來源（多人卡）===
  characterSources?: CharacterSourceItem[];
  multiCharSources?: MultiCharSourceItem[];
  personaSources?: PersonaSourceItem[];
  bindablePersonas?: BindablePersona[];
}>();

const emit = defineEmits<{
  close: [];
  navigate: [page: "character" | "worldbook" | "peek-phone" | "settings"];
  "open-search-bar": [];
  "open-chat-info": [];
  "open-chat-files-panel": [];
  "export-current-chat": [];
  "trigger-jsonl-import": [];
  "start-new-conversation": [];
  "toggle-block-character": [];
  "clear-chat-history": [];
  "open-proactive-message-settings": [];
  "open-chat-vars": [];
  "update-group-name": [name: string];
  "change-group-avatar": [dataUrl: string];
  "remove-group-avatar": [];
  "add-group-member": [characterId: string];
  "remove-group-member": [characterId: string];
  "toggle-member-admin": [characterId: string];
  "toggle-member-mute": [characterId: string];
  "toggle-lorebook": [lorebookId: string];
  "add-multichar-member": [payload: AddSubCharEmitPayload];
  "remove-multichar-member": [id: string];
  /** 普通群聊：新增成員（多來源 + 關係綁定 + 好感度，與多人卡同 payload） */
  "add-group-member-rich": [payload: AddSubCharEmitPayload];
}>();

const displayName = computed(() => props.isGroupChat ? props.groupDisplayName : props.displayCharacterName);
// 暱稱：displayCharacterName 與 characterName 不同時表示有設定暱稱
const nickname = computed(() => {
  if (props.isGroupChat) return null;
  const hasNickname = props.displayCharacterName && props.characterName &&
    props.displayCharacterName !== props.characterName;
  return hasNickname ? props.characterName : null;
});

// === 群聊成員清單（含收合） ===
const allMembers = computed<GroupMemberInfo[]>(() => props.groupMembers || []);

// 用戶本人作為群成員，置頂顯示且不可移除
const selfMember = computed<GroupMemberInfo>(() => ({
  characterId: "__self__",
  name: props.currentUserName || "我",
  avatar: props.currentUserAvatar || "",
  isAdmin: false,
  isMuted: false,
  isSelf: true,
}));

// 含用戶本人的完整成員清單（用戶置頂）
const membersWithSelf = computed<GroupMemberInfo[]>(() => [
  selfMember.value,
  ...allMembers.value,
]);

// 成員總數（角色 + 用戶本人）
const totalMemberCount = computed(
  () => (props.groupMemberCount || allMembers.value.length) + 1,
);

const showAllMembers = ref(false);
// 預設只顯示前 8 位，其餘收合
const visibleMembers = computed(() =>
  showAllMembers.value
    ? membersWithSelf.value
    : membersWithSelf.value.slice(0, 8),
);

const hasCustomAvatar = computed(() => !!props.groupAvatar);

// === 群名稱內聯編輯 ===
const editingName = ref(false);
const nameDraft = ref("");
const nameInputRef = ref<HTMLInputElement | null>(null);
async function startEditName() {
  nameDraft.value = displayName.value;
  editingName.value = true;
  await nextTick();
  nameInputRef.value?.focus();
  nameInputRef.value?.select();
}
function confirmEditName() {
  if (!editingName.value) return;
  const trimmed = nameDraft.value.trim();
  if (trimmed && trimmed !== displayName.value) {
    emit("update-group-name", trimmed);
  }
  editingName.value = false;
}
function cancelEditName() {
  editingName.value = false;
}

// === 群頭像內聯上傳 ===
const avatarInputRef = ref<HTMLInputElement | null>(null);
function triggerAvatarUpload() {
  avatarInputRef.value?.click();
}
function onAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target?.result as string;
    if (result) emit("change-group-avatar", result);
  };
  reader.readAsDataURL(file);
  input.value = "";
}

// === 加成員（普通群聊）===
const showMemberPicker = ref(false);
const addableCharacters = computed<SelectableCharacter[]>(() => props.availableCharacters || []);
function pickMember(characterId: string) {
  emit("add-group-member", characterId);
}

// === 子角色（多人卡）內聯新增 ===
const showSubcharForm = ref(false);
const subcharName = ref("");
const subcharAvatar = ref("");
const subcharAvatarInputRef = ref<HTMLInputElement | null>(null);

// 來源類型：inline=手動輸入；character=角色卡；multichar=其他多人卡子角色；persona=使用者角色
const subcharSourceType = ref<"inline" | "character" | "multichar" | "persona">(
  "inline",
);
// 選中的來源實體 ID（character→characterId；multichar→sourceChatId::memberId；persona→personaId）
const subcharSelectedSourceKey = ref("");
// 好感度引入開關（僅 character 來源、且該角色有私聊時可用）
const subcharAffinityEnabled = ref(false);
// 關係綁定
const subcharBindMode = ref<"none" | "bound">("none");
const subcharBoundPersonaId = ref("");
const subcharRelationLabel = ref("");
const subcharFlaunt = ref(false);

const charSources = computed<CharacterSourceItem[]>(
  () => props.characterSources || [],
);
const mcSources = computed<MultiCharSourceItem[]>(
  () => props.multiCharSources || [],
);
const personaSrc = computed<PersonaSourceItem[]>(
  () => props.personaSources || [],
);
const bindablePersonaList = computed<BindablePersona[]>(
  () => props.bindablePersonas || [],
);

// 當前選中的角色卡來源（用於判斷好感度可用性）
const selectedCharacterSource = computed<CharacterSourceItem | null>(() => {
  if (subcharSourceType.value !== "character") return null;
  return (
    charSources.value.find((c) => c.id === subcharSelectedSourceKey.value) ||
    null
  );
});
const affinityAvailable = computed(
  () => !!selectedCharacterSource.value?.privateChatId,
);

function triggerSubcharAvatarUpload() {
  subcharAvatarInputRef.value?.click();
}
function onSubcharAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    subcharAvatar.value = (e.target?.result as string) || "";
  };
  reader.readAsDataURL(file);
  input.value = "";
}

// 切換來源類型時重置選擇
function onSourceTypeChange() {
  subcharSelectedSourceKey.value = "";
  subcharAffinityEnabled.value = false;
}

function buildUserBinding(): AddSubCharEmitPayload["userBinding"] {
  if (subcharBindMode.value !== "bound" || !subcharBoundPersonaId.value) {
    return { mode: "none" };
  }
  const persona = bindablePersonaList.value.find(
    (p) => p.id === subcharBoundPersonaId.value,
  );
  return {
    mode: "bound",
    boundPersonaId: subcharBoundPersonaId.value,
    boundPersonaName: persona?.name,
    relationLabel: subcharRelationLabel.value.trim() || undefined,
    flaunt: subcharFlaunt.value,
  };
}

function confirmAddSubchar() {
  const type = subcharSourceType.value;
  let payload: AddSubCharEmitPayload | null = null;

  if (type === "inline") {
    const name = subcharName.value.trim();
    if (!name) return;
    payload = {
      name,
      avatar: subcharAvatar.value,
      source: "inline",
      userBinding: buildUserBinding(),
    };
  } else if (type === "character") {
    const src = charSources.value.find(
      (c) => c.id === subcharSelectedSourceKey.value,
    );
    if (!src) return;
    payload = {
      name: src.name,
      avatar: src.avatar,
      source: "character",
      sourceId: src.id,
      sourceChatId: src.privateChatId,
      personaSnapshot: {
        description: src.description,
        personality: src.personality,
        scenario: src.scenario,
      },
      userBinding: buildUserBinding(),
      affinity:
        subcharAffinityEnabled.value && src.privateChatId
          ? { enabled: true, sourceChatId: src.privateChatId }
          : { enabled: false },
    };
  } else if (type === "multichar") {
    const src = mcSources.value.find(
      (m) => `${m.sourceChatId}::${m.member.id}` === subcharSelectedSourceKey.value,
    );
    if (!src) return;
    payload = {
      name: src.member.name,
      avatar: src.member.avatar,
      source: "multichar",
      sourceId: src.member.id,
      sourceChatId: src.sourceChatId,
      personaSnapshot: src.member.personaSnapshot,
      userBinding: buildUserBinding(),
    };
  } else if (type === "persona") {
    const src = personaSrc.value.find(
      (p) => p.id === subcharSelectedSourceKey.value,
    );
    if (!src) return;
    payload = {
      name: src.name,
      avatar: src.avatar,
      source: "persona",
      sourceId: src.id,
      isPersonaMember: true,
      personaSnapshot: { description: src.description },
      userBinding: buildUserBinding(),
    };
  }

  if (!payload) return;
  if (props.isMultiCharCard) {
    emit("add-multichar-member", payload);
  } else {
    emit("add-group-member-rich", payload);
  }
  resetSubcharForm();
}

function resetSubcharForm() {
  subcharName.value = "";
  subcharAvatar.value = "";
  subcharSourceType.value = "inline";
  subcharSelectedSourceKey.value = "";
  subcharAffinityEnabled.value = false;
  subcharBindMode.value = "none";
  subcharBoundPersonaId.value = "";
  subcharRelationLabel.value = "";
  subcharFlaunt.value = false;
  showSubcharForm.value = false;
}
function cancelAddSubchar() {
  resetSubcharForm();
}

// 確認按鈕是否可用
const canConfirmSubchar = computed(() => {
  if (subcharSourceType.value === "inline") return !!subcharName.value.trim();
  return !!subcharSelectedSourceKey.value;
});

// 快捷操作/面板「加成員」：統一展開多來源子角色表單（普通群聊與多人卡共用）
function onAddMemberQuick() {
  showSubcharForm.value = true;
}

// === 世界書 ===
const lorebooks = computed<LorebookInfo[]>(() => props.availableLorebooks || []);
const boundLorebookIds = computed<string[]>(() => props.groupLorebookIds || []);
function isLorebookBound(id: string) {
  return boundLorebookIds.value.includes(id);
}

function handleAction(action: string) {
  switch (action) {
    case "character":
    case "worldbook":
    case "peek-phone":
    case "settings":
      emit("navigate", action as "character" | "worldbook" | "peek-phone" | "settings");
      break;
    case "search":
      emit("close");
      emit("open-search-bar");
      break;
    case "chat-info":
      emit("open-chat-info");
      break;
    case "chat-vars":
      emit("open-chat-vars");
      break;
    case "chat-files":
      emit("close");
      emit("open-chat-files-panel");
      break;
    case "export":
      emit("export-current-chat");
      break;
    case "import":
      emit("trigger-jsonl-import");
      break;
    case "new-conversation":
      emit("start-new-conversation");
      break;
    case "block":
      emit("toggle-block-character");
      break;
    case "clear":
      emit("clear-chat-history");
      break;
  }
}
</script>

<template>
  <div class="chat-details-screen">
    <!-- 環境裝飾光暈 -->
    <div class="ambient-glow ambient-glow--top"></div>
    <div class="ambient-glow ambient-glow--bottom"></div>

    <!-- 浮動頂部標題列 -->
    <header class="float-header">
      <button class="header-btn" :title="'返回'" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="header-title">{{ isGroupChat ? '群組詳情' : '聊天詳情' }}</h1>
      <div class="header-btn-placeholder"></div>
    </header>

    <!-- ============ 群聊模式：全內聯版面 ============ -->
    <main v-if="isGroupChat" class="details-main">
      <!-- Hero：群頭像（內聯上傳）+ 群名（內聯編輯）+ 成員數 -->
      <section class="profile-section">
        <button
          class="avatar-container avatar-container--editable"
          :title="'更換群組頭像'"
          @click="triggerAvatarUpload"
        >
          <div class="avatar-frame">
            <img v-if="displayAvatar" :src="displayAvatar" :alt="displayName" />
            <div v-else class="avatar-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="9" r="3" />
                <circle cx="17" cy="10" r="2.2" />
                <path d="M3 19v-1a5.5 5.5 0 0 1 11 0v1" />
                <path d="M14 14a4 4 0 0 1 7 4v1" />
              </svg>
            </div>
          </div>
          <span class="avatar-edit-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
        </button>
        <input
          ref="avatarInputRef"
          type="file"
          accept="image/*"
          class="hidden-file-input"
          @change="onAvatarFileChange"
        />
        <button
          v-if="hasCustomAvatar"
          class="avatar-remove-btn"
          @click="emit('remove-group-avatar')"
        >
          移除頭像
        </button>

        <!-- 群名稱：內聯編輯（鉛筆） -->
        <div class="name-edit-row">
          <template v-if="!editingName">
            <h2 class="profile-name">{{ displayName }}</h2>
            <button class="name-edit-btn" :title="'編輯群名稱'" @click="startEditName">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </template>
          <template v-else>
            <input
              ref="nameInputRef"
              v-model="nameDraft"
              class="name-edit-input"
              type="text"
              placeholder="輸入群名稱"
              @keydown.enter="confirmEditName"
              @keydown.esc="cancelEditName"
              @blur="confirmEditName"
            />
            <button class="name-edit-confirm" @mousedown.prevent="confirmEditName">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
          </template>
        </div>
        <p class="profile-subtitle">{{ totalMemberCount }} 位成員</p>

        <!-- 快捷操作列：搜尋 / 加成員 / 清空 -->
        <div class="quick-actions">
          <button class="quick-action" @click="handleAction('search')">
            <span class="quick-action-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <span class="quick-action-label">搜尋</span>
          </button>
          <button class="quick-action" @click="onAddMemberQuick">
            <span class="quick-action-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6" />
                <path d="M22 11h-6" />
              </svg>
            </span>
            <span class="quick-action-label">{{ isMultiCharCard ? '子角色' : '加成員' }}</span>
          </button>
          <button class="quick-action quick-action--danger" @click="handleAction('clear')">
            <span class="quick-action-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
            <span class="quick-action-label">清空</span>
          </button>
        </div>
      </section>

      <!-- 內容流 -->
      <div class="content-flow">
        <!-- 成員區：直接顯示成員 + 內聯管理 -->
        <section class="glass-panel rounded-soft">
          <div class="panel-deco panel-deco--bl"></div>
          <div class="panel-head">
            <h3 class="panel-title">成員 · {{ totalMemberCount }}</h3>
            <button class="panel-head-action" @click="onAddMemberQuick">
              + 加{{ isMultiCharCard ? '子角色' : '成員' }}
            </button>
          </div>

          <div class="member-list">
            <div
              v-for="member in visibleMembers"
              :key="member.characterId"
              class="member-row"
            >
              <div class="member-row-avatar">
                <img v-if="member.avatar" :src="member.avatar" :alt="member.name" />
                <div v-else class="member-row-placeholder">{{ member.name.charAt(0) }}</div>
              </div>
              <div class="member-row-info">
                <span class="member-row-name">{{ member.name }}</span>
                <div class="member-row-badges">
                  <span v-if="member.isSelf" class="badge badge--self">我</span>
                  <span v-if="member.isAdmin" class="badge badge--admin">管理員</span>
                  <span v-if="member.isMuted" class="badge badge--muted">已禁言</span>
                  <!-- 多人卡子角色來源徽章 -->
                  <span v-if="member.isPersonaMember" class="badge badge--persona">使用者角色·代演</span>
                  <span v-else-if="member.subCharSource === 'character'" class="badge badge--source">角色卡</span>
                  <span v-else-if="member.subCharSource === 'multichar'" class="badge badge--source">多人卡</span>
                  <span v-if="member.boundPersonaName" class="badge badge--bound">
                    綁定·{{ member.relationLabel || member.boundPersonaName }}
                  </span>
                  <span v-if="member.affinityEnabled" class="badge badge--affinity">好感度</span>
                </div>
              </div>
              <!-- 用戶本人：不可操作 -->
              <div v-if="member.isSelf" class="member-row-actions"></div>
              <!-- 普通群聊：管理員 / 禁言 / 移除 -->
              <div v-else-if="!isMultiCharCard" class="member-row-actions">
                <button
                  class="member-op"
                  :class="{ active: member.isAdmin }"
                  :title="'管理員'"
                  @click="emit('toggle-member-admin', member.characterId)"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                </button>
                <button
                  class="member-op"
                  :class="{ active: member.isMuted }"
                  :title="'禁言'"
                  @click="emit('toggle-member-mute', member.characterId)"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3z" />
                  </svg>
                </button>
                <button
                  class="member-op member-op--danger"
                  :title="'移除'"
                  @click="emit('remove-group-member', member.characterId)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <!-- 多人卡：移除子角色 -->
              <div v-else class="member-row-actions">
                <button
                  class="member-op member-op--danger"
                  :title="'移除'"
                  @click="emit('remove-multichar-member', member.characterId)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <button
            v-if="membersWithSelf.length > 8"
            class="member-show-all"
            @click="showAllMembers = !showAllMembers"
          >
            {{ showAllMembers ? '收起' : `顯示全部 ${totalMemberCount} 位成員` }}
          </button>

          <!-- 加成員：普通群聊角色挑選（內聯） -->
          <div v-if="!isMultiCharCard && showMemberPicker" class="member-picker">
            <div class="member-picker-head">
              <span class="member-picker-title">選擇要加入的角色</span>
              <button class="member-picker-close" @click="showMemberPicker = false">收起</button>
            </div>
            <div v-if="addableCharacters.length === 0" class="empty-hint">
              沒有可加入的角色
            </div>
            <div v-else class="picker-list">
              <button
                v-for="char in addableCharacters"
                :key="char.id"
                class="picker-item"
                @click="pickMember(char.id)"
              >
                <div class="picker-avatar">
                  <img v-if="char.avatar" :src="char.avatar" :alt="char.name" />
                  <div v-else class="picker-placeholder">{{ char.name.charAt(0) }}</div>
                </div>
                <span class="picker-name">{{ char.name }}</span>
                <svg class="picker-add" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 加成員/子角色：多來源內聯表單（普通群聊與多人卡共用，含關係綁定 + 好感度） -->
          <div v-if="showSubcharForm" class="subchar-form">
            <!-- 來源類型選擇 -->
            <div class="subchar-source-tabs">
              <button
                class="source-tab"
                :class="{ active: subcharSourceType === 'inline' }"
                @click="subcharSourceType = 'inline'; onSourceTypeChange()"
              >
                手動輸入
              </button>
              <button
                class="source-tab"
                :class="{ active: subcharSourceType === 'character' }"
                @click="subcharSourceType = 'character'; onSourceTypeChange()"
              >
                角色卡
              </button>
              <button
                class="source-tab"
                :class="{ active: subcharSourceType === 'multichar' }"
                @click="subcharSourceType = 'multichar'; onSourceTypeChange()"
              >
                其他多人卡
              </button>
              <button
                class="source-tab"
                :class="{ active: subcharSourceType === 'persona' }"
                @click="subcharSourceType = 'persona'; onSourceTypeChange()"
              >
                使用者角色
              </button>
            </div>

            <!-- 手動輸入 -->
            <template v-if="subcharSourceType === 'inline'">
              <div class="subchar-row">
                <button class="subchar-avatar" @click="triggerSubcharAvatarUpload">
                  <img v-if="subcharAvatar" :src="subcharAvatar" alt="頭像預覽" />
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <input
                  v-model="subcharName"
                  class="subchar-input"
                  type="text"
                  placeholder="角色名稱"
                  @keydown.enter="confirmAddSubchar"
                />
              </div>
              <input
                v-model="subcharAvatar"
                class="subchar-input"
                type="text"
                placeholder="頭像連結（或點左側上傳圖片）"
              />
              <input
                ref="subcharAvatarInputRef"
                type="file"
                accept="image/*"
                class="hidden-file-input"
                @change="onSubcharAvatarFileChange"
              />
            </template>

            <!-- 角色卡來源 -->
            <template v-else-if="subcharSourceType === 'character'">
              <div v-if="charSources.length === 0" class="empty-hint">
                尚無角色卡
              </div>
              <select v-else v-model="subcharSelectedSourceKey" class="subchar-select">
                <option value="" disabled>選擇要引入的角色卡</option>
                <option v-for="c in charSources" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select>
              <!-- 好感度引入開關 -->
              <label
                v-if="affinityAvailable"
                class="subchar-toggle"
              >
                <input type="checkbox" v-model="subcharAffinityEnabled" />
                <span>引入私聊好感度（唯讀，群聊不增減）</span>
              </label>
              <p
                v-else-if="subcharSelectedSourceKey"
                class="subchar-hint-mini"
              >
                此角色無私聊紀錄，無法引入好感度
              </p>
            </template>

            <!-- 其他多人卡子角色來源 -->
            <template v-else-if="subcharSourceType === 'multichar'">
              <div v-if="mcSources.length === 0" class="empty-hint">
                尚無其他多人卡子角色
              </div>
              <select v-else v-model="subcharSelectedSourceKey" class="subchar-select">
                <option value="" disabled>選擇要引入的子角色</option>
                <option
                  v-for="m in mcSources"
                  :key="`${m.sourceChatId}::${m.member.id}`"
                  :value="`${m.sourceChatId}::${m.member.id}`"
                >
                  {{ m.member.name }}（來自 {{ m.cardName }}）
                </option>
              </select>
            </template>

            <!-- 使用者角色來源 -->
            <template v-else-if="subcharSourceType === 'persona'">
              <div v-if="personaSrc.length === 0" class="empty-hint">
                尚無使用者角色
              </div>
              <select v-else v-model="subcharSelectedSourceKey" class="subchar-select">
                <option value="" disabled>選擇要引入的使用者角色</option>
                <option v-for="p in personaSrc" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select>
              <p class="subchar-hint-mini">此使用者角色將由 AI 代演</p>
            </template>

            <!-- 關係綁定（所有來源皆可設定，persona 來源除外的角色才有意義，但統一提供） -->
            <div v-if="subcharSourceType !== 'persona'" class="subchar-binding">
              <div class="subchar-binding-head">關係綁定</div>
              <div class="subchar-bind-modes">
                <label class="subchar-radio">
                  <input type="radio" value="none" v-model="subcharBindMode" />
                  <span>只針對當前使用者</span>
                </label>
                <label class="subchar-radio">
                  <input type="radio" value="bound" v-model="subcharBindMode" />
                  <span>已綁定其他使用者</span>
                </label>
              </div>
              <template v-if="subcharBindMode === 'bound'">
                <select v-model="subcharBoundPersonaId" class="subchar-select">
                  <option value="" disabled>選擇綁定的使用者角色</option>
                  <option
                    v-for="p in bindablePersonaList"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.name }}
                  </option>
                </select>
                <input
                  v-model="subcharRelationLabel"
                  class="subchar-input"
                  type="text"
                  placeholder="關係描述（如：戀人 / 青梅竹馬 / 主從）"
                />
                <label class="subchar-toggle">
                  <input type="checkbox" v-model="subcharFlaunt" />
                  <span>允許炫耀與綁定使用者的甜蜜日常</span>
                </label>
              </template>
            </div>

            <div class="subchar-actions">
              <button class="subchar-cancel" @click="cancelAddSubchar">取消</button>
              <button
                class="subchar-confirm"
                :disabled="!canConfirmSubchar"
                @click="confirmAddSubchar"
              >
                新增
              </button>
            </div>
          </div>
        </section>

        <!-- 綁定世界書（多人卡不顯示，因角色卡本身可綁定世界書） -->
        <section v-if="!isMultiCharCard" class="glass-panel organic-shape-2">
          <div class="panel-deco panel-deco--right"></div>
          <h3 class="panel-title">綁定世界書（僅此群組生效）</h3>
          <div v-if="lorebooks.length === 0" class="empty-hint">
            尚無世界書，請先建立世界書
          </div>
          <div v-else class="lorebook-list">
            <button
              v-for="lb in lorebooks"
              :key="lb.id"
              class="lorebook-item"
              :class="{ active: isLorebookBound(lb.id) }"
              @click="emit('toggle-lorebook', lb.id)"
            >
              <span class="lorebook-check">
                <svg v-if="isLorebookBound(lb.id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span class="lorebook-info">
                <span class="lorebook-name">{{ lb.name }}</span>
                <span class="lorebook-count">{{ lb.entries.length }} 條目</span>
              </span>
            </button>
          </div>
        </section>

        <!-- 群組功能 -->
        <section class="glass-panel rounded-soft">
          <h3 class="panel-title">群組功能</h3>
          <div class="list-group">
            <button class="list-item" @click="handleAction('chat-vars')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7h16" />
                  <path d="M4 17h16" />
                  <circle cx="8" cy="7" r="2" />
                  <circle cx="16" cy="17" r="2" />
                </svg>
              </div>
              <span class="list-label">專屬預設</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('chat-info')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </div>
              <span class="list-label">聊天資訊</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('chat-files')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                </svg>
              </div>
              <span class="list-label">聊天檔案</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>

        <!-- 資料管理 -->
        <section class="glass-panel rounded-soft">
          <h3 class="panel-title">資料管理</h3>
          <div class="list-group">
            <button class="list-item" @click="handleAction('export')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
              </div>
              <span class="list-label">導出聊天</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('import')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
              </div>
              <span class="list-label">匯入 JSONL</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('new-conversation')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9" />
                  <path d="M3 4v5h5" />
                </svg>
              </div>
              <span class="list-label">開啟新對話</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>
      </div>
    </main>

    <!-- ============ 單人模式：維持原本版面 ============ -->
    <main v-else class="details-main">
      <!-- 個人資料 -->
      <section class="profile-section">
        <div class="avatar-container">
          <div class="avatar-glow"></div>
          <div class="avatar-frame">
            <img v-if="displayAvatar" :src="displayAvatar" :alt="characterName" />
            <div v-else class="avatar-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
              </svg>
            </div>
          </div>
        </div>
        <h2 class="profile-name">{{ displayName }}</h2>
        <p v-if="nickname" class="profile-subtitle">{{ nickname }}</p>

        <!-- 快捷導航：直接置於名稱下方，無面板包裹 -->
        <div class="quick-honeycomb">
          <div class="hex-row hex-row--top">
            <button class="quick-item" @click="handleAction('character')">
              <div class="quick-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                </svg>
              </div>
              <span class="quick-label">角色卡</span>
            </button>
            <button class="quick-item quick-item--hero" @click="handleAction('chat-vars')">
              <div class="quick-icon quick-icon--hero">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7h16" />
                  <path d="M4 17h16" />
                  <circle cx="8" cy="7" r="2" />
                  <circle cx="16" cy="17" r="2" />
                </svg>
              </div>
              <span class="quick-label">專屬預設</span>
            </button>
            <button class="quick-item" @click="handleAction('worldbook')">
              <div class="quick-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <span class="quick-label">世界書</span>
            </button>
          </div>
          <div class="hex-row hex-row--bottom">
            <button class="quick-item" @click="handleAction('peek-phone')">
              <div class="quick-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </div>
              <span class="quick-label">頭盔TA</span>
            </button>
            <button class="quick-item" @click="handleAction('settings')">
              <div class="quick-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <span class="quick-label">設置</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 內容流 -->
      <div class="content-flow">
        <!-- 聊天管理 -->
        <section class="glass-panel rounded-soft">
          <div class="panel-deco panel-deco--bl"></div>
          <h3 class="panel-title">聊天管理</h3>
          <div class="list-group">
            <button class="list-item" @click="emit('open-proactive-message-settings')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <span class="list-label">主動發訊息設置</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('search')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <span class="list-label">搜索訊息</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('chat-info')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </div>
              <span class="list-label">聊天資訊</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('chat-files')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                </svg>
              </div>
              <span class="list-label">聊天檔案</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>

        <!-- 資料管理 -->
        <section class="glass-panel organic-shape-2">
          <div class="panel-deco panel-deco--right"></div>
          <h3 class="panel-title">資料管理</h3>
          <div class="list-group">
            <button class="list-item" @click="handleAction('export')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
              </div>
              <span class="list-label">導出聊天</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('import')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
              </div>
              <span class="list-label">匯入 JSONL</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('new-conversation')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9" />
                  <path d="M3 4v5h5" />
                </svg>
              </div>
              <span class="list-label">開啟新對話</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>

        <!-- 危險操作 -->
        <section class="glass-panel rounded-soft">
          <h3 class="panel-title">危險操作</h3>
          <div class="list-group">
            <button class="list-item danger" @click="handleAction('block')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m4.93 4.93 14.14 14.14" />
                </svg>
              </div>
              <span class="list-label">{{ isCharBlocked ? '解除封鎖' : '封鎖角色' }}</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item danger" @click="handleAction('clear')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <span class="list-label">清空聊天</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.chat-details-screen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% -10%,
      color-mix(in srgb, var(--color-primary, #00723a) 8%, var(--color-background)) 0%,
      var(--color-background) 60%);
  color: var(--color-text);
  font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}

/* === 環境光暈 === */
.ambient-glow {
  position: absolute;
  border-radius: 9999px;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.3;
}

.ambient-glow--top {
  top: 80px;
  left: -10%;
  width: 260px;
  height: 260px;
  background: color-mix(in srgb, var(--color-primary, #00723a) 35%, transparent);
}

.ambient-glow--bottom {
  bottom: 160px;
  right: -10%;
  width: 320px;
  height: 320px;
  background: color-mix(in srgb, var(--color-primary, #00723a) 18%, transparent);
}

/* === 浮動標題列 === */
.float-header {
  position: fixed;
  top: max(16px, calc(var(--safe-top, 0px) + 16px));
  left: 16px;
  right: 16px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 6px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-surface) 60%, transparent);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--color-surface) 80%, transparent);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  z-index: 50;
}

.header-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: transparent;
  border: none;
  color: var(--color-primary, #00723a);
  cursor: pointer;
  transition: background-color 0.2s, transform 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--color-primary, #00723a) 12%, transparent);
  }

  &:active {
    transform: scale(0.92);
  }

  svg {
    width: 22px;
    height: 22px;
  }
}

.header-btn-placeholder {
  width: 40px;
  height: 40px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-primary, #00723a);
  margin: 0;
  letter-spacing: 0.2px;
}

/* === 主要內容區 === */
.details-main {
  position: relative;
  z-index: 10;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  width: 100%;
  padding:
    calc(max(16px, calc(var(--safe-top, 0px) + 16px)) + 56px + 24px)
    20px
    calc(24px + max(0px, var(--safe-bottom, 0px)));
}

/* === 個人資料 === */
.profile-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
}

.avatar-container {
  position: relative;
  width: 128px;
  height: 128px;
  margin-bottom: 16px;
}

/* 群聊：可點擊編輯的頭像 */
.avatar-container--editable {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(0.34, 1.32, 0.64, 1);

  &:active {
    transform: scale(0.96);
  }
}

.avatar-edit-badge {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--color-primary, #00723a);
  color: var(--color-on-primary, #ffffff);
  border: 3px solid var(--color-surface);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary, #00723a) 30%, transparent);

  svg {
    width: 16px;
    height: 16px;
  }
}

.avatar-remove-btn {
  margin: -4px 0 12px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-error, #b3261e);
  background: color-mix(in srgb, var(--color-error, #b3261e) 8%, transparent);
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--color-error, #b3261e) 14%, transparent);
  }
}

.hidden-file-input {
  display: none;
}

.avatar-glow {
  display: none;
}

.avatar-frame {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  overflow: hidden;
  border: 3px solid var(--color-surface);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-primary, #00723a) 18%, transparent),
    0 12px 28px color-mix(in srgb, var(--color-primary, #00723a) 18%, transparent);
  background: var(--color-surface);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);

    svg {
      width: 56px;
      height: 56px;
    }
  }
}

.profile-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 4px;
  text-align: center;
  letter-spacing: -0.2px;
}

.profile-subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
  text-align: center;
}

/* === 群名稱：內聯編輯 === */
.name-edit-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 4px;
  max-width: 100%;

  .profile-name {
    margin: 0;
  }
}

.name-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 9999px;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--color-primary, #00723a) 12%, transparent);
    color: var(--color-primary, #00723a);
  }

  svg {
    width: 15px;
    height: 15px;
  }
}

.name-edit-input {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
  background: color-mix(in srgb, var(--color-surface) 85%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary, #00723a) 35%, transparent);
  border-radius: 12px;
  padding: 4px 12px;
  max-width: 220px;
  outline: none;

  &:focus {
    border-color: var(--color-primary, #00723a);
  }
}

.name-edit-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9999px;
  background: var(--color-primary, #00723a);
  color: var(--color-on-primary, #ffffff);
  border: none;
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
  }
}

/* === 群聊：快捷操作列 === */
.quick-actions {
  display: flex;
  justify-content: center;
  gap: 28px;
  margin-top: 22px;
}

.quick-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(0.34, 1.32, 0.64, 1);

  &:active {
    transform: translateY(-1px) scale(0.95);
  }

  &:hover .quick-action-icon {
    background: var(--color-primary, #00723a);
    color: var(--color-on-primary, #ffffff);
    box-shadow: 0 10px 22px color-mix(in srgb, var(--color-primary, #00723a) 28%, transparent);
  }
}

.quick-action-icon {
  width: 54px;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-surface) 95%, transparent);
  color: var(--color-primary, #00723a);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: background-color 0.25s, color 0.25s, box-shadow 0.3s;

  svg {
    width: 22px;
    height: 22px;
  }
}

.quick-action--danger {
  .quick-action-icon {
    color: var(--color-error, #b3261e);
  }

  .quick-action-label {
    color: var(--color-error, #b3261e);
  }

  &:hover .quick-action-icon {
    background: var(--color-error, #b3261e);
    color: #ffffff;
    box-shadow: 0 10px 22px color-mix(in srgb, var(--color-error, #b3261e) 28%, transparent);
  }
}

.quick-action-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  letter-spacing: 0.3px;
}

/* === 內容流 === */
.content-flow {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}

/* === 玻璃面板 === */
.glass-panel {
  position: relative;
  padding: 22px 22px;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--color-surface) 75%, transparent);
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
  width: 100%;
  box-sizing: border-box;
}

.rounded-soft {
  border-radius: 28px;
}

.organic-shape-2 {
  border-radius: 28px;
}

.panel-deco {
  position: absolute;
  border-radius: 9999px;
  filter: blur(40px);
  pointer-events: none;
  z-index: 0;

  &--bl {
    bottom: 0;
    left: 0;
    width: 160px;
    height: 160px;
    background: color-mix(in srgb, var(--color-primary, #00723a) 14%, transparent);
    opacity: 0.4;
    transform: translate(-30%, 50%);
  }

  &--right {
    top: 50%;
    right: 0;
    width: 100px;
    height: 100px;
    background: color-mix(in srgb, var(--color-primary, #00723a) 20%, transparent);
    opacity: 0.25;
    transform: translate(40%, -50%);
  }
}

.panel-title {
  position: relative;
  z-index: 1;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 1.6px;
  margin: 0 0 16px;
}

/* === 群聊：面板標題列（標題 + 動作） === */
.panel-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  .panel-title {
    margin: 0;
  }
}

.panel-head-action {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary, #00723a);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 9999px;
  transition: background-color 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--color-primary, #00723a) 12%, transparent);
  }
}

/* === 群聊：成員列表（行式） === */
.member-list {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 6px;
  border-radius: 16px;
  transition: background-color 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
  }
}

.member-row-avatar {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--color-surface);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.member-row-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary, #00723a) 14%, var(--color-surface));
  color: var(--color-primary, #00723a);
  font-size: 18px;
  font-weight: 600;
}

.member-row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.member-row-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-row-badges {
  display: flex;
  gap: 6px;
}

.badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 9999px;

  &--admin {
    color: var(--color-primary, #00723a);
    background: color-mix(in srgb, var(--color-primary, #00723a) 14%, transparent);
  }

  &--muted {
    color: var(--color-error, #b3261e);
    background: color-mix(in srgb, var(--color-error, #b3261e) 12%, transparent);
  }

  &--self {
    color: var(--color-primary, #00723a);
    background: color-mix(in srgb, var(--color-primary, #00723a) 18%, transparent);
  }

  &--persona {
    color: #7c3aed;
    background: color-mix(in srgb, #7c3aed 14%, transparent);
  }

  &--source {
    color: var(--color-text-secondary);
    background: color-mix(in srgb, var(--color-text-secondary) 14%, transparent);
  }

  &--bound {
    color: #d946a6;
    background: color-mix(in srgb, #d946a6 14%, transparent);
  }

  &--affinity {
    color: #d97706;
    background: color-mix(in srgb, #d97706 14%, transparent);
  }
}

.member-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.member-op {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--color-surface) 80%, transparent);
  }

  &.active {
    color: var(--color-primary, #00723a);
    background: color-mix(in srgb, var(--color-primary, #00723a) 14%, transparent);
  }

  &--danger:hover {
    color: var(--color-error, #b3261e);
    background: color-mix(in srgb, var(--color-error, #b3261e) 12%, transparent);
  }

  svg {
    width: 16px;
    height: 16px;
  }
}

.member-show-all {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary, #00723a);
  background: color-mix(in srgb, var(--color-primary, #00723a) 8%, transparent);
  border: none;
  border-radius: 14px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--color-primary, #00723a) 14%, transparent);
  }
}

/* === 群聊：加成員角色挑選 === */
.member-picker {
  position: relative;
  z-index: 1;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--color-text-secondary) 14%, transparent);
}

.member-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.member-picker-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.member-picker-close {
  font-size: 12px;
  color: var(--color-primary, #00723a);
  background: transparent;
  border: none;
  cursor: pointer;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 6px;
  border-radius: 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--color-primary, #00723a) 8%, transparent);
  }
}

.picker-avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--color-surface);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.picker-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary, #00723a) 14%, var(--color-surface));
  color: var(--color-primary, #00723a);
  font-size: 16px;
  font-weight: 600;
}

.picker-name {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 15px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-add {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: var(--color-primary, #00723a);
}

/* === 多人卡：加子角色內聯表單 === */
.subchar-form {
  position: relative;
  z-index: 1;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--color-text-secondary) 14%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subchar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.subchar-avatar {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 9999px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary, #00723a) 10%, var(--color-surface));
  color: var(--color-primary, #00723a);
  border: 1px dashed color-mix(in srgb, var(--color-primary, #00723a) 35%, transparent);
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 18px;
    height: 18px;
  }
}

.subchar-input {
  width: 100%;
  box-sizing: border-box;
  font-size: 14px;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-surface) 85%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text-secondary) 20%, transparent);
  border-radius: 12px;
  padding: 9px 12px;
  outline: none;

  &:focus {
    border-color: var(--color-primary, #00723a);
  }
}

.subchar-row .subchar-input {
  flex: 1;
}

.subchar-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.subchar-cancel,
.subchar-confirm {
  font-size: 13px;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
}

.subchar-cancel {
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-surface) 80%, transparent);
}

.subchar-confirm {
  color: var(--color-on-primary, #ffffff);
  background: var(--color-primary, #00723a);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* === 多人卡：加子角色來源選擇器 === */
.subchar-source-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.source-tab {
  flex: 1 1 auto;
  min-width: 64px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--color-text-secondary) 20%, transparent);
  background: color-mix(in srgb, var(--color-surface) 85%, transparent);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s, border-color 0.2s;

  &.active {
    color: var(--color-on-primary, #ffffff);
    background: var(--color-primary, #00723a);
    border-color: var(--color-primary, #00723a);
  }
}

.subchar-select {
  width: 100%;
  box-sizing: border-box;
  font-size: 14px;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-surface) 85%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text-secondary) 20%, transparent);
  border-radius: 12px;
  padding: 9px 12px;
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: var(--color-primary, #00723a);
  }
}

.subchar-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;

  input {
    width: 16px;
    height: 16px;
    accent-color: var(--color-primary, #00723a);
    cursor: pointer;
  }
}

.subchar-hint-mini {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.subchar-binding {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-text-secondary) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text-secondary) 12%, transparent);
}

.subchar-binding-head {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.subchar-bind-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.subchar-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;

  input {
    accent-color: var(--color-primary, #00723a);
    cursor: pointer;
  }
}

/* === 世界書綁定 === */
.empty-hint {
  position: relative;
  z-index: 1;
  font-size: 13px;
  color: var(--color-text-secondary);
  text-align: center;
  padding: 12px;
}

.lorebook-list {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lorebook-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-surface) 50%, transparent);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;

  &.active {
    border-color: color-mix(in srgb, var(--color-primary, #00723a) 40%, transparent);
    background: color-mix(in srgb, var(--color-primary, #00723a) 8%, transparent);
  }
}

.lorebook-check {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 2px solid color-mix(in srgb, var(--color-text-secondary) 40%, transparent);
  color: var(--color-on-primary, #ffffff);

  .lorebook-item.active & {
    background: var(--color-primary, #00723a);
    border-color: var(--color-primary, #00723a);
  }

  svg {
    width: 13px;
    height: 13px;
  }
}

.lorebook-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lorebook-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lorebook-count {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* === 快捷導航：3+2 錯位蜂窩（單人模式） === */
.quick-honeycomb {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px 2px 4px;
  margin-top: 18px;
  width: 100%;
}

.hex-row {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.hex-row--top {
  gap: 14px;
}

.hex-row--bottom {
  gap: 14px;
  margin-top: -10px;
  transform: translateX(0);
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: transform 0.32s cubic-bezier(0.34, 1.32, 0.64, 1);

  &:hover {
    transform: translateY(-3px);
  }

  &:active {
    transform: translateY(-1px) scale(0.96);
  }

  &:hover .quick-icon {
    background: var(--color-primary, #00723a);
    color: var(--color-on-primary, #ffffff);
    box-shadow:
      0 10px 22px color-mix(in srgb, var(--color-primary, #00723a) 28%, transparent),
      0 2px 6px rgba(0, 0, 0, 0.05);
  }
}

.quick-icon {
  position: relative;
  width: 56px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background: color-mix(in srgb, var(--color-surface) 95%, transparent);
  color: var(--color-primary, #00723a);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  transition:
    background-color 0.3s ease,
    color 0.3s ease,
    box-shadow 0.4s ease,
    transform 0.45s cubic-bezier(0.34, 1.32, 0.64, 1);

  svg {
    width: 24px;
    height: 24px;
  }
}

.quick-item--hero {
  position: relative;

  .quick-label {
    color: var(--color-primary, #00723a);
    font-weight: 600;
  }
}

.quick-icon--hero {
  width: 68px;
  height: 78px;
  background: color-mix(in srgb, var(--color-primary, #00723a) 14%, var(--color-surface));
  color: var(--color-primary, #00723a);

  &::before {
    content: "";
    position: absolute;
    inset: -2px;
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    background: color-mix(in srgb, var(--color-primary, #00723a) 32%, transparent);
    z-index: -1;
  }

  svg {
    width: 30px;
    height: 30px;
  }
}

.quick-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  letter-spacing: 0.3px;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .quick-item,
  .quick-icon,
  .quick-action {
    transition: none !important;
    animation: none !important;
  }
}

/* === 列表群組 === */
.list-group {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 10px;
  border-radius: 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--color-surface) 70%, transparent);
  }

  &:active {
    transform: scale(0.985);
  }

  &.danger {
    .list-icon {
      color: var(--color-error, #b3261e);
    }

    .list-label {
      color: var(--color-error, #b3261e);
    }
  }
}

.list-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--color-surface);
  color: var(--color-primary, #00723a);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

  svg {
    width: 20px;
    height: 20px;
  }
}

.list-label {
  flex: 1;
  text-align: left;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  letter-spacing: 0.1px;
}

.chevron {
  width: 18px;
  height: 18px;
  color: color-mix(in srgb, var(--color-text-secondary) 70%, transparent);
  flex-shrink: 0;
}
</style>
