<template>
  <div class="plurk-app">
    <div class="plurk-main">
      <RiverTab
        v-show="tab === 'river'"
        ref="riverRef"
        :cards="riverCards"
        :layout="riverLayout"
        :bubbles="riverBubbles"
        :filter="riverFilter"
        :filters="RIVER_FILTERS"
        :query="riverQuery"
        :typing="riverTyping"
        :director-active="directorActive"
        :highlight-post-id="highlightPostId"
        @back="emit('back')"
        @update:filter="riverFilter = $event"
        @update:query="riverQuery = $event"
        @open-director="directorOpen = true"
        @open-more="openRiverMore"
        @open-post="openThread"
        @open-profile="openProfileOfPost"
        @like="(id) => qzoneStore.toggleLike(id, 'user')"
        @repost="openRepost"
        @bookmark="(id) => qzoneStore.toggleBookmark(id)"
        @more="openPostMore"
        @open-image="openPostImage"
        @open-theater="openTheaterOfPost"
        @compose="openCompose"
      />
      <SquareTab
        v-show="tab === 'square'"
        ref="squareRef"
        :cards="squareCards"
        :tab="squareTab"
        :tabs="SQUARE_TABS"
        :qualifier="squareQualifier"
        :filters="SQUARE_FILTERS"
        :query="squareQuery"
        :busy="plurkActivity.square"
        @update:tab="squareTab = $event"
        @update:qualifier="squareQualifier = $event"
        @update:query="squareQuery = $event"
        @open="(id) => openThread(id, true)"
        @fill="fillSquare"
      />
      <NoticeTab
        v-if="tab === 'notice'"
        :rows="noticeRows"
        :filter="noticeFilter"
        :filters="NOTICE_FILTERS"
        @update:filter="noticeFilter = $event"
        @mark-all-read="qzoneStore.markAllSeen()"
        @open="openNotice"
      />
      <MeTab
        v-if="tab === 'me'"
        :persona="mePersona"
        :stats="meStats"
        :tab="meTab"
        :rows="meRows"
        :legacy-avatar="legacyAvatar"
        @switch-persona="personaFor = 'me'"
        @update:tab="meTab = $event"
        @open-post="openThread"
        @open-theater="emit('navigate-theater')"
        @edit-legacy-avatar="legacyOpen = true"
        @open-director="directorOpen = true"
      />
    </div>

    <button
      v-if="tab === 'river' || tab === 'square'"
      type="button"
      class="plurk-fab"
      aria-label="發噗"
      @click="openCompose"
    >
      <PenLine :size="20" aria-hidden="true" />
      <span>發噗</span>
    </button>

    <PlurkTabBar
      class="plurk-tabbar-dock"
      :tabs="TABS"
      :active="tab"
      :notice-count="noticeCount"
      :me-avatar="mePersona.avatar"
      :me-name="mePersona.name"
      @select="selectTab"
    />

    <div v-if="threadPostId && threadPostData" class="plurk-thread-layer">
      <ThreadView
        ref="threadRef"
        :post="threadPostData"
        :response-count="thread.responses.value.length"
        :participant-count="thread.participantCount.value"
        :rows="threadRows"
        :typing-names="threadTyping"
        :quick-actions="threadQuickActions"
        :busy="thread.busy.value"
        :replying-to-name="replyingToName"
        :input-avatar="threadInput.avatar"
        :input-name="threadInput.name"
        :qualifier="threadQualifier"
        :mention-candidates="mentionCandidates"
        :height="threadHeight"
        :square-mode="threadSquare"
        :character-count="threadCharacterCount"
        :op-follow="threadOpFollow"
        @back="closeThread"
        @toggle-follow="toggleNpcFriend"
        @toggle-mute="thread.toggleMute()"
        @open-profile="openProfileOfPost(threadPostId)"
        @open-image="(i) => openLightbox(threadPostData?.images ?? [], i)"
        @regenerate="(id, tone) => thread.regenerate(id, tone)"
        @reply="replyToResponse"
        @remove="(id) => thread.remove(id)"
        @cancel-reply="thread.replyingTo.value = null"
        @quick-action="runThreadQuickAction"
        @open-persona="personaFor = 'thread'"
        @open-qualifier="qualifierOpen = true"
        @open-sticker="stickerTarget = 'thread'"
        @send="sendThreadResponse"
      />
    </div>

    <ComposeSheet
      ref="composeRef"
      :open="composeOpen"
      :state="compose.state"
      :can-post="compose.canPost.value"
      :personas="personaOptions"
      :current-persona-id="userStore.currentPersonaId"
      :viewer-candidates="viewerCandidates"
      :responder-candidates="responderCandidates"
      :mention-candidates="mentionCandidates"
      :posting="posting"
      :anon-left="anonLeft"
      @close="composeOpen = false"
      @submit="submitCompose"
      @switch-persona="switchComposePersona"
      @add-files="(files) => compose.addFiles(files)"
      @remove-media="(i) => compose.removeMedia(i)"
      @open-sticker="stickerTarget = 'compose'"
      @edit-private-to="pickerMode = 'privateTo'"
      @edit-responders="pickerMode = 'responders'"
    />

    <DirectorSheet
      :open="directorOpen"
      :config="qzoneStore.directorConfig"
      :roster="roster"
      :busy="directorBusy"
      :calls-per-hour-text="callsPerHourText"
      @close="directorOpen = false"
      @update="(patch) => qzoneStore.updateDirector(patch)"
      @post-now="postNowRandom"
      @post-now-pick="pickerMode = 'postAs'"
      @reply-now="replyNow"
      @fill-square="fillSquare"
    />

    <PlurkActionSheet
      :open="!!actionContext"
      :title="actionContext?.kind === 'post' ? '這則噗' : '更多'"
      :actions="actionList"
      @close="actionContext = null"
      @select="runAction"
    />

    <QualifierPickerSheet
      :open="qualifierOpen"
      :model-value="threadQualifier"
      @close="qualifierOpen = false"
      @update:model-value="threadQualifier = $event"
    />

    <CharacterPickerSheet
      :open="!!pickerMode"
      :title="pickerConfig.title"
      :characters="pickerConfig.characters"
      :model-value="pickerConfig.value"
      :multiple="pickerConfig.multiple"
      :confirm-text="pickerConfig.confirmText"
      @close="pickerMode = null"
      @confirm="confirmPicker"
    />

    <PersonaSheet
      :open="!!personaFor"
      :personas="personaOptions"
      :current-id="personaFor === 'thread' ? threadPersonaId ?? userStore.currentPersonaId : userStore.currentPersonaId"
      :show-anonymous="personaFor === 'thread'"
      :anonymous="threadAnonymous"
      @close="personaFor = null"
      @select="selectPersona"
      @update:anonymous="threadAnonymous = $event"
    />

    <RepostSheet
      :open="!!repostTarget"
      :preview="repostPreview"
      @close="repostTarget = null"
      @confirm="confirmRepost"
    />

    <ImageLightbox
      :open="lightbox.open"
      :images="lightbox.images"
      :start-index="lightbox.index"
      @close="lightbox.open = false"
    />

    <LegacyAvatarSheet
      :open="legacyOpen"
      :avatar="legacyAvatar"
      @close="legacyOpen = false"
      @save="(url) => qzoneStore.updateSettings({ avatar: url })"
    />

    <Teleport to="body">
      <Transition name="plurk-dim-fade">
        <div v-if="stickerTarget" class="plurk-sticker-dim" @click="stickerTarget = null"></div>
      </Transition>
      <Transition name="plurk-sheet-slide">
        <section v-if="stickerTarget" class="plurk-sticker-sheet" role="dialog" aria-modal="true" aria-label="選擇貼圖">
          <div class="plurk-sticker-head">
            <span class="plurk-sticker-title">選擇貼圖</span>
            <button type="button" class="plurk-sticker-close" aria-label="關閉" @click="stickerTarget = null">
              <X :size="18" aria-hidden="true" />
            </button>
          </div>
          <StickerPanel @select="insertSticker" @close="stickerTarget = null" />
        </section>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * 噗浪外殼：河道／通知／我三個分頁，加上回應串、發噗、AI 導演與各種小面板
 * 元件只吃整理好的資料；這裡負責接 store、生成服務與返回順序
 */

