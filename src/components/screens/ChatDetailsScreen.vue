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
  "open-favorite-audio": [];
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
    case "favorite-audio":
      emit("open-favorite-audio");
      break;
  }
}
</script>

<template>
  <div class="chat-details-screen">

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

        <!-- 快捷操作列：搜尋 / 加成員 / 收藏語音 / 清空 -->
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
          <button class="quick-action quick-action--favorite" @click="handleAction('favorite-audio')" title="開啟收藏語音">
            <span class="quick-action-icon quick-action-icon--favorite">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 13a8 8 0 0 1 16 0" />
                <path d="M4 13v3a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2Z" />
                <path d="M20 13v3a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 1Z" />
                <path d="m16.5 4.5.6 1.2 1.3.2-.95.9.22 1.3-1.17-.62-1.17.62.22-1.3-.95-.9 1.3-.2Z" />
              </svg>
            </span>
            <span class="quick-action-label">收藏語音</span>
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
        <section class="panel">
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
        <section v-if="!isMultiCharCard" class="panel">
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
        <section class="panel">
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
        <section class="panel">
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

        <!-- 快捷導航：名稱下方 3×2 格 -->
        <div class="quick-grid">
          <button class="quick-item" @click="handleAction('character')">
            <div class="quick-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
              </svg>
            </div>
            <span class="quick-label">角色卡</span>
          </button>
          <button class="quick-item" @click="handleAction('chat-vars')">
            <div class="quick-icon">
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
          <button class="quick-item" @click="handleAction('peek-phone')">
            <div class="quick-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </div>
            <span class="quick-label">頭盔TA</span>
          </button>
          <button class="quick-item quick-item--favorite" @click="handleAction('favorite-audio')" title="開啟收藏語音">
            <div class="quick-icon quick-icon--favorite">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 13a8 8 0 0 1 16 0" />
                <path d="M4 13v3a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2Z" />
                <path d="M20 13v3a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 1Z" />
                <path d="m16.5 4.5.6 1.2 1.3.2-.95.9.22 1.3-1.17-.62-1.17.62.22-1.3-.95-.9 1.3-.2Z" />
              </svg>
            </div>
            <span class="quick-label">收藏語音</span>
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
      </section>

      <!-- 內容流 -->
      <div class="content-flow">
        <!-- 聊天管理 -->
        <section class="panel">
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
        <section class="panel">
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
        <section class="panel">
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
/* ============================================================
 * 聊天詳情頁
 * 設計：卡片式分組列表，色彩全部取自主題變數，寬螢幕置中限寬
 * ============================================================ */
.chat-details-screen {
  --cd-accent: var(--color-primary, #00723a);
  --cd-danger: var(--color-error, #b3261e);
  --cd-card: var(--color-surface, #ffffff);
  --cd-line: var(--color-border, rgba(0, 0, 0, 0.08));
  --cd-hover: var(--color-surface-hover, color-mix(in srgb, var(--color-text, #000) 5%, var(--cd-card)));
  --cd-accent-soft: color-mix(in srgb, var(--cd-accent) 12%, var(--cd-card));
  --cd-danger-soft: color-mix(in srgb, var(--cd-danger) 10%, var(--cd-card));
  --cd-favorite: #c98a12;
  --cd-favorite-soft: color-mix(in srgb, #e3a72f 16%, var(--cd-card));
  --cd-radius: 20px;
  --cd-header-h: 52px;
  --cd-max-w: 560px;

  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--cd-accent) 7%, var(--color-background)) 0,
      var(--color-background) 360px);
  color: var(--color-text);
  font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}

/* === 標題列 === */
.float-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  box-sizing: content-box;
  height: var(--cd-header-h);
  padding: var(--safe-top, 0px) max(8px, calc((100% - var(--cd-max-w)) / 2)) 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: color-mix(in srgb, var(--color-background) 72%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.header-btn,
.header-btn-placeholder {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 12px;
  background: transparent;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color 0.2s, transform 0.15s;

  &:hover {
    background: var(--cd-hover);
  }

  &:active {
    transform: scale(0.92);
  }

  svg {
    width: 22px;
    height: 22px;
  }
}

.header-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: 0.2px;
}

/* === 主要內容區 === */
.details-main {
  position: relative;
  z-index: 10;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  padding:
    calc(var(--safe-top, 0px) + var(--cd-header-h) + 16px)
    16px
    calc(32px + var(--safe-bottom, 0px));

  > * {
    max-width: var(--cd-max-w);
    margin-left: auto;
    margin-right: auto;
  }
}

.hidden-file-input {
  display: none;
}

/* === 個人資料 === */
.profile-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28px;
}

.avatar-container {
  position: relative;
  width: 104px;
  height: 104px;
  margin-bottom: 14px;
}

.avatar-frame {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--cd-accent-soft);
  box-shadow:
    0 0 0 4px var(--cd-card),
    0 0 0 5px var(--cd-line),
    0 10px 28px color-mix(in srgb, var(--cd-accent) 16%, transparent);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    // 圖片載入失敗時隱藏 alt 文字
    color: transparent;
    font-size: 0;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cd-accent);

    svg {
      width: 44px;
      height: 44px;
    }
  }
}

