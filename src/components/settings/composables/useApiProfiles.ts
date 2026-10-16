/**
 * 主要模型配置檔的共用邏輯：表單有沒有改過、切換配置（含未保存確認）、保存。
 * 「主要模型」頁和首頁的「切換配置」面板都用它。
 */
import { useSettingsStore } from "@/stores";
import { computed, ref } from "vue";
import { getProviderLabel } from "../settingsHelpers";

// 舊配置可能缺少這些可選欄位，比較時以預設值代入
const API_FIELD_DEFAULTS: Record<string, unknown> = {
  promptPostProcessing: "none",
  toolProtocol: "auto",
  toolsEnabled: false,
  lastPromptRoleOverride: "none",
  directConnect: false,
  useClaudeNativeCache: false,
};

function sameFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  defaults: Record<string, unknown> = {},
  ignore: string[] = [],
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (ignore.includes(key)) continue;
    const va = a[key] ?? defaults[key];
    const vb = b[key] ?? defaults[key];
    if (va === vb) continue;
    if (
      typeof va === "object" &&
      typeof vb === "object" &&
      JSON.stringify(va) === JSON.stringify(vb)
    ) {
      continue;
    }
    return false;
  }
  return true;
}

const KNOWN_ENDPOINT_NAMES: [string, string][] = [
  ["api.openai.com", "OpenAI"],
  ["anthropic.com", "Claude"],
  ["googleapis.com", "Gemini"],
  ["openrouter.ai", "OpenRouter"],
];
// 這些子網域前綴沒有辨識度，取名時跳過
const GENERIC_HOST_LABELS = new Set([
  "api",
  "www",
  "oneapi",
  "newapi",
  "gateway",
  "proxy",
  "openai",
  "v1",
]);

// 從端點取出一個好認的短名稱，例如 oneapi.hakoyu.com → hakoyu
function getEndpointShortName(endpoint: string): string {
  if (!endpoint) return "";
  for (const [needle, name] of KNOWN_ENDPOINT_NAMES) {
    if (endpoint.includes(needle)) return name;
  }
  let hostname = "";
  try {
    hostname = new URL(endpoint).hostname;
  } catch {
    return "";
  }
  if (/^[\d.]+$/.test(hostname) || hostname === "localhost") return hostname;
  const labels = hostname.split(".");
  // 去掉頂級網域（.com / .xyz …）
  const candidates = labels.length > 1 ? labels.slice(0, -1) : labels;
  return (
    candidates.find((label) => !GENERIC_HOST_LABELS.has(label)) ||
    candidates[candidates.length - 1] ||
    hostname
  );
}