import StickerPanel from "@/components/common/StickerPanel.vue";
import ComposeSheet from "@/components/plurk/ComposeSheet.vue";
import DirectorSheet from "@/components/plurk/DirectorSheet.vue";
import MeTab from "@/components/plurk/MeTab.vue";
import NoticeTab from "@/components/plurk/NoticeTab.vue";
import PlurkTabBar from "@/components/plurk/PlurkTabBar.vue";
import RiverTab from "@/components/plurk/RiverTab.vue";
import SquareTab from "@/components/plurk/SquareTab.vue";
import ThreadView from "@/components/plurk/ThreadView.vue";
import CharacterPickerSheet from "@/components/plurk/sheets/CharacterPickerSheet.vue";
import ImageLightbox from "@/components/plurk/sheets/ImageLightbox.vue";
import LegacyAvatarSheet from "@/components/plurk/sheets/LegacyAvatarSheet.vue";
import PersonaSheet from "@/components/plurk/sheets/PersonaSheet.vue";
import PlurkActionSheet from "@/components/plurk/sheets/PlurkActionSheet.vue";
import QualifierPickerSheet from "@/components/plurk/sheets/QualifierPickerSheet.vue";
import RepostSheet from "@/components/plurk/sheets/RepostSheet.vue";
import type {
  DirectorRosterItem,
  MeListRow,
  MentionCandidate,
  NoticeRow,
  PersonaOption,
  PickerCharacter,
  PlurkAction,
  PlurkCardData,
  PlurkTabId,
  RiverBubbleData,
  SquareCardData,
  ThreadPostData,
  ThreadQuickAction,
  ThreadResponseRow,
} from "@/components/plurk/types";
import { useBatchComments } from "@/composables/useBatchComments";
import { refreshPlurkClock, usePlurkClock } from "@/composables/usePlurkClock";
import { usePlurkCompose } from "@/composables/usePlurkCompose";
import { usePlurkThread } from "@/composables/usePlurkThread";
import { publishCharacterPlurk } from "@/services/PlurkPostService";
import { buildCastContext, effectiveFriendIds, getViewerIds, type CastContext } from "@/services/plurkCast";
import { buildPeekSummary, generateCharacterPlurk } from "@/services/plurkGeneration";
import { getTypingNames, plurkActivity } from "@/services/plurkReveal";
import { generateSquareBatch } from "@/services/plurkSquareGeneration";
import { useUserStore } from "@/stores";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { useCharactersStore } from "@/stores/characters";
import { usePromptManagerStore } from "@/stores/promptManager";
import { useQzoneStore } from "@/stores/qzone";
import { useSettingsStore } from "@/stores/settings";
import { useStickerStore } from "@/stores/sticker";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import { renderPlurkContent, plurkPlainText } from "@/utils/plurkContent";
import { getRole, LIVELINESS_RATES } from "@/utils/plurkDirectorConfig";
import { audienceLabel, getAudience, getLikeTotal, getTheaterPostId } from "@/utils/plurkPost";
import {
  buildNoticeList,
  countUnreadPosts,
  filterRiverPosts,
  isPostFollowed,
  layoutRiverTimeline,
  unreadComments,
  visibleComments,
  type RiverFilter,
} from "@/utils/plurkRiver";
import {
  anonHandle,
  anonKey,
  anonQuotaLeft,
  hasFreshReplies,
  isRiverPost,
  isSquarePost,
  SQUARE_FILTERS,
  SQUARE_TABS,
  squareFeed,
  type SquareTab as SquareTabId,
} from "@/utils/plurkSquare";
import { PenLine, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";

const emit = defineEmits<{
  (e: "back"): void;
  (e: "navigate-theater", theaterPostId?: string): void;
}>();

const TABS: Array<{ id: PlurkTabId; label: string }> = [
  { id: "river", label: "河道" },
  { id: "square", label: "廣場" },
  { id: "notice", label: "通知" },
  { id: "me", label: "我" },
];
const RIVER_FILTERS: Array<{ id: RiverFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "friends", label: "好友" },
  { id: "private", label: "私噗" },
  { id: "mine", label: "我的" },
];
const NOTICE_FILTERS: Array<{ id: "all" | "reply"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "reply", label: "回應" },
];
const ANONYMOUS_AVATAR = "https://api.dicebear.com/7.x/shapes/svg?seed=anonymous&backgroundColor=666666";