/* 群聊：可點擊更換的頭像 */
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
  right: -2px;
  bottom: -2px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--cd-accent);
  color: var(--color-on-primary, #ffffff);
  border: 3px solid var(--color-background);

  svg {
    width: 14px;
    height: 14px;
  }
}

.avatar-remove-btn {
  margin: 0 0 12px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--cd-danger);
  background: var(--cd-danger-soft);
  border: none;
  border-radius: 9999px;
  cursor: pointer;
}

.profile-name {
  margin: 0;
  max-width: 100%;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--color-text);
  text-align: center;
  overflow-wrap: anywhere;
}

.profile-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  text-align: center;
}

/* === 群名稱：內聯編輯 === */
.name-edit-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
}

.name-edit-btn,
.name-edit-confirm {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 9999px;
  cursor: pointer;

  svg {
    width: 15px;
    height: 15px;
  }
}

.name-edit-btn {
  background: transparent;
  color: var(--color-text-secondary);
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: var(--cd-accent-soft);
    color: var(--cd-accent);
  }
}

.name-edit-confirm {
  background: var(--cd-accent);
  color: var(--color-on-primary, #ffffff);
}

.name-edit-input {
  max-width: 220px;
  padding: 4px 12px;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
  background: var(--cd-card);
  border: 1px solid var(--cd-line);
  border-radius: 12px;
  outline: none;

  &:focus {
    border-color: var(--cd-accent);
  }
}

/* === 快捷入口（單人 3×2 格 / 群聊 4 格）=== */
.quick-grid,
.quick-actions {
  display: grid;
  gap: 10px;
  width: 100%;
  margin-top: 24px;
}

.quick-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.quick-actions {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.quick-item,
.quick-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 14px 6px 12px;
  background: var(--cd-card);
  border: 1px solid var(--cd-line);
  border-radius: 18px;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.15s, box-shadow 0.2s;

  &:hover {
    background: var(--cd-hover);
  }

  &:active {
    transform: scale(0.96);
  }
}

.quick-icon,
.quick-action-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--cd-accent-soft);
  color: var(--cd-accent);

  svg {
    width: 21px;
    height: 21px;
  }
}

.quick-label,
.quick-action-label {
  max-width: 100%;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-item--favorite,
.quick-action--favorite {
  .quick-icon,
  .quick-action-icon {
    background: var(--cd-favorite-soft);
    color: var(--cd-favorite);
  }
}

.quick-action--danger {
  .quick-action-icon {
    background: var(--cd-danger-soft);
    color: var(--cd-danger);
  }

  .quick-action-label {
    color: var(--cd-danger);
  }
}

/* === 內容流與卡片 === */
.content-flow {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel {
  padding: 6px;
  background: var(--cd-card);
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-radius);
  box-sizing: border-box;
}

.panel-title {
  margin: 0;
  padding: 10px 10px 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.6px;
  color: var(--color-text-secondary);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 4px;
}

.panel-head-action {
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-accent);
  background: transparent;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: var(--cd-accent-soft);
  }
}

.empty-hint {
  padding: 14px 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  text-align: center;
}

/* === 列表項 === */
.list-group {
  display: flex;
  flex-direction: column;
}

.list-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
  background: transparent;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.15s;

  // 分隔線：從圖示右側開始
  & + &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 56px;
    right: 10px;
    height: 1px;
    background: var(--cd-line);
  }

  &:hover {
    background: var(--cd-hover);
  }

  &:hover::before,
  &:hover + &::before {
    opacity: 0;
  }

  &:active {
    transform: scale(0.99);
  }

  &.danger {
    .list-icon {
      background: var(--cd-danger-soft);
      color: var(--cd-danger);
    }

    .list-label {
      color: var(--cd-danger);
    }
  }
}

.list-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--cd-accent-soft);
  color: var(--cd-accent);

  svg {
    width: 18px;
    height: 18px;
  }
}

.list-label {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
  text-align: left;
}

.chevron {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--color-text-muted, var(--color-text-secondary));
}

