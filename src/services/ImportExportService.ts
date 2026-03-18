/**
 * 導入導出服務
 * 支持角色卡 PNG/JSON 導入導出
 * 支持聊天記錄 ZIP 導入導出
 */

import { strFromU8, strToU8, unzip, zip } from "fflate";
import jsYaml from "js-yaml";
import type { ConversationSummary, DiaryEntry } from "../db/database";
import { db, DB_STORES } from "../db/database";
import {
  collectImageRefs,
  deleteChatImagesByRefs,
  extractImagesFromMessages,
  restoreImagesToMessages,
} from "../db/operations";
import type {
  AffinityMetricConfig,
  CharacterAffinityConfig,
} from "../schemas/affinity";
import type {
  CharacterBook,
  CharacterBookEntry,
  CharacterCardV2,
  CharacterCardV2Data,
  CharacterImportResult,
  StoredCharacter,
} from "../types/character";
import { createDefaultStoredCharacter } from "../types/character";
import type { Chat, ChatMessage, MessageSender } from "../types/chat";
import type { ImportantEventsLog } from "../types/importantEvents";
import type { Lorebook, WorldInfoEntry } from "../types/worldinfo";
import {
  createDefaultWorldInfoEntry,
  WorldInfoLogic,
  WorldInfoPosition,
} from "../types/worldinfo";
import { getCharacterService } from "./CharacterService";
import { getLorebookService } from "./LorebookService";
import { migrateRegexScript } from "./RegexEngine";

/**
 * PNG 元數據關鍵字
 */
const PNG_KEYWORD = "chara";

/**
 * 從 Base64 解碼
 */
function decodeBase64(str: string): string {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    return atob(str);
  }
}

/**
 * 轉換為 Base64
 */
function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * 從 PNG 讀取元數據
 */
async function extractPngMetadata(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const view = new DataView(buffer);

        // 檢查 PNG 簽名
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
          if (view.getUint8(i) !== signature[i]) {
            console.error("Not a valid PNG file");
            resolve(null);
            return;
          }
        }

        // 遍歷 chunks 尋找 tEXt 或 iTXt
        let offset = 8;
        while (offset < buffer.byteLength) {
          const length = view.getUint32(offset);
          const type = String.fromCharCode(
            view.getUint8(offset + 4),
            view.getUint8(offset + 5),
            view.getUint8(offset + 6),
            view.getUint8(offset + 7),
          );

          if (type === "tEXt") {
            // 讀取 tEXt chunk
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;
            const textData = new Uint8Array(buffer.slice(dataStart, dataEnd));

            // 找到 null 分隔符
            let nullIndex = -1;
            for (let i = 0; i < textData.length; i++) {
              if (textData[i] === 0) {
                nullIndex = i;
                break;
              }
            }

            if (nullIndex > 0) {
              const keyword = new TextDecoder().decode(
                textData.slice(0, nullIndex),
              );

              if (keyword === PNG_KEYWORD) {
                const value = new TextDecoder().decode(
                  textData.slice(nullIndex + 1),
                );
                resolve(decodeBase64(value));
                return;
              }
            }
          } else if (type === "iTXt") {
            // 讀取 iTXt chunk（國際化文本）
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;
            const textData = new Uint8Array(buffer.slice(dataStart, dataEnd));

            // iTXt 格式更複雜，簡化處理
            let nullCount = 0;
            let textStart = 0;
            for (let i = 0; i < textData.length; i++) {
              if (textData[i] === 0) {
                nullCount++;
                if (nullCount === 1) {
                  const keyword = new TextDecoder().decode(
                    textData.slice(0, i),
                  );
                  if (keyword !== PNG_KEYWORD) break;
                }
                if (nullCount === 4) {
                  textStart = i + 1;
                  break;
                }
              }
            }

            if (nullCount >= 4 && textStart > 0) {
              const value = new TextDecoder().decode(textData.slice(textStart));
              // 嘗試解碼 base64
              try {
                resolve(decodeBase64(value));
                return;
              } catch {
                resolve(value);
                return;
              }
            }
          } else if (type === "IEND") {
            break;
          }

          offset += 12 + length;
        }

        resolve(null);
      } catch (err) {
        console.error("Error reading PNG metadata:", err);
        resolve(null);
      }
    };

    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 將 CharacterBook 轉換為 Lorebook
 */