const qzoneStore = useQzoneStore();
const charactersStore = useCharactersStore();
const settingsStore = useSettingsStore();
const stickerStore = useStickerStore();
const promptManagerStore = usePromptManagerStore();
const userStore = useUserStore();
const aiGenerationStore = useAIGenerationStore();
const { generateCommentsForPost, regenerateAllComments } = useBatchComments();

const now = usePlurkClock();
const tab = ref<PlurkTabId>("river");

// 有新回應（自己送的、AI 剛生成的）就把時鐘撥到現在
watch(
  () => qzoneStore.posts.reduce((sum, p) => sum + (p.comments?.length ?? 0), 0),
  () => refreshPlurkClock(),
);

// ============================================================
// 角色關係（好友、隱藏）
// ============================================================

const castCtx = ref<CastContext | null>(null);

async function refreshCast() {
  castCtx.value = await buildCastContext();
}

/** 封鎖／隱藏的角色：不在可見名單裡的 */
const hiddenIds = computed(() => {
  const visible = new Set(castCtx.value?.allCharacterIds ?? charactersStore.characters.map((c) => c.id));
  return new Set(charactersStore.characters.map((c) => c.id).filter((id) => !visible.has(id)));
});

function toPicker(id: string, note?: string): PickerCharacter | null {
  const c = charactersStore.getCharacterById(id);
  if (!c) return null;
  return { id, name: c.nickname || c.data?.name || "角色", avatar: c.avatar || undefined, note };
}

function pickerList(ids: string[]): PickerCharacter[] {
  return ids.map((id) => toPicker(id)).filter((c): c is PickerCharacter => !!c);
}

const visibleCharacterIds = computed(() => castCtx.value?.allCharacterIds ?? []);
const mentionCandidates = computed<MentionCandidate[]>(() => pickerList(visibleCharacterIds.value));
const roster = computed<DirectorRosterItem[]>(() =>
  castCtx.value ? pickerList(effectiveFriendIds(castCtx.value)) : [],
);

// ============================================================
// 名字、頭像、內文
// ============================================================

const legacyAvatar = computed(
  () => qzoneStore.settings.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=user",
);

function defaultAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/lorelei/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
}

function authorName(authorId: string, fallback?: string): string {
  if (authorId === "user") return qzoneStore.settings.nickname || "我";
  const c = charactersStore.getCharacterById(authorId);
  if (c) return c.nickname || c.data?.name || fallback || "未知角色";
  return fallback || "未知用戶";
}

function authorAvatar(authorId: string, fallback?: string): string {
  if (authorId === "user") return legacyAvatar.value;
  const c = charactersStore.getCharacterById(authorId);
  if (c) return c.avatar || fallback || defaultAvatar(authorId);
  return fallback || "https://api.dicebear.com/7.x/lorelei/svg?seed=default&backgroundColor=ffdfbf";
}

function nameOf(id: string): string {
  const c = charactersStore.getCharacterById(id);
  if (c) return c.nickname || c.data?.name || "角色";
  return userStore.personas.find((p) => p.id === id)?.name || "某人";
}

function formatTime(timestamp: number): string {
  const diff = now.value - timestamp;
  if (diff < 60000) return "剛剛";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function resolveSticker(name: string): string | null {
  for (const category of stickerStore.allCategories) {
    const sticker = category.stickers.find((s) => s.name === name && s.url);
    if (sticker) return sticker.url;
  }
  return null;
}

function render(raw: string | undefined, timestamp: number): string {
  return renderPlurkContent(raw || "", { resolveSticker, date: new Date(timestamp) });
}

function postImages(post: QZonePost): string[] {
  if (post.images?.length) return post.images;
  return (post.media ?? []).filter((m) => m.type === "image").map((m) => m.url);
}

function theaterTitle(post: QZonePost): string {
  const firstLine = (post.content || "").split("\n")[0].replace(/^\[小劇場\]\s*/, "").trim();
  return plurkPlainText(firstLine, 40) || "小劇場";
}

/** 小劇場噗的標題已經在連結卡上，內文只留第二行之後 */
function theaterBody(post: QZonePost): string {
  return (post.content || "").split("\n").slice(1).join("\n");
}

const ANON_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='#6E6E74'/>" +
      "<text x='40' y='54' font-size='38' font-family='sans-serif' font-weight='700' fill='#ffffff' text-anchor='middle'>?</text></svg>",
  );

function isAnonPost(post: QZonePost): boolean {
  return getAudience(post) === "anon";
}

/** 噗主怎麼顯示：偷偷說只給代號、路人用自己的顏色 */
function postAuthor(post: QZonePost): { name: string; avatar?: string; color?: string } {
  if (isAnonPost(post)) {
    return { name: `偷偷說 ${anonHandle(post.id, anonKey(post.authorType, post.authorId))}`, avatar: ANON_AVATAR };
  }
  if (post.npc) return { name: post.npc.name, color: post.npc.color };
  return { name: authorName(post.authorId, post.username), avatar: authorAvatar(post.authorId, post.avatar) };
}

/** 回應者怎麼顯示：偷偷說的噗裡每個人都只有代號 */
function commentAuthor(post: QZonePost, c: QZoneComment): { name: string; avatar?: string; isMe: boolean } {
  if (isAnonPost(post)) {
    return { name: anonHandle(post.id, anonKey(c.authorType, c.authorId)), avatar: ANON_AVATAR, isMe: c.authorType === "user" };
  }
  return { name: authorName(c.authorId, c.username), avatar: authorAvatar(c.authorId, c.avatar), isMe: false };
}