/* === 群聊：成員列表 === */
.member-list {
  display: flex;
  flex-direction: column;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 14px;
  transition: background-color 0.2s;

  &:hover {
    background: var(--cd-hover);
  }
}

.member-row-avatar,
.picker-avatar {
  flex-shrink: 0;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--cd-accent-soft);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    color: transparent;
    font-size: 0;
  }
}

.member-row-avatar {
  width: 42px;
  height: 42px;
}

.picker-avatar {
  width: 38px;
  height: 38px;
}

.member-row-placeholder,
.picker-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cd-accent);
  font-size: 16px;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-row-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.badge {
  --badge-c: var(--color-text-secondary);
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  border-radius: 9999px;
  color: var(--badge-c);
  background: color-mix(in srgb, var(--badge-c) 13%, transparent);

  &--self,
  &--admin { --badge-c: var(--cd-accent); }
  &--muted { --badge-c: var(--cd-danger); }
  &--persona { --badge-c: #7c3aed; }
  &--bound { --badge-c: #d946a6; }
  &--affinity { --badge-c: #d97706; }
}

.member-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.member-op {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted, var(--color-text-secondary));
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: var(--cd-hover);
    color: var(--color-text);
  }

  &.active {
    background: var(--cd-accent-soft);
    color: var(--cd-accent);
  }

  &--danger:hover {
    background: var(--cd-danger-soft);
    color: var(--cd-danger);
  }

  svg {
    width: 16px;
    height: 16px;
  }
}

.member-show-all {
  display: block;
  width: calc(100% - 8px);
  margin: 6px 4px 4px;
  padding: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--cd-accent);
  background: var(--cd-accent-soft);
  border: none;
  border-radius: 12px;
  cursor: pointer;
}

/* === 群聊：加成員角色挑選 / 子角色表單 === */
.member-picker,
.subchar-form {
  margin: 8px 4px 4px;
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-text, #000) 3%, var(--cd-card));
  border: 1px solid var(--cd-line);
}

.member-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.member-picker-title,
.subchar-binding-head {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.member-picker-close {
  padding: 0;
  font-size: 12px;
  color: var(--cd-accent);
  background: transparent;
  border: none;
  cursor: pointer;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px;
  background: transparent;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: var(--cd-hover);
  }
}

.picker-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--color-text);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-add {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--cd-accent);
}

.subchar-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.subchar-row {
  display: flex;
  align-items: center;
  gap: 10px;

  .subchar-input {
    flex: 1;
  }
}

.subchar-avatar {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  border-radius: 9999px;
  background: var(--cd-accent-soft);
  color: var(--cd-accent);
  border: 1px dashed color-mix(in srgb, var(--cd-accent) 40%, transparent);
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

.subchar-input,
.subchar-select {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--cd-card);
  border: 1px solid var(--cd-line);
  border-radius: 10px;
  outline: none;

  &:focus {
    border-color: var(--cd-accent);
  }
}

.subchar-select {
  cursor: pointer;
}

.subchar-source-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 3px;
  border-radius: 12px;
  background: var(--cd-hover);
}

.source-tab {
  flex: 1 1 auto;
  min-width: 64px;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: 9px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;

  &.active {
    color: var(--color-text);
    background: var(--cd-card);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
}

.subchar-toggle,
.subchar-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;

  input {
    accent-color: var(--cd-accent);
    cursor: pointer;
  }
}

.subchar-toggle input {
  width: 16px;
  height: 16px;
}

.subchar-hint-mini {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.subchar-binding {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--cd-card);
  border: 1px solid var(--cd-line);
}

.subchar-bind-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.subchar-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.subchar-cancel,
.subchar-confirm {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
}

.subchar-cancel {
  color: var(--color-text-secondary);
  background: var(--cd-hover);
}

.subchar-confirm {
  color: var(--color-on-primary, #ffffff);
  background: var(--cd-accent);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* === 群聊：世界書綁定 === */
.lorebook-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lorebook-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: transparent;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: var(--cd-hover);
  }

  &.active {
    background: var(--cd-accent-soft);
  }
}

.lorebook-check {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 7px;
  border: 2px solid var(--cd-line);
  color: var(--color-on-primary, #ffffff);
  transition: background-color 0.2s, border-color 0.2s;

  .lorebook-item.active & {
    background: var(--cd-accent);
    border-color: var(--cd-accent);
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
  text-align: left;
}

.lorebook-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lorebook-count {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* === 窄螢幕 === */
@media (max-width: 360px) {
  .quick-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .quick-item,
  .quick-action,
  .list-item,
  .header-btn {
    transition: none !important;
  }
}
</style>