export function convertCharacterBookToLorebook(
  book: CharacterBook,
  characterName: string,
): Lorebook {
  const entries: WorldInfoEntry[] = book.entries.map((entry, index) => {
    // 轉換位置到數字枚舉
    // SillyTavern 格式：extensions.position 存儲數字值
    // 舊格式：entry.position 可能是字串 'after_char' 或數字
    let position = WorldInfoPosition.BEFORE_CHAR;
    if (
      entry.extensions?.position !== undefined &&
      typeof entry.extensions.position === "number"
    ) {
      // 優先使用 extensions 中的數字位置（SillyTavern 標準格式）
      position = entry.extensions.position;
    } else if (typeof entry.position === "number") {
      // 直接使用數字位置
      position = entry.position as WorldInfoPosition;
    } else if (typeof entry.position === "string") {
      // 字串格式轉換
      const positionMap: Record<string, WorldInfoPosition> = {
        before_char: WorldInfoPosition.BEFORE_CHAR,
        after_char: WorldInfoPosition.AFTER_CHAR,
        an_top: WorldInfoPosition.AN_TOP,
        an_bottom: WorldInfoPosition.AN_BOTTOM,
        at_depth: WorldInfoPosition.AT_DEPTH,
        em_top: WorldInfoPosition.EM_TOP,
        em_bottom: WorldInfoPosition.EM_BOTTOM,
        outlet: WorldInfoPosition.OUTLET,
        // SillyTavern 數字字串格式
        "0": WorldInfoPosition.BEFORE_CHAR,
        "1": WorldInfoPosition.AFTER_CHAR,
        "2": WorldInfoPosition.AN_TOP,
        "3": WorldInfoPosition.AN_BOTTOM,
        "4": WorldInfoPosition.AT_DEPTH,
        "5": WorldInfoPosition.EM_TOP,
        "6": WorldInfoPosition.EM_BOTTOM,
        "7": WorldInfoPosition.OUTLET,
      };
      position =
        positionMap[entry.position.toLowerCase()] ??
        WorldInfoPosition.BEFORE_CHAR;
    }

    return {
      ...createDefaultWorldInfoEntry(entry.id ?? index),
      uid: entry.id ?? index,
      key: entry.keys || [],
      keysecondary: entry.secondary_keys || [],
      comment: entry.comment || "",
      content: entry.content || "",
      constant: entry.constant || false,
      disable: !entry.enabled,
      selective: entry.selective || false,
      selectiveLogic:
        entry.extensions?.selectiveLogic ?? WorldInfoLogic.AND_ANY,
      order: entry.insertion_order || 100,
      position,
      depth: entry.extensions?.depth ?? 4,
      role: entry.extensions?.role ?? null,
      excludeRecursion: entry.extensions?.exclude_recursion || false,
      preventRecursion: entry.extensions?.prevent_recursion || false,
      probability: entry.extensions?.probability ?? 100,
      useProbability: entry.extensions?.useProbability ?? true,
      scanDepth: entry.extensions?.scan_depth ?? null,
      caseSensitive: entry.extensions?.case_sensitive ?? null,
      matchWholeWords: entry.extensions?.match_whole_words ?? null,
      useGroupScoring: entry.extensions?.use_group_scoring ?? null,
      group: entry.extensions?.group || "",
      groupOverride: entry.extensions?.group_override || false,
      groupWeight: entry.extensions?.group_weight ?? 100,
      automationId: entry.extensions?.automation_id || "",
      vectorized: entry.extensions?.vectorized || false,
    };
  });

  return {
    id: crypto.randomUUID(),
    name: book.name || `${characterName}'s Lorebook`,
    description: book.description,
    entries,
    scanDepth: book.scan_depth,
    tokenBudget: book.token_budget,
    recursiveScanning: book.recursive_scanning,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 解析角色卡 JSON
 */
function parseCharacterCard(data: any): CharacterCardV2Data | null {
  try {
    let cardData: CharacterCardV2Data | null = null;

    // Character Card v2/v3 格式
    if (data.spec === "chara_card_v2" || data.spec === "chara_card_v3") {
      cardData = data.data as CharacterCardV2Data;
    }
    // V1 格式（帶 data 擴展）
    else if (data.data && typeof data.data === "object") {
      cardData = data.data as CharacterCardV2Data;
    }
    // 純 V1 格式
    else if (data.name && (data.description || data.first_mes)) {
      cardData = {
        name: data.name || "",
        description: data.description || "",
        character_version: "1.0",
        personality: data.personality || "",
        scenario: data.scenario || "",
        first_mes: data.first_mes || "",
        mes_example: data.mes_example || "",
        creator_notes: data.creatorcomment || "",
        tags: data.tags || [],
        system_prompt: "",
        post_history_instructions: "",
        creator: "",
        alternate_greetings: [],
        extensions: {
          talkativeness: data.talkativeness || 0.5,
          fav: !!data.fav,
          world: "",
          depth_prompt: { depth: 4, prompt: "", role: "system" },
          regex_scripts: [],
        },
      };
    }

    // 確保必要欄位存在（自己導出的卡可能缺少 extensions）
    if (cardData) {
      if (!cardData.extensions) {
        cardData.extensions = {
          talkativeness: 0.5,
          fav: false,
          world: "",
          depth_prompt: { depth: 4, prompt: "", role: "system" },
          regex_scripts: [],
        };
      }
      // 確保 regex_scripts 陣列存在
      if (!Array.isArray(cardData.extensions.regex_scripts)) {
        cardData.extensions.regex_scripts = [];
      }
      if (!cardData.character_version) {
        cardData.character_version = "1.0";
      }
      if (!cardData.alternate_greetings) {
        cardData.alternate_greetings = [];
      }
      if (!cardData.tags) {
        cardData.tags = [];
      }
    }

    return cardData;
  } catch {
    return null;
  }
}

// ===== MVU 偵測與轉換 =====

/**
 * 從世界書條目列表中偵測並解析 MVU initvar 條目。
 * MVU 卡的特徵：存在名稱含 "[initvar]" 的世界書條目，
 * 其 content 是 YAML 格式的初始變量字典。
 *
 * @returns AffinityConfig（僅含 metrics 和初始值），或 null 表示未偵測到 MVU
 */
export function detectAndConvertMvuConfig(
  entries: CharacterBookEntry[],
  characterId: string,
): CharacterAffinityConfig | null {
  const initvarEntry = entries.find(
    (e) =>
      typeof e.comment === "string" &&
      e.comment.toLowerCase().includes("[initvar]"),
  );
  if (!initvarEntry?.content) return null;

  let parsed: unknown;
  try {
    parsed = jsYaml.load(initvarEntry.content);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;

  const metrics: AffinityMetricConfig[] = [];

  const extractMetrics = (namespace: string, obj: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "number") {
        metrics.push({
          id: `mvu_${namespace}_${key}`,
          name: `${namespace}.${key}`,
          type: "number",
          min: 0,
          max: 100,
          initial: value,
          options: [],
          stages: [],
        });
      } else if (typeof value === "string") {
        metrics.push({
          id: `mvu_${namespace}_${key}`,
          name: `${namespace}.${key}`,
          type: "string",
          min: 0,
          max: 100,
          initial: value,
          options: [],
          stages: [],
        });
      }
      // 跳過嵌套物件（如 着装）和陣列（太複雜）
    }
  };

  // 從每個頂層 namespace（角色名、主角等）提取葉節點變量
  for (const [ns, nsValue] of Object.entries(root)) {
    if (nsValue && typeof nsValue === "object" && !Array.isArray(nsValue)) {
      extractMetrics(ns, nsValue as Record<string, unknown>);
    }
  }

  if (metrics.length === 0) return null;

  return {
    characterId,
    enabled: true,
    statKey: "",
    metrics,
    promptTemplate: "",
    updateInstruction: "",
    lastUpdated: Date.now(),
  };
}

/**
 * 導入導出服務類
 */
export class ImportExportService {
  /**
   * 從 PNG 文件導入角色
   */
  async importFromPng(file: File): Promise<CharacterImportResult> {
    try {
      // 提取 PNG 元數據
      const metadata = await extractPngMetadata(file);
      if (!metadata) {
        return { success: false, error: "無法從 PNG 讀取角色數據" };
      }

      // 解析 JSON
      let data: any;
      try {
        data = JSON.parse(metadata);
      } catch {
        return { success: false, error: "PNG 中的角色數據格式錯誤" };
      }

      return this.processCharacterData(data, file);
    } catch (e) {
      console.error("[ImportExportService] Failed to import from PNG:", e);
      return { success: false, error: String(e) };
    }
  }

  /**
   * 從 JSON 文件導入角色
   */
  async importFromJson(file: File): Promise<CharacterImportResult> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      return this.processCharacterData(data, file);
    } catch (e) {
      console.error("[ImportExportService] Failed to import from JSON:", e);
      return { success: false, error: String(e) };
    }
  }

  /**
   * 處理角色數據
   */
  private async processCharacterData(
    data: any,
    sourceFile: File,
  ): Promise<CharacterImportResult> {
    // 解析角色卡
    const cardData = parseCharacterCard(data);
    if (!cardData) {
      return { success: false, error: "無法識別的角色卡格式" };
    }

    // 創建存儲角色
    const character: StoredCharacter = {
      ...createDefaultStoredCharacter(),
      id: crypto.randomUUID(),
      nickname: cardData.name,
      data: cardData,
      source: "import",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 如果是 PNG，提取頭像
    if (sourceFile.type === "image/png") {
      try {
        const reader = new FileReader();
        character.avatar = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve("");
          reader.readAsDataURL(sourceFile);
        });
      } catch {
        // 忽略頭像提取錯誤
      }
    }

    // 處理內嵌世界書
    let extractedLorebook: Lorebook | undefined;
    let detectedMvuConfig: CharacterAffinityConfig | null = null;
    if (
      cardData.character_book &&
      cardData.character_book.entries?.length > 0
    ) {
      extractedLorebook = convertCharacterBookToLorebook(
        cardData.character_book,
        cardData.name,
      );

      // 偵測 MVU initvar（在角色 ID 確定後再存）
      detectedMvuConfig = detectAndConvertMvuConfig(
        cardData.character_book.entries,
        character.id,
      );

      // 保存世界書
      const lorebookService = getLorebookService();
      const savedLorebook = await lorebookService.create(extractedLorebook);

      // 綁定到角色
      character.lorebookIds = [savedLorebook.id];
    }

    // 保存角色
    const characterService = getCharacterService();
    const savedCharacter = await characterService.create(character);

    // 處理內嵌正則腳本
    let regexScriptsCount = 0;
    const regexScripts = cardData.extensions?.regex_scripts;
    if (Array.isArray(regexScripts) && regexScripts.length > 0) {
      try {
        // 遷移並存入角色的 extensions.regex_scripts（角色腳本）
        const migrated = regexScripts.map((s: any) => {
          const m = migrateRegexScript(s);
          // 強制新 UUID 避免衝突
          m.id = crypto.randomUUID();
          return m;
        });
        savedCharacter.data.extensions.regex_scripts = migrated;
        await characterService.update(savedCharacter.id, {
          data: savedCharacter.data,
        });
        regexScriptsCount = migrated.length;
        console.log(
          `[ImportExportService] 導入 ${regexScriptsCount} 個正則腳本（角色: ${cardData.name}）`,
        );
      } catch (e) {
        console.error("[ImportExportService] 正則腳本導入失敗:", e);
      }
    }

    // 保存 MVU 好感度配置（如果偵測到）
    let mvuMetricsCount: number | undefined;
    if (detectedMvuConfig) {
      try {
        const { db, DB_STORES } = await import("../db/database");
        await db.init();
        await db.put(DB_STORES.CHARACTER_AFFECTIONS, {
          ...detectedMvuConfig,
          characterId: savedCharacter.id,
        });
        mvuMetricsCount = detectedMvuConfig.metrics.length;
        console.log(
          `[ImportExportService] 偵測到 MVU，已轉換 ${mvuMetricsCount} 個指標（角色: ${cardData.name}）`,
        );
      } catch (e) {
        console.error("[ImportExportService] MVU 配置保存失敗:", e);
      }
    }

    return {
      success: true,
      character: savedCharacter,
      lorebook: extractedLorebook
        ? {
            id: extractedLorebook.id,
            name: extractedLorebook.name,
            entries: extractedLorebook.entries,
          }
        : undefined,
      regexScriptsCount: regexScriptsCount > 0 ? regexScriptsCount : undefined,
      mvuMetricsCount,
    };
  }

  /**
   * 自動檢測文件類型並導入
   */
  async importFromFile(file: File): Promise<CharacterImportResult> {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (file.type === "image/png" || extension === "png") {
      return this.importFromPng(file);
    } else if (file.type === "application/json" || extension === "json") {
      return this.importFromJson(file);
    } else {
      // 手機瀏覽器下載後重新選取時，MIME 可能是 text/plain 或空白
      // 嘗試當作 JSON 解析
      try {
        const text = await file.text();
        JSON.parse(text); // 測試是否為有效 JSON
        return this.importFromJson(file);
      } catch {
        return {
          success: false,
          error: "不支持的文件類型，請選擇 PNG 或 JSON 檔案",
        };
      }
    }
  }

  /**
   * 批量導入
   */
  async importBatch(files: FileList | File[]): Promise<{
    successful: CharacterImportResult[];
    failed: CharacterImportResult[];
  }> {
    const successful: CharacterImportResult[] = [];
    const failed: CharacterImportResult[] = [];

    for (const file of Array.from(files)) {
      const result = await this.importFromFile(file);
      if (result.success) {
        successful.push(result);
      } else {
        failed.push(result);
      }
    }

    return { successful, failed };
  }

  /**
   * 導出角色為 JSON
   */
  async exportCharacterAsJson(characterId: string): Promise<Blob | null> {
    const characterService = getCharacterService();
    const character = await characterService.getById(characterId);
    if (!character) return null;

    // 構建 Character Card v2 格式
    const card: CharacterCardV2 = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: character.data,
    };

    // 如果有綁定的世界書，合併所有世界書條目到 character_book
    if (character.lorebookIds.length > 0) {
      const lorebookService = getLorebookService();
      const allEntries: CharacterBookEntry[] = [];
      let firstName = "";
      let firstDesc: string | undefined;

      for (const lbId of character.lorebookIds) {
        const lorebook = await lorebookService.getById(lbId);
        if (!lorebook) continue;
        const book = this.convertLorebookToCharacterBook(lorebook);
        if (!firstName) {
          firstName = book.name;
          firstDesc = book.description;
        }
        allEntries.push(...book.entries);
      }

      if (allEntries.length > 0) {
        card.data.character_book = {
          name: firstName,
          description: firstDesc,
          scan_depth: undefined,
          token_budget: undefined,
          recursive_scanning: false,
          entries: allEntries,
        };
      }
    }

    const json = JSON.stringify(card, null, 2);
    return new Blob([json], { type: "application/json" });
  }

  /**
   * 將 Lorebook 轉換為 CharacterBook（委託給模組級函式）
   */
  private convertLorebookToCharacterBook(lorebook: Lorebook): CharacterBook {
    return convertLorebookToCharacterBook(lorebook);
  }

  /**
   * 導出世界書為 JSON
   */
  async exportLorebookAsJson(lorebookId: string): Promise<Blob | null> {
    const lorebookService = getLorebookService();
    const json = await lorebookService.exportToJSON(lorebookId);
    if (!json) return null;

    return new Blob([json], { type: "application/json" });
  }

  /**
   * 觸發下載
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // 聊天 ZIP 匯出/匯入
  // ============================================================

  /**
   * 聊天匯出資料結構
   */
  private createChatExportData(
    chat: Chat,
    options: {
      summaries?: ConversationSummary[];
      diaries?: DiaryEntry[];
      importantEvents?: ImportantEventsLog;
      character?: StoredCharacter;
    } = {},
  ) {
    return {
      version: "1.0",
      exportedAt: Date.now(),
      chat,
      summaries: options.summaries || [],
      diaries: options.diaries || [],
      importantEvents: options.importantEvents || null,
      character: options.character
        ? {
            id: options.character.id,
            nickname: options.character.nickname,
            avatar: options.character.avatar,
          }
        : null,
    };
  }

  /**
   * 從訊息中提取媒體檔案
   */
  private extractMediaFromChat(chat: Chat): Map<string, string> {
    const media = new Map<string, string>();
    let mediaIndex = 0;

    for (const msg of chat.messages) {
      // 提取圖片 (Base64 DataURL)
      if (msg.imageUrl?.startsWith("data:")) {
        const ext = this.getExtensionFromDataUrl(msg.imageUrl);
        const filename = `media/img_${mediaIndex++}.${ext}`;
        media.set(msg.id, filename);
      }
    }

    // 提取聊天外觀桌布圖片
    if (
      chat.appearance?.wallpaper?.type === "image" &&
      chat.appearance.wallpaper.value?.startsWith("data:")
    ) {
      const ext = this.getExtensionFromDataUrl(chat.appearance.wallpaper.value);
      const filename = `media/wallpaper.${ext}`;
      media.set("__appearance_wallpaper__", filename);
    }

    return media;
  }

  /**
   * 從 DataURL 獲取副檔名
   */
  private getExtensionFromDataUrl(dataUrl: string): string {
    const match = dataUrl.match(/^data:image\/(\w+);/);
    if (match) {
      const type = match[1].toLowerCase();
      if (type === "jpeg") return "jpg";
      return type;
    }
    return "png";
  }

  /**
   * 將 DataURL 轉換為 Uint8Array
   */
  private dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * 將 Uint8Array 轉換為 DataURL
   */
  private uint8ArrayToDataUrl(data: Uint8Array, mimeType: string): string {
    let binary = "";
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
  }

  /**
   * 從檔名推斷 MIME 類型
   */
  private getMimeTypeFromFilename(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    return mimeMap[ext || ""] || "image/png";
  }

  /**
   * 匯出單個聊天為 ZIP
   */
  async exportChatAsZip(
    chatId: string,
    options: {
      includeSummaries?: boolean;
      includeDiaries?: boolean;
      includeImportantEvents?: boolean;
      includeCharacterInfo?: boolean;
    } = {},
  ): Promise<Blob | null> {
    try {
      // 獲取聊天資料
      const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
      if (!chat) {
        console.error("[ImportExportService] Chat not found:", chatId);
        return null;
      }

      // 匯出時還原圖片引用為 base64，確保匯出檔案包含完整數據
      if (chat.messages && chat.messages.length > 0) {
        chat.messages = await restoreImagesToMessages(chat.messages);
      }

      // 準備附加資料
      let summaries: ConversationSummary[] = [];
      let diaries: DiaryEntry[] = [];
      let importantEvents: ImportantEventsLog | undefined;
      let character: StoredCharacter | undefined;

      if (options.includeSummaries !== false) {
        const allSummaries = await db.getAll<ConversationSummary>(
          DB_STORES.SUMMARIES,
        );
        summaries = allSummaries.filter((s) => s.chatId === chatId);
      }

      if (options.includeDiaries !== false) {
        const allDiaries = await db.getAll<DiaryEntry>(DB_STORES.DIARIES);
        diaries = allDiaries.filter((d) => d.chatId === chatId);
      }

      if (options.includeImportantEvents !== false && chat.characterId) {
        importantEvents = await db.get<ImportantEventsLog>(
          DB_STORES.IMPORTANT_EVENTS,
          chat.characterId,
        );
      }

      if (options.includeCharacterInfo !== false && chat.characterId) {
        character = await db.get<StoredCharacter>(
          DB_STORES.CHARACTERS,
          chat.characterId,
        );
      }

      // 提取媒體檔案映射
      const mediaMap = this.extractMediaFromChat(chat);

      // 準備 ZIP 內容
      const zipFiles: Record<string, Uint8Array> = {};

      // 複製聊天資料，將圖片 URL 替換為檔案路徑
      const chatForExport = JSON.parse(JSON.stringify(chat)) as Chat;
      for (const msg of chatForExport.messages) {
        if (msg.imageUrl?.startsWith("data:") && mediaMap.has(msg.id)) {
          const originalUrl = chat.messages.find(
            (m) => m.id === msg.id,
          )?.imageUrl;
          if (originalUrl) {
            // 保存媒體檔案
            const filename = mediaMap.get(msg.id)!;
            zipFiles[filename] = this.dataUrlToUint8Array(originalUrl);
            // 替換為相對路徑
            msg.imageUrl = filename;
          }
        }
      }

      // 處理聊天外觀桌布圖片
      if (
        mediaMap.has("__appearance_wallpaper__") &&
        chatForExport.appearance?.wallpaper?.value?.startsWith("data:")
      ) {
        const originalUrl = chat.appearance!.wallpaper!.value;
        const filename = mediaMap.get("__appearance_wallpaper__")!;
        zipFiles[filename] = this.dataUrlToUint8Array(originalUrl);
        // 替換為相對路徑
        chatForExport.appearance!.wallpaper!.value = filename;
        console.log(
          `[ImportExportService] 匯出聊天桌布圖片: ${filename} (${originalUrl.length} bytes)`,
        );
      }

      // 建立匯出資料
      const exportData = this.createChatExportData(chatForExport, {
        summaries,
        diaries,
        importantEvents,
        character,
      });

      // 添加主要 JSON 檔案
      zipFiles["chat.json"] = strToU8(JSON.stringify(exportData, null, 2));

      // 添加 metadata
      const metadata = {
        version: "1.0",
        format: "aguaphone-chat",
        exportedAt: Date.now(),
        chatName: chat.name,
        characterId: chat.characterId,
        messageCount: chat.messages.length,
        mediaCount: mediaMap.size,
      };
      zipFiles["metadata.json"] = strToU8(JSON.stringify(metadata, null, 2));

      // 壓縮為 ZIP
      return new Promise((resolve, reject) => {
        zip(zipFiles, { level: 6 }, (err, data) => {
          if (err) {
            console.error("[ImportExportService] ZIP compression failed:", err);
            reject(err);
            return;
          }
          resolve(new Blob([data], { type: "application/zip" }));
        });
      });
    } catch (e) {
      console.error("[ImportExportService] Failed to export chat as ZIP:", e);
      return null;
    }
  }

  /**
   * 從 ZIP 匯入聊天
   */
  async importChatFromZip(file: File): Promise<{
    success: boolean;
    chat?: Chat;
    error?: string;
    stats?: {
      messageCount: number;
      mediaCount: number;
      summaryCount: number;
      diaryCount: number;
    };
  }> {
    try {
      // 讀取 ZIP 檔案
      const arrayBuffer = await file.arrayBuffer();
      const zipData = new Uint8Array(arrayBuffer);

      // 解壓縮
      const files = await new Promise<Record<string, Uint8Array>>(
        (resolve, reject) => {
          unzip(zipData, (err, data) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(data);
          });
        },
      );

      // 檢查必要檔案
      if (!files["chat.json"]) {
        return { success: false, error: "ZIP 中找不到 chat.json" };
      }

      // 解析聊天資料
      const exportData = JSON.parse(strFromU8(files["chat.json"]));
      if (!exportData.chat) {
        return { success: false, error: "無效的聊天資料格式" };
      }

      const chat = exportData.chat as Chat;

      // 還原媒體檔案
      let mediaCount = 0;
      for (const msg of chat.messages) {
        if (
          msg.imageUrl &&
          !msg.imageUrl.startsWith("data:") &&
          !msg.imageUrl.startsWith("http")
        ) {
          // 這是相對路徑，嘗試從 ZIP 中還原
          const mediaFile = files[msg.imageUrl];
          if (mediaFile) {
            const mimeType = this.getMimeTypeFromFilename(msg.imageUrl);
            msg.imageUrl = this.uint8ArrayToDataUrl(mediaFile, mimeType);
            mediaCount++;
          }
        }
      }

      // 還原聊天外觀桌布圖片
      if (
        chat.appearance?.wallpaper?.type === "image" &&
        chat.appearance.wallpaper.value &&
        !chat.appearance.wallpaper.value.startsWith("data:") &&
        !chat.appearance.wallpaper.value.startsWith("http")
      ) {
        const wallpaperFile = files[chat.appearance.wallpaper.value];
        if (wallpaperFile) {
          const mimeType = this.getMimeTypeFromFilename(
            chat.appearance.wallpaper.value,
          );
          chat.appearance.wallpaper.value = this.uint8ArrayToDataUrl(
            wallpaperFile,
            mimeType,
          );
          mediaCount++;
          console.log(
            `[ImportExportService] 還原聊天桌布圖片: ${chat.appearance.wallpaper.value.length} bytes`,
          );
        } else {
          console.warn(
            `[ImportExportService] 找不到聊天桌布圖片: ${chat.appearance.wallpaper.value}`,
          );
        }
      }

      // 生成新的 ID 避免衝突
      const oldChatId = chat.id;
      chat.id = crypto.randomUUID();
      chat.createdAt = Date.now();
      chat.updatedAt = Date.now();

      // 更新訊息 ID
      for (const msg of chat.messages) {
        msg.id = crypto.randomUUID();
      }

      // 保存聊天（訊息分塊儲存，圖片分離）
      const messagesToSave = [...chat.messages];
      chat.lastMessagePreview =
        messagesToSave[messagesToSave.length - 1]?.content?.slice(0, 100) || "";
      chat.messageCount = messagesToSave.length;
      // 圖片分離後存回 chat.messages
      const messagesForStorage =
        await extractImagesFromMessages(messagesToSave);
      chat.messages = messagesForStorage;
      await db.put(DB_STORES.CHATS, chat);

      // 匯入總結
      let summaryCount = 0;
      if (exportData.summaries?.length > 0) {
        for (const summary of exportData.summaries as ConversationSummary[]) {
          summary.id = crypto.randomUUID();
          summary.chatId = chat.id;
          await db.put(DB_STORES.SUMMARIES, summary);
          summaryCount++;
        }
      }

      // 匯入日記
      let diaryCount = 0;
      if (exportData.diaries?.length > 0) {
        for (const diary of exportData.diaries as DiaryEntry[]) {
          diary.id = crypto.randomUUID();
          diary.chatId = chat.id;
          await db.put(DB_STORES.DIARIES, diary);
          diaryCount++;
        }
      }

      return {
        success: true,
        chat,
        stats: {
          messageCount: messagesToSave.length,
          mediaCount,
          summaryCount,
          diaryCount,
        },
      };
    } catch (e) {
      console.error("[ImportExportService] Failed to import chat from ZIP:", e);
      return { success: false, error: String(e) };
    }
  }

  /**
   * 批量匯出多個聊天為單一 ZIP
   */
  async exportMultipleChatsAsZip(chatIds: string[]): Promise<Blob | null> {
    try {
      const zipFiles: Record<string, Uint8Array> = {};
      const chatInfos: Array<{
        id: string;
        name: string;
        characterId: string;
        messageCount: number;
      }> = [];

      for (let i = 0; i < chatIds.length; i++) {
        const chatId = chatIds[i];
        const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
        if (!chat) continue;

        // 還原圖片引用為 base64
        if (chat.messages && chat.messages.length > 0) {
          chat.messages = await restoreImagesToMessages(chat.messages);
        }

        // 提取媒體
        const mediaMap = this.extractMediaFromChat(chat);
        const chatForExport = JSON.parse(JSON.stringify(chat)) as Chat;

        // 處理媒體檔案
        for (const msg of chatForExport.messages) {
          if (msg.imageUrl?.startsWith("data:") && mediaMap.has(msg.id)) {
            const originalUrl = chat.messages.find(
              (m) => m.id === msg.id,
            )?.imageUrl;
            if (originalUrl) {
              const filename = `chats/${i}/media/${mediaMap.get(msg.id)!.split("/").pop()}`;
              zipFiles[filename] = this.dataUrlToUint8Array(originalUrl);
              msg.imageUrl = filename;
            }
          }
        }

        // 處理聊天外觀桌布圖片
        if (
          mediaMap.has("__appearance_wallpaper__") &&
          chatForExport.appearance?.wallpaper?.value?.startsWith("data:")
        ) {
          const originalUrl = chat.appearance!.wallpaper!.value;
          const filename = `chats/${i}/media/wallpaper.${this.getExtensionFromDataUrl(originalUrl)}`;
          zipFiles[filename] = this.dataUrlToUint8Array(originalUrl);
          chatForExport.appearance!.wallpaper!.value = filename;
        }

        // 保存聊天 JSON
        zipFiles[`chats/${i}/chat.json`] = strToU8(
          JSON.stringify(chatForExport, null, 2),
        );

        chatInfos.push({
          id: chat.id,
          name: chat.name,
          characterId: chat.characterId,
          messageCount: chat.messages.length,
        });
      }

      // 添加索引檔案
      const index = {
        version: "1.0",
        format: "aguaphone-chat-bundle",
        exportedAt: Date.now(),
        chatCount: chatInfos.length,
        chats: chatInfos,
      };
      zipFiles["index.json"] = strToU8(JSON.stringify(index, null, 2));

      // 壓縮
      return new Promise((resolve, reject) => {
        zip(zipFiles, { level: 6 }, (err, data) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(new Blob([data], { type: "application/zip" }));
        });
      });
    } catch (e) {
      console.error(
        "[ImportExportService] Failed to export multiple chats:",
        e,
      );
      return null;
    }
  }

  // ============================================================
  // SillyTavern JSONL 聊天匯入
  // ============================================================

  /**
   * 從 SillyTavern JSONL 檔案匯入聊天記錄到指定聊天
   * JSONL 格式：第一行為 metadata，後續每行為一條訊息
   */
  async importChatFromJsonl(
    file: File,
    targetChatId: string,
  ): Promise<{
    success: boolean;
    messageCount?: number;
    error?: string;
  }> {
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());

      if (lines.length < 2) {
        return {
          success: false,
          error: "JSONL 檔案內容不足（至少需要 metadata + 1 條訊息）",
        };
      }

      // 第一行是 metadata
      let metadata: any;
      try {
        metadata = JSON.parse(lines[0]);
      } catch {
        return { success: false, error: "無法解析 JSONL metadata（第一行）" };
      }

      // 取得角色名和用戶名
      const characterName = metadata.character_name || metadata.name || "角色";
      const userName = metadata.user_name || "User";

      // 解析訊息行
      const messages: ChatMessage[] = [];
      for (let i = 1; i < lines.length; i++) {
        let msgData: any;
        try {
          msgData = JSON.parse(lines[i]);
        } catch {
          console.warn(
            `[ImportExportService] 跳過無法解析的 JSONL 行 ${i + 1}`,
          );
          continue;
        }

        // 跳過系統訊息
        if (msgData.is_system) continue;

        const isUser = !!msgData.is_user;
        const sender: MessageSender = isUser ? "user" : "assistant";
        const name = isUser ? userName : msgData.name || characterName;

        // 取得訊息內容（處理 swipes）
        let content = msgData.mes || "";
        if (
          msgData.swipes &&
          Array.isArray(msgData.swipes) &&
          msgData.swipe_id !== undefined
        ) {
          content = msgData.swipes[msgData.swipe_id] || content;
        }

        // 替換 {{user}} 和 <user> 佔位符
        content = content
          .replace(/\{\{user\}\}/gi, userName)
          .replace(/<user>/gi, userName);

        // 解析時間
        let createdAt = Date.now();
        if (msgData.send_date) {
          const parsed = Date.parse(msgData.send_date);
          if (!isNaN(parsed)) createdAt = parsed;
        }

        const message: ChatMessage = {
          id: crypto.randomUUID(),
          sender,
          name,
          content,
          is_user: isUser,
          status: "sent",
          createdAt,
          updatedAt: createdAt,
        };

        // 保留 swipes 資訊
        if (
          msgData.swipes &&
          Array.isArray(msgData.swipes) &&
          msgData.swipes.length > 1
        ) {
          message.swipes = msgData.swipes.map((s: string) =>
            s.replace(/\{\{user\}\}/gi, userName).replace(/<user>/gi, userName),
          );
          message.swipeId = msgData.swipe_id ?? 0;
        }

        // 保留模型資訊
        if (msgData.extra?.model) {
          message.model = msgData.extra.model;
        }

        // 保留 token 數量
        if (msgData.extra?.token_count) {
          message.tokenCount = msgData.extra.token_count;
        }

        messages.push(message);
      }

      if (messages.length === 0) {
        return { success: false, error: "JSONL 中沒有可匯入的訊息" };
      }

      // 取得目標聊天
      const chat = await db.get<Chat>(DB_STORES.CHATS, targetChatId);
      if (!chat) {
        return { success: false, error: "找不到目標聊天" };
      }

      // 合併現有訊息和新訊息
      const existingMessages = chat.messages || [];
      existingMessages.push(...messages);

      // 匯入 metadata 中的 variables 到 chat.metadata.variables
      if (metadata.chat_metadata?.variables) {
        if (!chat.metadata.variables) {
          chat.metadata.variables = {};
        }
        Object.assign(
          chat.metadata.variables,
          metadata.chat_metadata.variables,
        );
      }

      // 保存（圖片分離後存回 chat.messages）
      const msgsForStorage = await extractImagesFromMessages(existingMessages);
      chat.messages = msgsForStorage;
      chat.lastMessagePreview =
        existingMessages[existingMessages.length - 1]?.content?.slice(0, 100) ||
        "";
      chat.messageCount = existingMessages.length;
      chat.updatedAt = Date.now();
      await db.put(DB_STORES.CHATS, chat);

      return { success: true, messageCount: messages.length };
    } catch (e) {
      console.error(
        "[ImportExportService] Failed to import chat from JSONL:",
        e,
      );
      return { success: false, error: String(e) };
    }
  }

  /**
   * 導出聊天為 JSONL 格式（SillyTavern 兼容）
   */
  async exportChatAsJsonl(chatId: string): Promise<Blob | null> {
    try {
      const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
      if (!chat) {
        console.error("[ImportExportService] Chat not found:", chatId);
        return null;
      }

      // 還原圖片引用為 base64
      let messages = chat.messages || [];
      if (messages.length > 0) {
        messages = await restoreImagesToMessages(messages);
      }

      // 獲取角色信息
      let characterName = "角色";
      if (chat.characterId) {
        const character = await db.get<StoredCharacter>(
          DB_STORES.CHARACTERS,
          chat.characterId,
        );
        if (character) {
          characterName = character.nickname || character.data?.name || "角色";
        }
      }

      const userName = "User"; // 可以從設置中獲取

      // 構建 metadata（第一行）
      const metadata = {
        character_name: characterName,
        user_name: userName,
        create_date: new Date(chat.createdAt).toISOString(),
        chat_metadata: {
          variables: chat.metadata?.variables || {},
        },
      };

      const lines: string[] = [JSON.stringify(metadata)];

      // 轉換每條訊息
      for (const msg of messages) {
        const isUser = msg.sender === "user" || msg.is_user;

        const jsonlMsg: any = {
          name: msg.name || (isUser ? userName : characterName),
          is_user: isUser,
          is_system: false,
          send_date: new Date(msg.createdAt || Date.now()).toISOString(),
          mes: msg.content || "",
        };

        // 添加 swipes 信息
        if (msg.swipes && msg.swipes.length > 0) {
          jsonlMsg.swipes = msg.swipes;
          jsonlMsg.swipe_id = msg.swipeId ?? 0;
          jsonlMsg.swipe_info = msg.swipes.map(() => ({}));
        }

        // 添加額外信息
        if (msg.model || msg.tokenCount) {
          jsonlMsg.extra = {};
          if (msg.model) jsonlMsg.extra.model = msg.model;
          if (msg.tokenCount) jsonlMsg.extra.token_count = msg.tokenCount;
        }

        lines.push(JSON.stringify(jsonlMsg));
      }

      const content = lines.join("\n");
      return new Blob([content], { type: "application/x-jsonlines" });
    } catch (e) {
      console.error("[ImportExportService] Failed to export chat as JSONL:", e);
      return null;
    }
  }

  /**
   * 從 JSONL 覆蓋當前聊天（清空後重新導入）
   */
  async replaceChatFromJsonl(
    file: File,
    targetChatId: string,
  ): Promise<{
    success: boolean;
    messageCount?: number;
    error?: string;
  }> {
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());

      if (lines.length < 2) {
        return {
          success: false,
          error: "JSONL 檔案內容不足（至少需要 metadata + 1 條訊息）",
        };
      }

      // 解析 metadata
      let metadata: any;
      try {
        metadata = JSON.parse(lines[0]);
      } catch {
        return { success: false, error: "無法解析 JSONL metadata（第一行）" };
      }

      const characterName = metadata.character_name || metadata.name || "角色";
      const userName = metadata.user_name || "User";

      // 解析訊息
      const messages: ChatMessage[] = [];
      for (let i = 1; i < lines.length; i++) {
        let msgData: any;
        try {
          msgData = JSON.parse(lines[i]);
        } catch {
          console.warn(
            `[ImportExportService] 跳過無法解析的 JSONL 行 ${i + 1}`,
          );
          continue;
        }

        if (msgData.is_system) continue;

        const isUser = !!msgData.is_user;
        const sender: MessageSender = isUser ? "user" : "assistant";
        const name = isUser ? userName : msgData.name || characterName;

        let content = msgData.mes || "";
        if (
          msgData.swipes &&
          Array.isArray(msgData.swipes) &&
          msgData.swipe_id !== undefined
        ) {
          content = msgData.swipes[msgData.swipe_id] || content;
        }

        content = content
          .replace(/\{\{user\}\}/gi, userName)
          .replace(/<user>/gi, userName);

        let createdAt = Date.now();
        if (msgData.send_date) {
          const parsed = Date.parse(msgData.send_date);
          if (!isNaN(parsed)) createdAt = parsed;
        }

        const message: ChatMessage = {
          id: crypto.randomUUID(),
          sender,
          name,
          content,
          is_user: isUser,
          status: "sent",
          createdAt,
          updatedAt: createdAt,
        };

        if (
          msgData.swipes &&
          Array.isArray(msgData.swipes) &&
          msgData.swipes.length > 1
        ) {
          message.swipes = msgData.swipes.map((s: string) =>
            s.replace(/\{\{user\}\}/gi, userName).replace(/<user>/gi, userName),
          );
          message.swipeId = msgData.swipe_id ?? 0;
        }

        if (msgData.extra?.model) {
          message.model = msgData.extra.model;
        }
        if (msgData.extra?.token_count) {
          message.tokenCount = msgData.extra.token_count;
        }

        messages.push(message);
      }

      if (messages.length === 0) {
        return { success: false, error: "JSONL 中沒有可匯入的訊息" };
      }

      // 獲取目標聊天
      const chat = await db.get<Chat>(DB_STORES.CHATS, targetChatId);
      if (!chat) {
        return { success: false, error: "找不到目標聊天" };
      }

      // 清空現有訊息並刪除舊圖片
      if (chat.messages && chat.messages.length > 0) {
        const oldMessages = await restoreImagesToMessages(chat.messages);
        const imageRefs = collectImageRefs(oldMessages);
        await deleteChatImagesByRefs(imageRefs);
      }

      // 替換為新訊息
      chat.messages = messages;

      // 匯入 variables
      if (metadata.chat_metadata?.variables) {
        if (!chat.metadata.variables) {
          chat.metadata.variables = {};
        }
        chat.metadata.variables = { ...metadata.chat_metadata.variables };
      }

      // 保存（圖片分離）
      const msgsForStorage = await extractImagesFromMessages(chat.messages);
      chat.messages = msgsForStorage;
      chat.lastMessagePreview =
        messages[messages.length - 1]?.content?.slice(0, 100) || "";
      chat.messageCount = messages.length;
      chat.updatedAt = Date.now();
      await db.put(DB_STORES.CHATS, chat);

      return { success: true, messageCount: messages.length };
    } catch (e) {
      console.error(
        "[ImportExportService] Failed to replace chat from JSONL:",
        e,
      );
      return { success: false, error: String(e) };
    }
  }

  /**
   * 從 SillyTavern JSONL 檔案建立新聊天
   * 需要指定目標角色 ID
   */
  async createChatFromJsonl(
    file: File,
    characterId: string,
  ): Promise<{
    success: boolean;
    chat?: Chat;
    messageCount?: number;
    error?: string;
  }> {
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());

      if (lines.length < 2) {
        return { success: false, error: "JSONL 檔案內容不足" };
      }

      let metadata: any;
      try {
        metadata = JSON.parse(lines[0]);
      } catch {
        return { success: false, error: "無法解析 JSONL metadata" };
      }

      const characterName = metadata.character_name || metadata.name || "角色";
      const userName = metadata.user_name || "User";

      // 建立新聊天
      const chat: Chat = {
        id: crypto.randomUUID(),
        name: `${characterName} (JSONL 匯入)`,
        characterId,
        messages: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 解析訊息
      for (let i = 1; i < lines.length; i++) {
        let msgData: any;
        try {
          msgData = JSON.parse(lines[i]);
        } catch {
          continue;
        }

        if (msgData.is_system) continue;

        const isUser = !!msgData.is_user;
        const sender: MessageSender = isUser ? "user" : "assistant";
        const name = isUser ? userName : msgData.name || characterName;

        let content = msgData.mes || "";
        if (
          msgData.swipes &&
          Array.isArray(msgData.swipes) &&
          msgData.swipe_id !== undefined
        ) {
          content = msgData.swipes[msgData.swipe_id] || content;
        }
        content = content
          .replace(/\{\{user\}\}/gi, userName)
          .replace(/<user>/gi, userName);

        let createdAt = Date.now();
        if (msgData.send_date) {
          const parsed = Date.parse(msgData.send_date);
          if (!isNaN(parsed)) createdAt = parsed;
        }

        const message: ChatMessage = {
          id: crypto.randomUUID(),
          sender,
          name,
          content,
          is_user: isUser,
          status: "sent",
          createdAt,
          updatedAt: createdAt,
        };

        if (
          msgData.swipes &&
          Array.isArray(msgData.swipes) &&
          msgData.swipes.length > 1
        ) {
          message.swipes = msgData.swipes.map((s: string) =>
            s.replace(/\{\{user\}\}/gi, userName).replace(/<user>/gi, userName),
          );
          message.swipeId = msgData.swipe_id ?? 0;
        }

        if (msgData.extra?.model) {
          message.model = msgData.extra.model;
        }
        if (msgData.extra?.token_count) {
          message.tokenCount = msgData.extra.token_count;
        }

        chat.messages.push(message);
      }

      if (chat.messages.length === 0) {
        return { success: false, error: "JSONL 中沒有可匯入的訊息" };
      }

      // 匯入 variables
      if (metadata.chat_metadata?.variables) {
        chat.metadata.variables = { ...metadata.chat_metadata.variables };
      }

      // 保存（分塊儲存，圖片分離）
      const messagesToSave = [...chat.messages];
      chat.lastMessagePreview =
        messagesToSave[messagesToSave.length - 1]?.content?.slice(0, 100) || "";
      chat.messageCount = messagesToSave.length;
      const msgsForStorage2 = await extractImagesFromMessages(messagesToSave);
      chat.messages = msgsForStorage2;
      await db.put(DB_STORES.CHATS, chat);

      return { success: true, chat, messageCount: messagesToSave.length };
    } catch (e) {
      console.error(
        "[ImportExportService] Failed to create chat from JSONL:",
        e,
      );
      return { success: false, error: String(e) };
    }
  }
}