function isCharacterAuthor(c: QZoneComment): boolean {
  return c.authorType === "ai" && !!charactersStore.getCharacterById(c.authorId);
}

function isRemoved(c: QZoneComment): boolean {
  return c.moderation?.action === "delete";
}

function findPost(id: string): QZonePost | undefined {
  return qzoneStore.posts.find((p) => p.id === id);
}

// ============================================================
// 河道
// ============================================================

const riverFilter = ref<RiverFilter>("all");
const riverQuery = ref("");
const riverRef = ref<InstanceType<typeof RiverTab> | null>(null);
const highlightPostId = ref<string | null>(null);
let highlightTimer: number | null = null;

const basePosts = computed(() =>
  qzoneStore.sortedPosts.filter(
    (post) => !hiddenIds.value.has(post.authorId) && !(post.anonOf && hiddenIds.value.has(post.anonOf)),
  ),
);
const npcFriendIds = computed(() => new Set((qzoneStore.settings.npcFriends ?? []).map((n) => n.id)));
/** 河道：路人噗加了好友才有、角色的偷偷說不進來 */
const riverBase = computed(() => basePosts.value.filter((post) => isRiverPost(post, npcFriendIds.value)));
const followedPosts = computed(() => basePosts.value.filter((p) => !p.muted && isPostFollowed(p)));

function toCard(post: QZonePost): PlurkCardData {
  const visible = visibleComments(post, now.value);
  const op = post.originalPost;
  const theaterId = getTheaterPostId(post);
  const author = postAuthor(post);
  return {
    id: post.id,
    authorName: author.name,
    authorAvatar: author.avatar,
    metaText: `${formatTime(post.timestamp)} · ${audienceLabel(post, nameOf)}`,
    qualifier: post.qualifier,
    html: render(theaterId ? theaterBody(post) : post.content, post.timestamp),
    images: postImages(post),
    videos: (post.media ?? []).filter((m) => m.type === "video").map((m) => m.url),
    repost: op
      ? {
          authorName: authorName(op.authorId, op.username),
          authorAvatar: authorAvatar(op.authorId, op.avatar),
          qualifier: op.qualifier,
          text: plurkPlainText(op.content || "", 80),
          images: postImages(op),
        }
      : undefined,
    theater: theaterId ? { title: theaterTitle(post) } : undefined,
    latestResponses: visible
      .filter((c) => !isRemoved(c))
      .slice(-2)
      .map((c) => ({
        id: c.id,
        username: commentAuthor(post, c).name,
        html: render(c.content, c.timestamp),
      })),
    responseCount: visible.length,
    hasUnread: unreadComments(post, now.value, qzoneStore.settings.unreadSince).length > 0,
    likeCount: getLikeTotal(post),
    liked: !!post.liked,
    repostCount: post.repostCount ?? 0,
    bookmarked: !!post.bookmarked,
    muted: !!post.muted,
  };
}

const riverPosts = computed(() => filterRiverPosts(riverBase.value, riverFilter.value, riverQuery.value));
const riverCards = computed(() => riverPosts.value.map(toCard));
const timelinePosts = computed(() => filterRiverPosts(riverBase.value, riverFilter.value));
const riverLayout = computed(() => layoutRiverTimeline(timelinePosts.value, new Date(now.value)));
const riverBubbles = computed<Record<string, RiverBubbleData>>(() => {
  const result: Record<string, RiverBubbleData> = {};
  for (const bubble of riverLayout.value.bubbles) {
    const post = findPost(bubble.postId);
    if (!post) continue;
    const author = postAuthor(post);
    result[post.id] = {
      postId: post.id,
      authorName: author.name,
      authorAvatar: author.avatar,
      qualifier: post.qualifier,
      text: plurkPlainText(post.content || "", 25),
      unread: unreadComments(post, now.value, qzoneStore.settings.unreadSince).length > 0,
    };
  }
  return result;
});

const typingMap = computed(() => getTypingNames(basePosts.value, now.value, plurkActivity.generating));
const riverTyping = computed(() =>
  followedPosts.value.flatMap((post) => {
    const names = typingMap.value[post.id] ?? [];
    // 偷偷說不能洩漏是誰
    if (isAnonPost(post)) return names.length ? [{ postId: post.id, name: "有人", avatar: ANON_AVATAR }] : [];
    return names.map((name) => {
      const c = charactersStore.characters.find((ch) => (ch.nickname || ch.data?.name) === name);
      return { postId: post.id, name, avatar: c?.avatar || undefined };
    });
  }),
);

const noticeCount = computed(() =>
  countUnreadPosts(followedPosts.value, now.value, qzoneStore.settings.unreadSince),
);
const directorActive = computed(() => qzoneStore.directorConfig.mode !== "off");

function selectTab(id: PlurkTabId) {
  if (id === tab.value && id === "river") riverRef.value?.scrollToTop();
  if (id === tab.value && id === "square") squareRef.value?.scrollToTop();
  tab.value = id;
}

// ============================================================
// 廣場
// ============================================================

const squareTab = ref<SquareTabId>("hot");
const squareQualifier = ref("");
const squareQuery = ref("");
const squareRef = ref<InstanceType<typeof SquareTab> | null>(null);

function toSquareCard(post: QZonePost): SquareCardData {
  const author = postAuthor(post);
  const visible = visibleComments(post, now.value).filter((c) => !isRemoved(c));
  const latestChar = [...visible].reverse().find(isCharacterAuthor);
  const followed = isPostFollowed(post);
  return {
    id: post.id,
    authorName: author.name,
    authorAvatar: author.avatar,
    avatarColor: author.color,
    isCharacter: !isAnonPost(post) && post.authorType === "ai" && !!charactersStore.getCharacterById(post.authorId),
    metaText: `${formatTime(post.timestamp)} · ${isAnonPost(post) ? "偷偷說" : post.npc ? "全員 · 路人" : "全員"}`,
    qualifier: post.qualifier,
    text: plurkPlainText(post.content || "", 200),
    replyCount: visible.length,
    fresh: followed
      ? unreadComments(post, now.value, qzoneStore.settings.unreadSince).length > 0
      : hasFreshReplies(post, now.value),
    latestReply: latestChar
      ? { name: commentAuthor(post, latestChar).name, text: plurkPlainText(latestChar.content, 60) }
      : undefined,
    peekHint: !!post.anonOf && !!castCtx.value && effectiveFriendIds(castCtx.value).includes(post.anonOf),
    foldedReason: post.moderation?.action === "fold" ? post.moderation.reason : undefined,
  };
}

