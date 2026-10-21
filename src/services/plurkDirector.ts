/**
 * AI 導演自動模式：App 開著時每 5 分鐘、切回前景時檢查一次，
 * 照熱鬧程度讓角色發噗或回應；重新打開時補上不在時的事（最多 3 件）
 */

import { useBatchComments } from "@/composables/useBatchComments";
import { publishCharacterPlurk } from "@/services/PlurkPostService";
import { buildCastContext, effectiveFriendIds } from "@/services/plurkCast";
import { buildPeekSummary, generateCharacterPlurk } from "@/services/plurkGeneration";
import { generateSquareBatch } from "@/services/plurkSquareGeneration";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import { useSettingsStore } from "@/stores/settings";
import { dayKey, getMutedIds } from "@/utils/plurkDirectorConfig";
import { pickPoster, pickReplyTarget, pickSquareVisitTarget, planDirectorEvents } from "@/utils/plurkDirectorPlan";
import { needsSquareRefill } from "@/utils/plurkSquareSchedule";

const CHECK_MS = 5 * 60_000;
/** 回應事件改成「角色去逛廣場」的機會 */
const VISIT_SHARE = 0.35;
/** 廣場補貨失敗後隔多久才再試，免得每次檢查都白花一次呼叫 */
const SQUARE_RETRY_MS = 20 * 60_000;

class PlurkDirectorService {
  private timer: number | null = null;
  private running = false;
  private lastSquareTry = 0;

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => void this.checkNow(), CHECK_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.checkNow();
    });
    window.setTimeout(() => void this.checkNow(), 15_000);
  }

  async checkNow(): Promise<void> {
    if (this.running || document.hidden) return;
    this.running = true;
    try {
      const qzoneStore = useQzoneStore();
      if (!qzoneStore.isLoaded) await qzoneStore.init();
      const cfg = qzoneStore.directorConfig;
      const now = Date.now();
      // 關閉時只記時間，打開那一刻才不會把關閉期間全部補回來
      if (cfg.mode === "off" || cfg.lastRunAt <= 0) {
        await qzoneStore.updateDirector({ lastRunAt: now });
        return;
      }
      const api = useSettingsStore().getAPIForTask("plurkPost").api;
      if (!api.endpoint || !api.apiKey || !api.model) return;
      if (useAIGenerationStore().isTaskGenerating("qzone", "qzone-comments")) return;
      const charactersStore = useCharactersStore();
      if (charactersStore.characters.length === 0) await charactersStore.loadCharacters();

      const squareRefill = now - this.lastSquareTry > SQUARE_RETRY_MS && needsSquareRefill(qzoneStore.posts, now);
      const events = planDirectorEvents({ cfg, now, squareRefill });
      let done = 0;
      if (events.length > 0) {
        const ctx = await buildCastContext();
        const visibleAuthors = new Set(ctx.allCharacterIds);
        const muted = getMutedIds(cfg);
        const friends = effectiveFriendIds(ctx).filter((id) => !muted.has(id));
        const { generateCommentsForPost } = useBatchComments();
        for (const event of events) {
          if (event.kind === "square") {
            this.lastSquareTry = now;
            const result = await generateSquareBatch({ manual: false });
            if (result.success) done++;
          } else if (event.kind === "post") {
            const id = pickPoster(cfg, friends, event.at);
            const character = id ? charactersStore.characters.find((c) => c.id === id) : null;
            if (!character) continue;
            const peekSummary = cfg.usePeekPhone ? await buildPeekSummary(character.id) : "";
            const raw = await generateCharacterPlurk(character, {
              postedAt: event.at < now - 60_000 ? event.at : undefined,
              peekSummary,
              background: true,
            });
            if (raw) await publishCharacterPlurk(character, raw, {}, { timestamp: event.at });
            done++;
          } else if (Math.random() < VISIT_SHARE && (await this.visitSquare(friends, now))) {
            done++;
          } else {
            const candidates = qzoneStore.posts.filter(
              (p) => p.replyPolicy !== "none" && (p.authorType === "user" || visibleAuthors.has(p.authorId)),
            );
            const target = pickReplyTarget(candidates, now);
            if (!target) continue;
            await generateCommentsForPost(target.id, undefined, {
              includeExistingComments: true,
              slow: true,
              background: true,
            });
            done++;
          }
        }
      }
      const today = dayKey(now);
      const latest = qzoneStore.directorConfig;
      await qzoneStore.updateDirector({
        lastRunAt: now,
        todayKey: today,
        todayCount: (latest.todayKey === today ? latest.todayCount : 0) + done,
      });
    } catch (err) {
      console.warn("[PlurkDirector] 自動模式失敗:", err);
    } finally {
      this.running = false;
    }
  }

  /** 1–2 位好友角色去回一則路人噗；沒有可以逛的就回 false */
  private async visitSquare(friends: string[], now: number): Promise<boolean> {
    const qzoneStore = useQzoneStore();
    const target = pickSquareVisitTarget(qzoneStore.posts, now, new Set(friends));
    if (!target || friends.length === 0) return false;
    const shuffled = [...friends].sort(() => Math.random() - 0.5);
    const visitors = shuffled.slice(0, Math.random() < 0.5 ? 1 : 2);
    const { generateCommentsForPost } = useBatchComments();
    await generateCommentsForPost(target.id, visitors, {
      includeExistingComments: true,
      minComments: visitors.length + 1,
      maxComments: visitors.length + 3,
      slow: true,
      background: true,
      ignorePolicy: true,
    });
    return true;
  }
}

export const plurkDirector = new PlurkDirectorService();