// 全局單例
let importExportService: ImportExportService | null = null;

/**
 * 獲取導入導出服務實例
 */
export function getImportExportService(): ImportExportService {
  if (!importExportService) {
    importExportService = new ImportExportService();
  }
  return importExportService;
}

/**
 * 將 Lorebook 轉換為 CharacterBook（可供外部使用）
 */
export function convertLorebookToCharacterBook(
  lorebook: Lorebook,
): CharacterBook {
  const entries: CharacterBookEntry[] = lorebook.entries.map((entry) => ({
    id: entry.uid,
    keys: entry.key,
    secondary_keys: entry.keysecondary,
    comment: entry.comment,
    content: entry.content,
    constant: entry.constant,
    selective: entry.selective,
    insertion_order: entry.order,
    enabled: !entry.disable,
    position:
      entry.position === WorldInfoPosition.AFTER_CHAR
        ? "after_char"
        : "before_char",
    use_regex: false,
    extensions: {
      position: entry.position,
      exclude_recursion: entry.excludeRecursion,
      probability: entry.probability,
      useProbability: entry.useProbability,
      depth: entry.depth,
      selectiveLogic: entry.selectiveLogic,
      group: entry.group,
      group_override: entry.groupOverride,
      group_weight: entry.groupWeight,
      prevent_recursion: entry.preventRecursion,
      delay_until_recursion: entry.delayUntilRecursion > 0,
      scan_depth: entry.scanDepth,
      match_whole_words: entry.matchWholeWords,
      use_group_scoring: entry.useGroupScoring,
      case_sensitive: entry.caseSensitive,
      automation_id: entry.automationId,
      role: entry.role ?? 0,
      vectorized: entry.vectorized,
    },
  }));

  return {
    name: lorebook.name,
    description: lorebook.description,
    scan_depth: lorebook.scanDepth,
    token_budget: lorebook.tokenBudget,
    recursive_scanning: lorebook.recursiveScanning,
    entries,
  };
}