const squareCards = computed(() =>
  squareFeed(basePosts.value, {
    tab: squareTab.value,
    qualifier: squareQualifier.value,
    query: squareQuery.value,
    now: now.value,
  }).map(toSquareCard),
);

async function fillSquare() {
  if (!hasPostApi()) return alert("請先配置 API");
  const result = await generateSquareBatch();
  if (!result.success) alert(result.error || "生成失敗");
}

function flashPost(id: string) {
  highlightPostId.value = id;
  if (highlightTimer !== null) window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    highlightPostId.value = null;
    highlightTimer = null;
  }, 1600);
}

function openProfileOfPost(id: string) {
  // 角色個人頁是第 4 期；自己的噗先帶去「我」
  const post = findPost(id);
  if (post?.authorType === "user") {
    closeThread();
    tab.value = "me";
  } else {
    openThread(id);
  }
}

function openTheaterOfPost(id: string) {
  const post = findPost(id);
  emit("navigate-theater", post ? getTheaterPostId(post) : undefined);
}

function openPostImage(id: string, index: number) {
  const post = findPost(id);
  if (post) openLightbox(postImages(post), index);
}

// ============================================================
// 動作選單
// ============================================================

type ActionContext = { kind: "post"; postId: string } | { kind: "river" };
const actionContext = ref<ActionContext | null>(null);

const actionList = computed<PlurkAction[]>(() => {
  const ctx = actionContext.value;
  if (!ctx) return [];
  if (ctx.kind === "river") {
    return [
      { id: "theater", label: "小劇場" },
      { id: "readAll", label: "全部標為已讀" },
    ];
  }
  const post = findPost(ctx.postId);
  return [
    { id: "callReply", label: "叫角色回應", disabled: aiGenerationStore.isTaskGenerating("qzone", "qzone-comments") },
    { id: "regenerate", label: "重新生成 AI 回應" },
    { id: "mute", label: post?.muted ? "取消消音" : "消音" },
    { id: "delete", label: "刪除", danger: true },
  ];
});

function openRiverMore() {
  actionContext.value = { kind: "river" };
}

function openPostMore(id: string) {
  actionContext.value = { kind: "post", postId: id };
}

function hasApi(): boolean {
  const api = settingsStore.getAPIForTask("plurkComment").api;
  return !!(api.endpoint && api.apiKey && api.model);
}

async function runAction(id: string) {
  const ctx = actionContext.value;
  actionContext.value = null;
  if (!ctx) return;
  if (ctx.kind === "river") {
    if (id === "theater") emit("navigate-theater");
    if (id === "readAll") await qzoneStore.markAllSeen();
    return;
  }
  const post = findPost(ctx.postId);
  if (!post) return;
  if (id === "callReply") {
    if (!hasApi()) return alert("請先配置 API");
    const result = await generateCommentsForPost(post.id, undefined, {
      includeExistingComments: true,
      ignorePolicy: true,
    });
    if (!result.success) alert(result.error || "生成失敗");
  } else if (id === "regenerate") {
    if (!hasApi()) return alert("請先配置 API");
    if (!confirm("要重新生成這則噗的 AI 回應嗎？你自己的回應會留著。")) return;
    const result = await regenerateAllComments(post.id);
    if (!result.success) alert(result.error || "生成失敗");
  } else if (id === "mute") {
    await qzoneStore.setPostMuted(post.id, !post.muted);
  } else if (id === "delete") {
    if (!confirm("確定要刪除這則噗嗎？")) return;
    if (threadPostId.value === post.id) closeThread();
    await qzoneStore.deletePost(post.id);
  }
}

// ============================================================
// 轉噗
// ============================================================

const repostTarget = ref<QZonePost | null>(null);
const repostPreview = computed(() => {
  const post = repostTarget.value;
  if (!post) return null;
  const author = postAuthor(post);
  return {
    authorName: author.name,
    authorAvatar: author.avatar,
    qualifier: post.qualifier,
    text: plurkPlainText(post.content || "", 120),
  };
});

function openRepost(id: string) {
  repostTarget.value = findPost(id) ?? null;
}

async function confirmRepost(comment: string) {
  const original = repostTarget.value;
  repostTarget.value = null;
  if (!original) return;
  const persona = userStore.currentPersona;
  await qzoneStore.addPost({
    authorId: persona?.id || "user",
    username: persona?.name || qzoneStore.settings.nickname || "我",
    avatar: persona?.avatar || qzoneStore.settings.avatar || "",
    authorPersonaId: persona?.id,
    type: "repost",
    content: comment.trim() || undefined,
    qualifier: "轉噗",
    visibility: "public",
    authorType: "user",
    originalPost: {
      id: original.id,
      authorId: original.authorId,
      username: original.username,
      avatar: original.avatar,
      type: original.type,
      content: original.content,
      images: original.images,
      timestamp: original.timestamp,
      comments: [],
      likes: [],
      visibility: original.visibility,
      qualifier: original.qualifier,
    },
  });
  await qzoneStore.updatePost(original.id, {
    reposted: true,
    repostCount: (original.repostCount || 0) + 1,
  });
  tab.value = "river";
  riverRef.value?.scrollToTop();
}

// ============================================================
// 看圖
// ============================================================

const lightbox = reactive({ open: false, images: [] as string[], index: 0 });

function openLightbox(images: string[], index: number) {
  if (images.length === 0) return;
  lightbox.images = images;
  lightbox.index = index;
  lightbox.open = true;
}

// ============================================================
// 回應串
// ============================================================

