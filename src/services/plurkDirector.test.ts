import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DIRECTOR_CONFIG, type PlurkDirectorConfig } from "@/utils/plurkDirectorConfig";

const H = 3600_000;
const state = {
  cfg: { ...DEFAULT_DIRECTOR_CONFIG } as PlurkDirectorConfig,
  posts: [] as Array<{ id: string; timestamp: number }>,
};
const updateDirector = vi.fn(async (patch: Partial<PlurkDirectorConfig>) => {
  state.cfg = { ...state.cfg, ...patch };
});
const generateCommentsForPost = vi.fn(async () => ({ success: true, addedCount: 1 }));
const generateCharacterPlurk = vi.fn(async () => "<plurk>嗨</plurk>");
const publishCharacterPlurk = vi.fn(async (_c: unknown, _raw: string, _f: unknown, opts: { timestamp?: number }) => {
  state.posts.push({ id: `p${state.posts.length}`, timestamp: opts.timestamp ?? Date.now() });
  return {};
});

vi.mock("@/stores/qzone", () => ({
  useQzoneStore: () => ({
    isLoaded: true,
    get directorConfig() {
      return state.cfg;
    },
    get posts() {
      return [];
    },
    updateDirector,
  }),
}));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({ getAPIForTask: () => ({ api: { endpoint: "e", apiKey: "k", model: "m" } }) }),
}));
vi.mock("@/stores/aiGeneration", () => ({ useAIGenerationStore: () => ({ isTaskGenerating: () => false }) }));
vi.mock("@/stores/characters", () => ({
  useCharactersStore: () => ({ characters: [{ id: "a" }, { id: "b" }], loadCharacters: async () => {} }),
}));
vi.mock("@/composables/useBatchComments", () => ({ useBatchComments: () => ({ generateCommentsForPost }) }));
vi.mock("@/services/PlurkPostService", () => ({ publishCharacterPlurk }));
vi.mock("@/services/plurkGeneration", () => ({ generateCharacterPlurk, buildPeekSummary: async () => "" }));
vi.mock("@/services/plurkCast", () => ({
  buildCastContext: async () => ({ allCharacterIds: ["a", "b"], friendIds: new Set(["a", "b"]), mutedIds: new Set() }),
  effectiveFriendIds: () => ["a", "b"],
}));

vi.stubGlobal("document", { hidden: false, addEventListener: () => {} });

const { plurkDirector } = await import("./plurkDirector");

beforeEach(() => {
  vi.clearAllMocks();
  state.posts = [];
});

describe("plurkDirector.checkNow", () => {
  it("關閉時只記時間", async () => {
    state.cfg = { ...DEFAULT_DIRECTOR_CONFIG, mode: "off", lastRunAt: Date.now() - 3 * H };
    await plurkDirector.checkNow();
    expect(generateCharacterPlurk).not.toHaveBeenCalled();
    expect(updateDirector).toHaveBeenCalledWith({ lastRunAt: expect.any(Number) });
  });

  it("離開 3 小時：補最多 3 件，時間落在離開期間，今天次數增加", async () => {
    const last = Date.now() - 3 * H;
    // 全部是發噗事件：熱鬧程度 5、作息不限
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    state.cfg = { ...DEFAULT_DIRECTOR_CONFIG, mode: "free", liveliness: 5, followRoutine: false, lastRunAt: last };
    await plurkDirector.checkNow();
    vi.mocked(Math.random).mockRestore();

    expect(state.posts).toHaveLength(3);
    for (const p of state.posts) {
      expect(p.timestamp).toBeGreaterThan(last);
      expect(p.timestamp).toBeLessThanOrEqual(Date.now());
    }
    expect(generateCharacterPlurk.mock.calls.every((call) => (call as unknown[])[1] && ((call as unknown[])[1] as { background?: boolean }).background)).toBe(true);
    expect(state.cfg.todayCount).toBe(3);
    expect(state.cfg.lastRunAt).toBeGreaterThan(last);
  });
});