export function useApiProfiles(
  options: {
    /** 切換配置之後要做的事（例如清掉已拉取的模型清單） */
    onSwitched?: (endpointChanged: boolean) => void;
    /** 保存失敗時怎麼提示，預設 alert */
    onError?: (message: string) => void;
  } = {},
) {
  const settingsStore = useSettingsStore();
  const isSaving = ref(false);

  // 主表單（API + 生成參數）是否和當前配置已保存的內容不同
  const isFormDirty = computed(() => {
    const cur = settingsStore.currentProfileId;
    if (!cur) return false;
    const profile = settingsStore.profiles.find((p) => p.id === cur);
    if (!profile) return false;
    return !(
      sameFields(
        profile.api as unknown as Record<string, unknown>,
        settingsStore.api as unknown as Record<string, unknown>,
        API_FIELD_DEFAULTS,
      ) &&
      sameFields(
        profile.generation as unknown as Record<string, unknown>,
        settingsStore.generation as unknown as Record<string, unknown>,
        {},
        // 上下文長度是全域設定，不跟配置走
        ["maxContextLength"],
      )
    );
  });

  const currentProfile = computed(() =>
    settingsStore.profiles.find((p) => p.id === settingsStore.currentProfileId) ?? null,
  );

  function reportError(message: string) {
    if (options.onError) options.onError(message);
    else alert(message);
  }

  // 只保存配置列表的變動（新建、刪除、改名、切換…），不碰表單內容
  async function persistProfileList() {
    try {
      await settingsStore.saveSettings();
    } catch (e) {
      console.error("保存配置列表失敗:", e);
      reportError("保存失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function doSave(saveOptions: { syncProfile?: boolean } = {}): Promise<boolean> {
    isSaving.value = true;
    try {
      await settingsStore.saveSettings(saveOptions);
      return true;
    } catch (e) {
      console.error("保存失敗:", e);
      reportError("保存失敗：" + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  // 名稱重複時自動加上 (2)、(3)…
  function makeUniqueProfileName(base: string, excludeId?: string): string {
    const taken = new Set(
      settingsStore.profiles.filter((p) => p.id !== excludeId).map((p) => p.name),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} (${n})`)) n++;
    return `${base} (${n})`;
  }

  // 根據 API 資訊生成配置文件名稱建議：「主機名 · 模型」
  function getProfileNameSuggestion(): string {
    const host =
      getEndpointShortName(settingsStore.api.endpoint?.trim() || "") ||
      getProviderLabel(settingsStore.api.provider);
    const model = (settingsStore.api.model || "").trim();
    const shortModel = model.length > 32 ? model.slice(0, 32) + "…" : model;
    const base = [host, shortModel].filter(Boolean).join(" · ");
    return makeUniqueProfileName(base || `配置 ${settingsStore.profiles.length + 1}`);
  }

  // 「更新配置」：保存全部，並把主表單寫回當前配置
  async function saveToCurrentProfile(): Promise<boolean> {
    // 還沒有任何配置文件時，自動用目前表單建立第一個
    if (
      settingsStore.profiles.length === 0 &&
      settingsStore.api.endpoint?.trim() &&
      settingsStore.api.apiKey?.trim()
    ) {
      settingsStore.createProfile(getProfileNameSuggestion());
    }
    return doSave({ syncProfile: true });
  }

  // ===== 切換配置 =====
  const pendingSwitchProfileId = ref<string | null>(null);
  const showSwitchConfirm = ref(false);

  /** 回傳 true 表示已切換（或本來就是它），false 表示在等使用者確認 */
  function requestSwitchProfile(profileId: string): boolean {
    if (profileId === settingsStore.currentProfileId) return true;
    if (isFormDirty.value) {
      pendingSwitchProfileId.value = profileId;
      showSwitchConfirm.value = true;
      return false;
    }
    void performSwitchProfile(profileId);
    return true;
  }

  async function performSwitchProfile(profileId: string) {
    const prevEndpoint = settingsStore.api.endpoint;
    settingsStore.switchProfile(profileId);
    options.onSwitched?.(prevEndpoint !== settingsStore.api.endpoint);
    pendingSwitchProfileId.value = null;
    showSwitchConfirm.value = false;
    await persistProfileList();
  }

  async function switchConfirmSaveAndGo() {
    // 先把當前表單寫回當前配置，再切換
    const targetId = pendingSwitchProfileId.value;
    const ok = await doSave({ syncProfile: true });
    if (ok && targetId) await performSwitchProfile(targetId);
  }

  async function switchConfirmDiscardAndGo() {
    if (pendingSwitchProfileId.value) {
      await performSwitchProfile(pendingSwitchProfileId.value);
    }
  }

  function switchConfirmCancel() {
    pendingSwitchProfileId.value = null;
    showSwitchConfirm.value = false;
  }

  return {
    isSaving,
    isFormDirty,
    currentProfile,
    persistProfileList,
    doSave,
    saveToCurrentProfile,
    makeUniqueProfileName,
    getProfileNameSuggestion,
    pendingSwitchProfileId,
    showSwitchConfirm,
    requestSwitchProfile,
    performSwitchProfile,
    switchConfirmSaveAndGo,
    switchConfirmDiscardAndGo,
    switchConfirmCancel,
  };
}