const threadPostId = ref<string | null>(null);
const thread = usePlurkThread(threadPostId, now);
const threadRef = ref<InstanceType<typeof ThreadView> | null>(null);
const threadPersonaId = ref<string | null>(null);
const threadAnonymous = ref(false);
const threadQualifier = ref("");
const threadHeight = ref<string | undefined>(undefined);
/** 從廣場點進來的：回應串用廣場模式 */
const threadFromSquare = ref(false);

function openThread(id: string, fromSquare = false) {
  const post = findPost(id);
  if (!post) return;
  const theaterId = getTheaterPostId(post);
  if (theaterId) {
    emit("navigate-theater", theaterId);
    return;
  }
  threadPostId.value = id;
  threadFromSquare.value = fromSquare;
  threadPersonaId.value = null;
  threadAnonymous.value = false;
  threadQualifier.value = "";
  void qzoneStore.markPostSeen(id);
}

function closeThread() {
  const id = threadPostId.value;
  threadPostId.value = null;
  if (id && tab.value === "river") {
    flashPost(id);
    void nextTick(() => riverRef.value?.scrollToPost(id));
  }
}

const threadPostData = computed<ThreadPostData | null>(() => {
  const post = thread.post.value;
  if (!post) return null;
  const author = postAuthor(post);
  const fold = post.moderation?.action === "fold" ? post.moderation : null;
  return {
    authorName: author.name,
    authorAvatar: author.avatar,
    authorColor: author.color,
    notice: fold ? `這則噗已被廣場管理員 ${fold.by} 摺疊（${fold.reason}）` : undefined,
    metaText: `${formatTime(post.timestamp)} · ${audienceLabel(post, nameOf)}`,
    qualifier: post.qualifier,
    html: render(post.content, post.timestamp),
    images: postImages(post),
    likeCount: getLikeTotal(post),
    repostCount: post.repostCount ?? 0,
    muted: !!post.muted,
  };
});

const threadRows = computed<ThreadResponseRow[]>(() => {
  const post = thread.post.value;
  if (!post) return [];
  const anon = isAnonPost(post);
  return thread.responses.value.map((c) => {
    const author = commentAuthor(post, c);
    const target = c.replyToId ? post.comments.find((x) => x.id === c.replyToId) : undefined;
    return {
      id: c.id,
      authorName: author.name,
      authorAvatar: author.avatar,
      isMe: author.isMe,
      isOp: anon ? anonKey(c.authorType, c.authorId) === anonKey(post.authorType, post.authorId) : c.authorId === post.authorId,
      isCharacter: !anon && isCharacterAuthor(c),
      timeText: formatTime(c.timestamp),
      qualifier: c.qualifier,
      replyToName: target ? commentAuthor(post, target).name : c.replyToUsername,
      html: render(c.content, c.timestamp),
      canRegenerate: thread.isCharacterComment(c),
      regenerating: !!plurkActivity.regenerating[c.id],
      removedText: isRemoved(c)
        ? `這則回應因「${c.moderation!.reason}」已被廣場管理員 ${c.moderation!.by} 刪除`
        : undefined,
    };
  });
});

const threadSquare = computed(() => {
  const post = thread.post.value;
  // 偷偷說不分角色、不顯示幾位角色參與，用一般回應串
  return !!post && isSquarePost(post) && !isAnonPost(post) && (threadFromSquare.value || !!post.npc);
});
const threadCharacterCount = computed(
  () => new Set(thread.responses.value.filter(isCharacterAuthor).map((c) => c.authorId)).size,
);
const threadOpFollow = computed(() => {
  const npc = thread.post.value?.npc;
  return npc ? npcFriendIds.value.has(npc.id) : null;
});
/** 偷偷說裡不顯示誰在輸入、接話快捷只留「找新角色」，免得洩漏身分 */
const threadTyping = computed(() => {
  const post = thread.post.value;
  const names = post ? (typingMap.value[post.id] ?? []) : [];
  return post && isAnonPost(post) ? names.slice(0, 1).map(() => "有人") : names;
});
const threadQuickActions = computed(() => {
  const post = thread.post.value;
  const actions = thread.quickActions.value;
  return post && isAnonPost(post) ? actions.filter((a) => a.id === "newcomer") : actions;
});
const replyingToName = computed(() => {
  const post = thread.post.value;
  const target = thread.replyingTo.value;
  return post && target ? commentAuthor(post, target).name : null;
});

async function toggleNpcFriend() {
  const npc = thread.post.value?.npc;
  if (!npc) return;
  const list = qzoneStore.settings.npcFriends ?? [];
  const next = npcFriendIds.value.has(npc.id) ? list.filter((n) => n.id !== npc.id) : [...list, { ...npc }];
  await qzoneStore.updateSettings({ npcFriends: next });
}

const threadInput = computed(() => {
  if (threadAnonymous.value) return { name: "匿名噗友", avatar: ANONYMOUS_AVATAR };
  const persona =
    (threadPersonaId.value && userStore.personas.find((p) => p.id === threadPersonaId.value)) ||
    userStore.currentPersona;
  return {
    name: persona?.name || qzoneStore.settings.nickname || "我",
    avatar: persona?.avatar || legacyAvatar.value,
  };
});

// 噗被刪掉就關回應串；看著的時候進來的回應直接算已讀
watch(
  () => [threadPostId.value, thread.post.value, thread.responses.value.length] as const,
  ([id, post], old) => {
    if (id && !post) {
      threadPostId.value = null;
      return;
    }
    if (id && old && old[0] === id && old[2] !== thread.responses.value.length) {
      void qzoneStore.markPostSeen(id);
    }
  },
);

function replyToResponse(id: string) {
  thread.replyingTo.value = thread.responses.value.find((c) => c.id === id) ?? null;
  threadRef.value?.focusInput();
}

async function sendThreadResponse(content: string) {
  await thread.send({
    content,
    qualifier: threadQualifier.value,
    personaId: threadPersonaId.value,
    anonymous: threadAnonymous.value,
  });
}

async function runThreadQuickAction(action: ThreadQuickAction) {
  if (!hasApi()) return alert("請先配置 API");
  await thread.runQuickAction(action);
}

function handleViewportResize() {
  const vv = window.visualViewport;
  if (!vv) return;
  threadHeight.value =
    vv.height < window.innerHeight - 1
      ? `calc(${vv.height}px - var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))`
      : undefined;
}

// ============================================================
// 發噗
// ============================================================

const compose = usePlurkCompose();
const composeOpen = ref(false);
const composeRef = ref<InstanceType<typeof ComposeSheet> | null>(null);
const posting = ref(false);

const personaOptions = computed<PersonaOption[]>(() =>
  userStore.personas.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar || undefined,
    groupName: p.groupName || undefined,
  })),
);

const viewerCandidates = computed(() => pickerList(visibleCharacterIds.value));
const anonLeft = computed(() => anonQuotaLeft(qzoneStore.settings, now.value));
const responderCandidates = computed(() => {
  if (!castCtx.value) return [];
  const draft = { audience: compose.state.audience, privateTo: compose.state.privateTo } as QZonePost;
  return pickerList(getViewerIds(draft, castCtx.value));
});

function openCompose() {
  compose.reset();
  composeOpen.value = true;
}

async function switchComposePersona(id: string) {
  userStore.switchPersona(id);
  await userStore.saveUserData();
  compose.state.privateTo = [...(userStore.currentPersona?.boundCharacterIds ?? [])];
}

async function submitCompose() {
  if (posting.value) return;
  posting.value = true;
  try {
    const post = await compose.submit();
    if (!post) return;
    composeOpen.value = false;
    if (isAnonPost(post)) {
      tab.value = "square";
      squareTab.value = "anon";
      squareRef.value?.scrollToTop();
    } else {
      tab.value = "river";
      riverRef.value?.scrollToTop();
    }
  } finally {
    posting.value = false;
  }
}

// ============================================================
// 選角色、換身分、貼圖
// ============================================================

type PickerMode = "privateTo" | "responders" | "postAs";
const pickerMode = ref<PickerMode | null>(null);

const pickerConfig = computed(() => {
  switch (pickerMode.value) {
    case "privateTo":
      return {
        title: "私噗給誰看",
        characters: viewerCandidates.value,
        value: compose.state.privateTo,
        multiple: true,
        confirmText: "完成",
      };
    case "responders":
      return {
        title: "誰會來回應",
        characters: responderCandidates.value,
        value: compose.state.replyPickIds,
        multiple: true,
        confirmText: "完成",
      };
    case "postAs":
      return {
        title: "讓誰發一則噗",
        characters: roster.value.map((c) => ({
          ...c,
          disabled: getRole(qzoneStore.directorConfig, c.id) === "mute",
        })),
        value: [] as string[],
        multiple: false,
        confirmText: undefined,
      };
    default:
      return { title: "", characters: [], value: [] as string[], multiple: false, confirmText: undefined };
  }
});

function confirmPicker(ids: string[]) {
  const mode = pickerMode.value;
  pickerMode.value = null;
  if (mode === "privateTo") compose.state.privateTo = [...ids];
  if (mode === "responders") compose.state.replyPickIds = [...ids];
  if (mode === "postAs" && ids[0]) void runCharacterPost(ids[0]);
}

type PersonaTarget = "thread" | "me";
const personaFor = ref<PersonaTarget | null>(null);
const qualifierOpen = ref(false);

async function selectPersona(id: string) {
  const target = personaFor.value;
  personaFor.value = null;
  if (target === "thread") {
    threadPersonaId.value = id;
    threadAnonymous.value = false;
  } else if (target === "me") {
    userStore.switchPersona(id);
    await userStore.saveUserData();
  }
}

const stickerTarget = ref<"compose" | "thread" | null>(null);

function insertSticker(content: string) {
  if (stickerTarget.value === "compose") composeRef.value?.insertText(content);
  if (stickerTarget.value === "thread") threadRef.value?.insertText(content);
  stickerTarget.value = null;
}

const legacyOpen = ref(false);

// ============================================================
// 通知
// ============================================================

const noticeFilter = ref<"all" | "reply">("all");
const noticeRows = computed<NoticeRow[]>(() =>
  // 系統通知是第 4 期，目前「回應」與「全部」相同
  buildNoticeList(basePosts.value, now.value, qzoneStore.settings.unreadSince).map((item) => {
    const post = findPost(item.postId);
    const anon = !!post && isAnonPost(post);
    return {
      postId: item.postId,
      commentId: item.commentId,
      authorName: anon ? anonHandle(item.postId, item.authorId) : authorName(item.authorId, item.username),
      authorAvatar: anon ? ANON_AVATAR : authorAvatar(item.authorId, item.avatar),
      text: item.text,
      timeText: formatTime(item.timestamp),
      unread: item.unread,
    };
  }),
);

async function openNotice(postId: string, commentId: string) {
  openThread(postId);
  await nextTick();
  window.setTimeout(() => threadRef.value?.scrollToResponse(commentId), 60);
}

// ============================================================
// 我
// ============================================================

const meTab = ref<"mine" | "responded" | "bookmarked">("mine");
const mePersona = computed(() => {
  const persona = userStore.currentPersona;
  return {
    name: persona?.name || qzoneStore.settings.nickname || "我",
    avatar: persona?.avatar || legacyAvatar.value,
    groupName: persona?.groupName || undefined,
  };
});

const myPosts = computed(() => basePosts.value.filter((p) => p.authorType === "user"));
const meStats = computed(() => ({
  posts: myPosts.value.length,
  responses: myPosts.value.reduce(
    (sum, p) => sum + visibleComments(p, now.value).filter((c) => c.authorType !== "user").length,
    0,
  ),
  likes: myPosts.value.reduce((sum, p) => sum + getLikeTotal(p), 0),
}));

const meRows = computed<MeListRow[]>(() => {
  let list: QZonePost[];
  if (meTab.value === "mine") list = myPosts.value;
  else if (meTab.value === "responded")
    list = basePosts.value.filter((p) => p.authorType !== "user" && p.comments.some((c) => c.authorType === "user"));
  else list = basePosts.value.filter((p) => p.bookmarked);
  return list.map((p) => ({
    postId: p.id,
    qualifier: p.qualifier,
    text: plurkPlainText(p.content || "", 80) || (p.originalPost ? "轉噗" : ""),
    meta: `${formatTime(p.timestamp)} · ${visibleComments(p, now.value).length} 則回應`,
  }));
});

// ============================================================
// AI 導演
// ============================================================

const directorOpen = ref(false);
const directorWorking = ref(false);
const directorBusy = computed(
  () =>
    directorWorking.value ||
    plurkActivity.square ||
    aiGenerationStore.isTaskGenerating("qzone", "qzone-comments"),
);

const callsPerHourText = computed(() => {
  const cfg = qzoneStore.directorConfig;
  const rate = LIVELINESS_RATES[cfg.liveliness - 1] ?? LIVELINESS_RATES[1];
  const head = rate >= 1 ? `約每小時 ${rate} 次 AI 呼叫` : `約每天 ${Math.max(1, Math.round(rate * 24))} 次 AI 呼叫`;
  return `${head}，每天最多 ${cfg.dailyCap} 次`;
});

function hasPostApi(): boolean {
  const api = settingsStore.getAPIForTask("plurkPost").api;
  return !!(api.endpoint && api.apiKey && api.model);
}

async function runCharacterPost(characterId: string) {
  if (!hasPostApi()) return alert("請先配置 API");
  const character = charactersStore.getCharacterById(characterId);
  if (!character) return;
  directorWorking.value = true;
  try {
    const peekSummary = qzoneStore.directorConfig.usePeekPhone ? await buildPeekSummary(character.id) : undefined;
    const raw = await generateCharacterPlurk(character, { peekSummary });
    const post = raw ? await publishCharacterPlurk(character, raw) : null;
    if (!post) {
      alert("這次沒有生成內容，再試一次看看");
      return;
    }
    directorOpen.value = false;
    tab.value = "river";
    riverRef.value?.scrollToTop();
  } catch (error) {
    console.error("[Plurk] 角色發噗失敗:", error);
    alert("AI 發噗失敗，請檢查 API 配置");
  } finally {
    directorWorking.value = false;
  }
}

function postNowRandom() {
  const cfg = qzoneStore.directorConfig;
  const pool = roster.value.filter((c) => getRole(cfg, c.id) === "often");
  if (pool.length === 0) return alert(roster.value.length ? "名單裡沒有「常出現」的角色" : "還沒有好友角色，先去聊天吧");
  void runCharacterPost(pool[Math.floor(Math.random() * pool.length)].id);
}

async function replyNow() {
  const latest = basePosts.value.find((p) => p.authorType === "user");
  if (!latest) return alert("你還沒發過噗");
  if (!hasApi()) return alert("請先配置 API");
  directorWorking.value = true;
  try {
    const result = await generateCommentsForPost(latest.id, undefined, {
      includeExistingComments: true,
      ignorePolicy: true,
    });
    if (!result.success) alert(result.error || "生成失敗");
  } finally {
    directorWorking.value = false;
  }
}

// ============================================================
// 返回：最上層的先關
// ============================================================

/** 有東西關掉就回 true；回 false 時由 App 離開噗浪 */
function handleBack(): boolean {
  const layers: Array<[boolean, () => void]> = [
    [lightbox.open, () => (lightbox.open = false)],
    [!!stickerTarget.value, () => (stickerTarget.value = null)],
    [!!pickerMode.value, () => (pickerMode.value = null)],
    [!!personaFor.value, () => (personaFor.value = null)],
    [qualifierOpen.value, () => (qualifierOpen.value = false)],
    [!!actionContext.value, () => (actionContext.value = null)],
    [!!repostTarget.value, () => (repostTarget.value = null)],
    [legacyOpen.value, () => (legacyOpen.value = false)],
    [composeOpen.value, () => (composeOpen.value = false)],
    [directorOpen.value, () => (directorOpen.value = false)],
    [!!threadPostId.value, closeThread],
  ];
  const top = layers.find(([open]) => open);
  top?.[1]();
  return !!top;
}

defineExpose({ handleBack });

// ============================================================
// 生命週期
// ============================================================

onMounted(async () => {
  window.visualViewport?.addEventListener("resize", handleViewportResize);
  await qzoneStore.init();
  await stickerStore.init();
  await charactersStore.loadCharacters();
  await promptManagerStore.loadConfig();
  await userStore.loadUserData();
  await refreshCast();
});

onUnmounted(() => {
  window.visualViewport?.removeEventListener("resize", handleViewportResize);
  if (highlightTimer !== null) window.clearTimeout(highlightTimer);
});
</script>

<style lang="scss">
@use "@/components/plurk/plurk-content.scss";
</style>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-app {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--color-background);
  color: var(--color-text);
}

.plurk-main {
  position: absolute;
  inset: 0;
}

.plurk-tabbar-dock {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
}

.plurk-fab {
  position: absolute;
  right: 16px;
  bottom: calc(100px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  z-index: 21;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 48px;
  padding: 0 20px;
  border: none;
  border-radius: 24px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  box-shadow: $plurk-shadow-float;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.plurk-thread-layer {
  position: absolute;
  inset: 0;
  z-index: 40;
  box-sizing: border-box;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  background: var(--color-background);
}

.plurk-sticker-dim {
  @include plurk-dim;
}

.plurk-sticker-sheet {
  @include plurk-sheet;
  display: flex;
  flex-direction: column;
  height: min(70vh, 520px);
  color: var(--color-text);
}

.plurk-sticker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: $plurk-touch;
}

.plurk-sticker-title {
  font-size: 16px;
  font-weight: 700;
}

.plurk-sticker-close {
  width: $plurk-touch;
  height: $plurk-touch;
  margin-right: -10px;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.plurk-dim-fade-enter-active,
.plurk-dim-fade-leave-active {
  transition: opacity 0.2s ease;
}

.plurk-dim-fade-enter-from,
.plurk-dim-fade-leave-to {
  opacity: 0;
}

.plurk-sheet-slide-enter-active,
.plurk-sheet-slide-leave-active {
  transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.plurk-sheet-slide-enter-from,
.plurk-sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>
