/**
 * 導入備份（ZIP / JSON，含分包）。從舊 SettingsScreen 原樣搬出來，
 * 「備份與還原」頁的導入按鈕和 GitHub 還原都走這裡。
 */
import { db } from "@/db/database";
import { extractImagesFromMessages } from "@/db/operations";
import {
  getBackupGroupFilename,
  getBackupPartIndexFromFilename,
} from "@/services/AutoBackupService";
import { getLegacyBackupService } from "@/services/LegacyBackupService";
import { saveMessages, upsertMessages } from "@/storage/chatMessageStorage";
import { refreshChatDerivedMetadata, saveChatMetadata } from "@/storage/chatStorage";
import {
  useCharactersStore,
  useLorebooksStore,
  useSettingsStore,
  useUserStore,
} from "@/stores";
import { useThemeStore } from "@/stores/theme";
import { createDefaultCharacterData, type StoredCharacter } from "@/types/character";
import { ref } from "vue";

export function useBackupImport() {
  const settingsStore = useSettingsStore();
  const charactersStore = useCharactersStore();
  const lorebooksStore = useLorebooksStore();
  const userStore = useUserStore();
  const themeStore = useThemeStore();

  const isImporting = ref(false);
  /** 多檔導入時的進度文字 */
  const importProgress = ref("");
  let importWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

  function clearImportWatchdog() {
    if (importWatchdogTimer) {
      clearTimeout(importWatchdogTimer);
      importWatchdogTimer = null;
    }
  }

  function startImportWatchdog(input: HTMLInputElement) {
    clearImportWatchdog();
    importWatchdogTimer = setTimeout(() => {
      if (!isImporting.value) return;
      console.error("[Import] 導入逾時，已自動解除導入狀態");
      isImporting.value = false;
      input.value = "";
      alert("導入逾時，已停止等待。原本資料不會因此被清除，請重新整理後再試一次。");
    }, 5 * 60 * 1000);
  }

  // 還原單個聊天的媒體路徑為 base64（桌布 + 訊息圖片）
  function restoreChatMedia(
    chat: any,
    mediaFiles: Record<string, Uint8Array>,
  ): void {
    // 還原聊天桌布
    if (
      chat.appearance?.wallpaper?.type === "image" &&
      chat.appearance.wallpaper.value &&
      !chat.appearance.wallpaper.value.startsWith("data:") &&
      mediaFiles[chat.appearance.wallpaper.value]
    ) {
      const mimeType = getMimeTypeFromFilename(chat.appearance.wallpaper.value);
      chat.appearance.wallpaper.value = uint8ArrayToDataUrl(
        mediaFiles[chat.appearance.wallpaper.value],
        mimeType,
      );
    }
    // 還原訊息圖片
    if (chat.messages && Array.isArray(chat.messages)) {
      for (const msg of chat.messages) {
        if (
          msg.imageUrl &&
          !msg.imageUrl.startsWith("data:") &&
          !msg.imageUrl.startsWith("http") &&
          mediaFiles[msg.imageUrl]
        ) {
          const mimeType = getMimeTypeFromFilename(msg.imageUrl);
          msg.imageUrl = uint8ArrayToDataUrl(mediaFiles[msg.imageUrl], mimeType);
        }
        if (
          msg.imageData &&
          !msg.imageData.startsWith("data:") &&
          !msg.imageData.startsWith("http") &&
          mediaFiles[msg.imageData]
        ) {
          msg.imageData = uint8ArrayToBase64(mediaFiles[msg.imageData]);
        }
      }
    }

    if (typeof chat.charAvatarOverride === "string") {
      restoreMediaPathsInValue(chat, "charAvatarOverride", mediaFiles);
    }
    if (typeof chat.userAvatarOverride === "string") {
      restoreMediaPathsInValue(chat, "userAvatarOverride", mediaFiles);
    }
    if (Array.isArray(chat.coupleAvatarLibrary)) {
      restoreMediaPathsInValue(chat, "coupleAvatarLibrary", mediaFiles);
    }
  }

  // 從檔名推斷 MIME 類型
  function getMimeTypeFromFilename(filename: string): string {
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

  // 將 Uint8Array 轉換為 DataURL
  function uint8ArrayToDataUrl(data: Uint8Array, mimeType: string): string {
    let binary = "";
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
  }

  function uint8ArrayToBase64(data: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  function getFallbackCharacterNameFromChat(chat: any): string {
    const rawName = String(
      chat?.name || chat?.title || chat?.characterName || "",
    ).trim();
    if (rawName.startsWith("Chat with ")) {
      return rawName.slice("Chat with ".length).trim() || "未命名角色";
    }
    return rawName || "未命名角色";
  }

  async function ensureCharacterForImportedChat(
    chat: any,
    knownCharacterIds: Set<string>,
  ): Promise<boolean> {
    if (!chat?.characterId || chat.isGroupChat) return false;
    if (knownCharacterIds.has(chat.characterId)) return false;

    const existing = await db.get<StoredCharacter>("characters", chat.characterId);
    if (existing) {
      knownCharacterIds.add(chat.characterId);
      return false;
    }

    const name = getFallbackCharacterNameFromChat(chat);
    const now = Date.now();
    const systemPrompt = String(chat.systemPromptOverride || "");
    const character: StoredCharacter = {
      id: chat.characterId,
      nickname: name,
      avatar:
        typeof chat.charAvatarOverride === "string" ? chat.charAvatarOverride : "",
      data: {
        ...createDefaultCharacterData(),
        name,
        description: systemPrompt.slice(0, 500),
        first_mes: `你好，我是${name}。`,
        system_prompt: systemPrompt,
      },
      lorebookIds: [],
      source: "import",
      createdAt: typeof chat.createdAt === "number" ? chat.createdAt : now,
      updatedAt: typeof chat.updatedAt === "number" ? chat.updatedAt : now,
    };

    await db.put("characters", character);
    knownCharacterIds.add(chat.characterId);
    return true;
  }

  function splitZipEntryName(name: string): string[] {
    return name.replace(/\\/g, "/").split("/").filter(Boolean);
  }

  function getZipEntryBaseName(name: string): string {
    const parts = splitZipEntryName(name);
    return parts[parts.length - 1]?.toLowerCase() || "";
  }

  function getZipEntryRelativeToFolder(
    name: string,
    folderName: string,
  ): string | null {
    const parts = splitZipEntryName(name);
    const index = parts.findIndex((part) => part.toLowerCase() === folderName);
    return index >= 0 ? parts.slice(index).join("/") : null;
  }

  function findBackupJsonEntry(
    files: Record<string, Uint8Array>,
  ): [string, Uint8Array] | undefined {
    return Object.entries(files).find(([name]) => {
      const baseName = getZipEntryBaseName(name);
      return baseName === "backup.json" || baseName === "data.json";
    });
  }

  function getZipChatJsonEntries(
    files: Record<string, Uint8Array>,
  ): Array<[string, Uint8Array]> {
    return Object.entries(files)
      .map(([name, content]) => {
        const relativeName = getZipEntryRelativeToFolder(name, "chats");
        return relativeName ? [relativeName, content] as [string, Uint8Array] : null;
      })
      .filter(
        (entry): entry is [string, Uint8Array] =>
          !!entry && entry[0].toLowerCase().endsWith(".json"),
      );
  }

  /** 分包備份的聊天續段：chat-segments/<chatId>.<n>.json，依段號排序 */
  function getZipChatSegmentEntries(
    files: Record<string, Uint8Array>,
  ): Array<[string, Uint8Array]> {
    return Object.entries(files)
      .map(([name, content]) => {
        const relativeName = getZipEntryRelativeToFolder(name, "chat-segments");
        return relativeName ? [relativeName, content] as [string, Uint8Array] : null;
      })
      .filter(
        (entry): entry is [string, Uint8Array] =>
          !!entry && entry[0].toLowerCase().endsWith(".json"),
      )
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }

  function collectZipMediaFiles(
    files: Record<string, Uint8Array>,
  ): Record<string, Uint8Array> {
    const result: Record<string, Uint8Array> = {};
    for (const [filename, content] of Object.entries(files)) {
      const mediaName = getZipEntryRelativeToFolder(filename, "media");
      if (mediaName) {
        result[mediaName] = content;
      }
    }
    return result;
  }

  /**
   * 遞迴掃描 obj[key] 中所有字串值，將 media/ 路徑還原為 base64 DataURL。
   * 與 backupMediaExtractor 的 scanAndReplaceBase64InValue 互為逆操作。
   */
  function restoreMediaPathsInValue(
    obj: any,
    key: string | number,
    mediaFiles: Record<string, Uint8Array>,
  ): void {
    const val = obj[key];
    if (val === null || val === undefined) return;

    if (typeof val === "string") {
      if (val.startsWith("media/") && mediaFiles[val]) {
        const mimeType = getMimeTypeFromFilename(val);
        obj[key] = uint8ArrayToDataUrl(mediaFiles[val], mimeType);
      }
      return;
    }

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        restoreMediaPathsInValue(val, i, mediaFiles);
      }
      return;
    }

    if (typeof val === "object") {
      for (const k of Object.keys(val)) {
        restoreMediaPathsInValue(val, k, mediaFiles);
      }
    }
  }

  // 多檔導入時跨檔共用的狀態
  interface ImportSession {
    importedCharacterIds: Set<string>;
    /** 已導入過續段（chat-segments/）的聊天：本體晚到時不能再整個覆蓋 */
    segmentedChatIds: Set<string>;
  }

  type ImportFileResult =
    | { kind: "legacy"; message: string }
    | {
        kind: "backup";
        stats: Record<string, number>;
        /** 分包資訊（metadata.json）；舊版單檔備份沒有 */
        part?: { backupId: string; partIndex: number; totalParts?: number };
      };

  /** 導入一個備份檔案（.zip 或 .json）。UI 狀態、提示與重新整理由呼叫端處理 */
  async function importBackupFile(
    file: File,
    session: ImportSession,
  ): Promise<ImportFileResult> {
    const fileName = file.name.toLowerCase();

    let data: any;
    let mediaFiles: Record<string, Uint8Array> = {};
    let backupPart: { backupId: string; partIndex: number; totalParts?: number } | undefined;
    let segmentFileEntries: Array<[string, Uint8Array]> = [];

    // 檢查檔案類型
    if (fileName.endsWith(".zip")) {
      // 讀取檔案內容
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // 檢查 ZIP magic bytes (PK: 0x50 0x4B)
      const isRealZip =
        bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

      if (!isRealZip) {
        // 檔案副檔名是 .zip 但實際不是 ZIP — 嘗試當 JSON 解析
        console.warn(
          "[Import] 檔案非有效 ZIP（magic bytes 不符），嘗試當 JSON 解析",
        );
        try {
          const text = new TextDecoder().decode(bytes);
          data = JSON.parse(text);
        } catch {
          throw new Error("檔案既不是有效的 ZIP 也不是有效的 JSON，可能已損壞");
        }
      } else {
        // 真正的 ZIP — 先嘗試 fflate，失敗則 fallback 到 jszip
        let files: Record<string, Uint8Array>;
        let unzipper = "fflate";

        try {
          const { unzip } = await import("fflate");
          files = await new Promise<Record<string, Uint8Array>>(
            (resolve, reject) => {
              unzip(bytes, (err, d) => {
                if (err) reject(err);
                else resolve(d);
              });
            },
          );
        } catch (fflateErr) {
          unzipper = "jszip";
          console.warn("[Import] fflate 解壓失敗，嘗試 jszip:", fflateErr);
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(arrayBuffer);
          files = {};
          for (const [name, entry] of Object.entries(zip.files)) {
            if (!entry.dir) {
              files[name] = await entry.async("uint8array");
            }
          }
        }

        const { strFromU8 } = await import("fflate");
        const fileEntries = Object.entries(files);
        const zipEntryNames = fileEntries.map(([name]) => name);

        // 分包資訊：新版備份每包都有 metadata.json
        const metadataEntry = fileEntries.find(
          ([name]) => getZipEntryBaseName(name) === "metadata.json",
        );
        let metadata: any = null;
        if (metadataEntry) {
          try {
            metadata = JSON.parse(strFromU8(metadataEntry[1]));
          } catch {
            /* metadata 只是附加資訊，壞掉不影響導入 */
          }
        }
        if (metadata?.backupId && typeof metadata.partIndex === "number") {
          backupPart = {
            backupId: String(metadata.backupId),
            partIndex: metadata.partIndex,
            totalParts:
              typeof metadata.totalParts === "number" ? metadata.totalParts : undefined,
          };
        }

        const chatFileEntries = getZipChatJsonEntries(files);
        segmentFileEntries = getZipChatSegmentEntries(files);

        // 檢查必要檔案（相容 backup.json 和 data.json 兩種命名）。
        // 分包備份只有第 1 包有 backup.json，後續分包只裝聊天。
        const backupEntry = findBackupJsonEntry(files);
        if (backupEntry) {
          data = JSON.parse(strFromU8(backupEntry[1]));
        } else if (
          backupPart &&
          (chatFileEntries.length > 0 || segmentFileEntries.length > 0)
        ) {
          data = {
            version: 1,
            exportedAt: metadata.exportedAt || "unknown",
            chats: [],
          };
        } else {
          console.error("[Import] ZIP 解包條目:", zipEntryNames);
          throw new Error("ZIP 中找不到 backup.json 或 data.json");
        }

        // 收集媒體檔案
        mediaFiles = collectZipMediaFiles(files);

        console.info("[Import] ZIP 解包診斷", {
          unzipper,
          entryCount: fileEntries.length,
          backupJsonName: backupEntry?.[0] ?? null,
          backupJsonBytes: backupEntry?.[1].byteLength ?? 0,
          part: backupPart ?? null,
          segmentFiles: segmentFileEntries.length,
          characters: Array.isArray(data.characters) ? data.characters.length : null,
          inlineChats: Array.isArray(data.chats) ? data.chats.length : null,
          chatFiles: chatFileEntries.length,
          mediaFiles: Object.keys(mediaFiles).length,
          sampleEntries: zipEntryNames.slice(0, 20),
        });

        // 相容新版流式備份格式：聊天存在 chats/*.json 中
        // 不再一次性解析所有聊天到 data.chats，改為保留原始 Uint8Array 引用
        // 在導入階段逐個解析、還原、寫入 IDB，降低記憶體峰值
        if (
          !data.chats ||
          !Array.isArray(data.chats) ||
          data.chats.length === 0
        ) {
          if (chatFileEntries.length > 0) {
            // 保留原始 bytes 引用，不立即解析
            (data as any)._pendingChatFiles = chatFileEntries;
            data.chats = []; // 佔位，後續逐個處理
            console.log(
              `[Import] 偵測到 ${chatFileEntries.length} 個流式聊天檔案，將逐個處理`,
            );
          }
        }

        // 釋放不再需要的 ZIP 條目（非 media/、非 chats/、非 backup.json）
        for (const key of Object.keys(files)) {
          const baseName = getZipEntryBaseName(key);
          if (
            !getZipEntryRelativeToFolder(key, "media") &&
            !getZipEntryRelativeToFolder(key, "chats") &&
            !getZipEntryRelativeToFolder(key, "chat-segments") &&
            baseName !== "backup.json" &&
            baseName !== "data.json" &&
            baseName !== "metadata.json"
          ) {
            delete files[key];
          }
        }
      }
    } else {
      // JSON 格式
      const text = await file.text();
      data = JSON.parse(text);

      // 檢測是否為舊版備份格式（v1 版本，有 data.chats 結構）
      if (data.version === 1 && data.data && data.data.chats) {
        // 使用舊版備份恢復服務
        const legacyService = getLegacyBackupService();
        const result = await legacyService.restoreFromFile(file);

        if (result.success) {
          const stats = [
            `聊天: ${result.stats.chats}`,
            `角色: ${result.stats.characters}`,
            `世界書: ${result.stats.lorebooks}`,
            `總結: ${result.stats.summaries}`,
            `貼文: ${result.stats.posts}`,
            `貼圖分類: ${result.stats.stickers}`,
            `重要事件: ${result.stats.importantEvents}`,
          ].join("\n");

          let message = `舊版備份恢復成功！\n${stats}`;
          if (result.warnings.length > 0) {
            message += `\n\n警告:\n${result.warnings.slice(0, 5).join("\n")}`;
            if (result.warnings.length > 5) {
              message += `\n...還有 ${result.warnings.length - 5} 個警告`;
            }
          }
          return { kind: "legacy", message };
        }
        throw new Error(result.error || "舊版備份恢復失敗");
      }
    }

    if (!data.version || !data.exportedAt) {
      throw new Error("無效的備份文件格式");
    }

    const importedCharacterIds = session.importedCharacterIds;
    let recoveredCharacterCount = 0;

    // 還原角色頭像
    if (data.characters && Array.isArray(data.characters)) {
      for (const char of data.characters) {
        if (
          char.avatar &&
          !char.avatar.startsWith("data:") &&
          mediaFiles[char.avatar]
        ) {
          const mimeType = getMimeTypeFromFilename(char.avatar);
          char.avatar = uint8ArrayToDataUrl(mediaFiles[char.avatar], mimeType);
        }
      }
    }

    // 還原聊天中的圖片
    if (data.chats && Array.isArray(data.chats)) {
      for (const chat of data.chats) {
        restoreChatMedia(chat, mediaFiles);
      }
    }

    // 導入角色
    if (data.characters && Array.isArray(data.characters)) {
      for (const char of data.characters) {
        await db.put("characters", char);
        if (char?.id) importedCharacterIds.add(char.id);
      }
    }

    // 導入世界書
    if (data.lorebooks && Array.isArray(data.lorebooks)) {
      for (const book of data.lorebooks) {
        await db.put("lorebooks", book);
      }
    }

    // 導入聊天（圖片分離儲存）
    // 逐個處理流式備份的聊天檔案，避免一次性載入所有聊天到記憶體
    let importedChatCount = 0;
    const pendingChatFiles: Array<[string, Uint8Array]> | undefined = (
      data as any
    )._pendingChatFiles;
    if (pendingChatFiles && pendingChatFiles.length > 0) {
      const { strFromU8 } = await import("fflate");
      for (let ci = 0; ci < pendingChatFiles.length; ci++) {
        let chatFileName = "";
        try {
          const [currentChatFileName, content] = pendingChatFiles[ci];
          chatFileName = currentChatFileName;
          const chat = JSON.parse(strFromU8(content));
          // 釋放原始 bytes
          pendingChatFiles[ci] = null as any;
          // 還原媒體
          restoreChatMedia(chat, mediaFiles);
          if (await ensureCharacterForImportedChat(chat, importedCharacterIds)) {
            recoveredCharacterCount++;
          }
          // v24：訊息分離儲存
          const messagesToSave = chat.messages || [];
          if (messagesToSave.length > 0) {
            const msgsForStorage = await extractImagesFromMessages(messagesToSave);
            if (session.segmentedChatIds.has(chat.id)) {
              // 同一批導入裡這個聊天的續段先到了（檔案順序亂了）：
              // 整個覆蓋會把續段的訊息刪掉，只能合併
              await upsertMessages(chat.id, msgsForStorage);
            } else {
              await saveMessages(chat.id, msgsForStorage);
            }
          }
          chat.messages = [];
          await saveChatMetadata(chat as any);
          await refreshChatDerivedMetadata(chat.id);
          importedChatCount++;
        } catch (parseErr) {
          console.error("[Import] 聊天檔案導入失敗:", parseErr);
          throw new Error(
            `聊天檔案 ${chatFileName || "未知"} 導入失敗: ${
              parseErr instanceof Error ? parseErr.message : String(parseErr)
            }`,
          );
        }
      }
      delete (data as any)._pendingChatFiles;
    }

    // 分包備份：巨大聊天被切開後，放在後續分包 chat-segments/ 的訊息。
    // 只合併訊息，不動聊天本體（本體在較前面的分包，已經導入過）
    let importedSegmentCount = 0;
    if (segmentFileEntries.length > 0) {
      const { strFromU8 } = await import("fflate");
      for (let si = 0; si < segmentFileEntries.length; si++) {
        const [segmentName, content] = segmentFileEntries[si];
        // 釋放原始 bytes
        segmentFileEntries[si] = null as any;
        try {
          const segment = JSON.parse(strFromU8(content));
          if (!segment?.id) continue;
          restoreChatMedia(segment, mediaFiles);
          const messagesToSave = segment.messages || [];
          if (messagesToSave.length > 0) {
            const msgsForStorage = await extractImagesFromMessages(messagesToSave);
            await upsertMessages(segment.id, msgsForStorage);
          }
          session.segmentedChatIds.add(segment.id);
          await refreshChatDerivedMetadata(segment.id);
          importedSegmentCount++;
        } catch (segmentErr) {
          console.error("[Import] 聊天續段導入失敗:", segmentErr);
          throw new Error(
            `聊天續段 ${segmentName} 導入失敗: ${
              segmentErr instanceof Error ? segmentErr.message : String(segmentErr)
            }`,
          );
        }
      }
    }

    if (data.chats && Array.isArray(data.chats)) {
      for (const chat of data.chats) {
        if (await ensureCharacterForImportedChat(chat, importedCharacterIds)) {
          recoveredCharacterCount++;
        }
        const messagesToSave = chat.messages || [];
        // v24：圖片分離 + 訊息分離儲存
        if (messagesToSave.length > 0) {
          const msgsForStorage = await extractImagesFromMessages(messagesToSave);
          await saveMessages(chat.id, msgsForStorage);
        }
        chat.messages = [];
        await saveChatMetadata(chat as any);
        await refreshChatDerivedMetadata(chat.id);
        importedChatCount++;
      }
    }

    // 導入設定
    if (data.settings) {
      // 還原自訂鈴聲音檔
      const s = data.settings as any;
      const ringtoneRef = s?.incomingCallRingtone?.customAudioDataUrl;
      if (
        typeof ringtoneRef === "string" &&
        ringtoneRef.startsWith("media/") &&
        mediaFiles[ringtoneRef]
      ) {
        const ext = ringtoneRef.split(".").pop()?.toLowerCase() || "bin";
        const mimeMap: Record<string, string> = {
          mp3: "audio/mpeg",
          wav: "audio/wav",
          ogg: "audio/ogg",
          webm: "audio/webm",
          m4a: "audio/mp4",
          aac: "audio/aac",
        };
        const mimeType = mimeMap[ext] || "audio/mpeg";
        s.incomingCallRingtone.customAudioDataUrl = uint8ArrayToDataUrl(
          mediaFiles[ringtoneRef],
          mimeType,
        );
      }
      await db.put("appSettings", {
        ...data.settings,
        id: data.settings.id || "main-settings",
      });
    }

    // 導入使用者角色資料
    if (data.userData) {
      // 還原使用者角色頭像
      if (data.userData.personas && Array.isArray(data.userData.personas)) {
        for (const persona of data.userData.personas) {
          if (
            persona.avatar &&
            !persona.avatar.startsWith("data:") &&
            mediaFiles[persona.avatar]
          ) {
            const mimeType = getMimeTypeFromFilename(persona.avatar);
            persona.avatar = uint8ArrayToDataUrl(
              mediaFiles[persona.avatar],
              mimeType,
            );
          }
        }
      }
      await db.put("appSettings", {
        ...data.userData,
        id: data.userData.id || "user-data",
      });
    }

    // 導入主題（還原桌布圖片）
    if (data.themes && Array.isArray(data.themes)) {
      for (const theme of data.themes) {
        if (
          theme.wallpaperStyle?.type === "image" &&
          theme.wallpaperStyle.value &&
          !theme.wallpaperStyle.value.startsWith("data:") &&
          mediaFiles[theme.wallpaperStyle.value]
        ) {
          const mimeType = getMimeTypeFromFilename(theme.wallpaperStyle.value);
          theme.wallpaperStyle.value = uint8ArrayToDataUrl(
            mediaFiles[theme.wallpaperStyle.value],
            mimeType,
          );
        }
        await db.put("themes", theme);
      }
    }

    // 導入佈局
    if (data.layouts && Array.isArray(data.layouts)) {
      for (const layout of data.layouts) {
        await db.put("layouts", layout);
      }
    }

    // 導入角色好感度配置
    if (data.characterAffections && Array.isArray(data.characterAffections)) {
      for (const affection of data.characterAffections) {
        await db.put("characterAffections", affection);
      }
    }

    // 導入聊天好感度狀態
    if (data.chatAffinityStates && Array.isArray(data.chatAffinityStates)) {
      for (const state of data.chatAffinityStates) {
        await db.put("chatAffinityStates", state);
      }
    }

    // 導入舊版 settings（key-value 格式，還原媒體路徑為 base64）
    if (data.oldSettings && Array.isArray(data.oldSettings)) {
      for (const item of data.oldSettings) {
        if (item.key && item.value !== undefined) {
          restoreMediaPathsInValue(item, "value", mediaFiles);
          await db.put("settings", item.value, item.key);
        }
      }
    }

    // 導入使用者自訂提示詞庫
    if (data.promptLibrary && Array.isArray(data.promptLibrary)) {
      for (const item of data.promptLibrary) {
        if (item.key && item.value !== undefined) {
          await db.put("promptLibrary", item.value, item.key);
        }
      }
    }

    // 導入待處理來電
    if (data.pendingCalls && Array.isArray(data.pendingCalls)) {
      for (const call of data.pendingCalls) {
        await db.put("pendingCalls", call);
      }
    }

    // 導入總結
    if (data.summaries && Array.isArray(data.summaries)) {
      for (const summary of data.summaries) {
        await db.put("summaries", summary);
      }
    }

    // 導入日記
    if (data.diaries && Array.isArray(data.diaries)) {
      for (const diary of data.diaries) {
        await db.put("diaries", diary);
      }
    }

    // 導入重要事件
    if (data.importantEvents && Array.isArray(data.importantEvents)) {
      for (const event of data.importantEvents) {
        await db.put("importantEvents", event);
      }
    }

    // 導入噗浪貼文（還原媒體路徑為 base64）
    if (data.qzonePosts && Array.isArray(data.qzonePosts)) {
      for (const post of data.qzonePosts) {
        // 還原作者頭像
        if (
          post.avatar &&
          !post.avatar.startsWith("data:") &&
          mediaFiles[post.avatar]
        ) {
          post.avatar = uint8ArrayToDataUrl(
            mediaFiles[post.avatar],
            getMimeTypeFromFilename(post.avatar),
          );
        }
        // 還原貼文圖片
        if (Array.isArray(post.images)) {
          for (let j = 0; j < post.images.length; j++) {
            const img = post.images[j];
            if (
              typeof img === "string" &&
              !img.startsWith("data:") &&
              mediaFiles[img]
            ) {
              post.images[j] = uint8ArrayToDataUrl(
                mediaFiles[img],
                getMimeTypeFromFilename(img),
              );
            }
          }
        }
        // 還原留言頭像
        if (Array.isArray(post.comments)) {
          for (const comment of post.comments) {
            if (
              comment.avatar &&
              !comment.avatar.startsWith("data:") &&
              mediaFiles[comment.avatar]
            ) {
              comment.avatar = uint8ArrayToDataUrl(
                mediaFiles[comment.avatar],
                getMimeTypeFromFilename(comment.avatar),
              );
            }
          }
        }
        await db.put("qzonePosts", post);
      }
    }

    // 導入貼圖（還原媒體路徑為 base64）
    if (data.stickers && Array.isArray(data.stickers)) {
      for (const sticker of data.stickers) {
        if (Array.isArray(sticker.stickers)) {
          for (const s of sticker.stickers) {
            if (
              typeof s.url === "string" &&
              !s.url.startsWith("data:") &&
              mediaFiles[s.url]
            ) {
              s.url = uint8ArrayToDataUrl(
                mediaFiles[s.url],
                getMimeTypeFromFilename(s.url),
              );
            }
          }
        }
        await db.put("stickers", sticker);
      }
    }

    // 導入通話記錄
    if (data.callHistory && Array.isArray(data.callHistory)) {
      for (const entry of data.callHistory) {
        await db.put("callHistory", entry);
      }
    }

    // 導入節日觸發記錄
    if (data.holidayRecords && Array.isArray(data.holidayRecords)) {
      for (const record of data.holidayRecords) {
        await db.put("holidayRecords", record);
      }
    }

    // 導入行事曆事件
    if (data.calendarEvents && Array.isArray(data.calendarEvents)) {
      for (const event of data.calendarEvents) {
        await db.put("calendarEvents", event);
      }
    }

    // 導入遊戲狀態（gameStates 沒有 keyPath，需要用 key 寫入，還原媒體路徑）
    if (data.gameStates && Array.isArray(data.gameStates)) {
      for (const item of data.gameStates) {
        if (item.key && item.value) {
          // 新格式：{ key, value } 對
          restoreMediaPathsInValue(item, "value", mediaFiles);
          await db.put("gameStates", item.value, item.key);
        } else if (item.chatId) {
          // 舊格式相容：直接是 gameState 物件，用 chatId 當 key
          await db.put("gameStates", item, item.chatId);
        }
      }
    }

    // 導入自定義渲染規則
    if (data.rendererRules && Array.isArray(data.rendererRules)) {
      for (const rule of data.rendererRules) {
        await db.put("rendererRules", rule);
      }
    }

    // 導入書籍
    if (data.books && Array.isArray(data.books)) {
      for (const book of data.books) {
        await db.put("books", book);
      }
    }

    // 導入閱讀進度
    if (data.bookProgress && Array.isArray(data.bookProgress)) {
      for (const progress of data.bookProgress) {
        await db.put("bookProgress", progress);
      }
    }

    // 導入向量嵌入（普通陣列 → Float32Array）
    if (data.vectorEmbeddings && Array.isArray(data.vectorEmbeddings)) {
      for (const rec of data.vectorEmbeddings) {
        const restored = {
          ...rec,
          vector: rec.vector ? new Float32Array(rec.vector) : null,
        };
        await db.put("vectorEmbeddings", restored);
      }
    }

    // 導入 canvas layout（widget 佈局、app 圖標、日曆顏色等）到 Aguaphone_V2 IDB
    if (data.canvasLayout) {
      // 還原媒體路徑為 base64
      restoreMediaPathsInValue(data, "canvasLayout", mediaFiles);
      await new Promise<void>((resolve) => {
        const req = indexedDB.open("Aguaphone_V2", 1);
        req.onupgradeneeded = (e) => {
          const idb = (e.target as IDBOpenDBRequest).result;
          if (!idb.objectStoreNames.contains("canvas_layout")) {
            idb.createObjectStore("canvas_layout", { keyPath: "id" });
          }
        };
        req.onsuccess = (e) => {
          const idb = (e.target as IDBOpenDBRequest).result;
          const tx = idb.transaction(["canvas_layout"], "readwrite");
          const store = tx.objectStore("canvas_layout");
          store.put(data.canvasLayout);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      });
    }

    return {
      kind: "backup",
      stats: {
      "角色": data.characters?.length || 0,
      "世界書": data.lorebooks?.length || 0,
      "聊天": importedChatCount,
      "聊天續段": importedSegmentCount,
      "總結": data.summaries?.length || 0,
      "日記": data.diaries?.length || 0,
      "通話記錄": data.callHistory?.length || 0,
      "遊戲狀態": data.gameStates?.length || 0,
      "主題": data.themes?.length || 0,
      "佈局": data.layouts?.length || 0,
      "好感度配置": data.characterAffections?.length || 0,
      "好感度狀態": data.chatAffinityStates?.length || 0,
      "從聊天補回角色": recoveredCharacterCount,
      "使用者角色": data.userData?.personas?.length || 0,
      "渲染規則": data.rendererRules?.length || 0,
      "書籍": data.books?.length || 0,
      "閱讀進度": data.bookProgress?.length || 0,
      "自訂提示詞": data.promptLibrary?.length || 0,
      "向量嵌入": data.vectorEmbeddings?.length || 0,
      "媒體": Object.keys(mediaFiles).length,
      },
      part: backupPart,
    };
  }

  // 處理導入（可一次選多個檔案：分包備份要全部選取）
  async function handleFileImport(event: Event) {
    const target = event.target as HTMLInputElement;
    const selected = Array.from(target.files ?? []);
    if (selected.length === 0) return;

    // 前置檔案類型校驗（accept="*/*" 時用戶可能選到非備份檔案）
    if (selected.some((f) => !/\.(zip|json)$/i.test(f.name))) {
      alert("請選擇 .zip 或 .json 格式的備份檔案");
      target.value = "";
      return;
    }
    if (selected.length > 1 && selected.some((f) => /\.json$/i.test(f.name))) {
      alert("JSON 格式的備份請單獨導入；一次選取多個檔案只支援分包的 ZIP 備份");
      target.value = "";
      return;
    }

    // 分包依序導入：第 1 包（角色等基礎數據）先，聊天續段一定排在它的本體之後
    const files = [...selected].sort(
      (a, b) =>
        getBackupGroupFilename(a.name).localeCompare(getBackupGroupFilename(b.name)) ||
        getBackupPartIndexFromFilename(a.name) - getBackupPartIndexFromFilename(b.name),
    );

    isImporting.value = true;
    const session: ImportSession = {
      importedCharacterIds: new Set(),
      segmentedChatIds: new Set(),
    };
    const totals: Record<string, number> = {};
    const backups = new Map<string, { indices: Set<number>; totalParts?: number }>();
    let importedFileCount = 0;

    try {
      await db.init();

      for (const [i, file] of files.entries()) {
        // 每個檔案重新計時：分包多時整批導入一定會超過單檔的逾時
        startImportWatchdog(target);
        importProgress.value =
          files.length > 1 ? `導入中 ${i + 1}/${files.length}...` : "";

        let result: ImportFileResult;
        try {
          result = await importBackupFile(file, session);
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          if (files.length === 1) throw e;
          const done =
            importedFileCount > 0
              ? `\n\n前面 ${importedFileCount} 個檔案已導入完成，之後只需重新導入這個與後面的檔案`
              : "";
          throw new Error(`${file.name}：${reason}${done}`);
        }

        if (result.kind === "legacy") {
          alert(result.message + "\n\n即將重新整理頁面以套用變更...");
          await charactersStore.loadCharacters();
          await lorebooksStore.loadLorebooks();
          await settingsStore.loadSettings();
          location.reload();
          return;
        }

        for (const [key, value] of Object.entries(result.stats)) {
          totals[key] = (totals[key] ?? 0) + value;
        }
        if (result.part) {
          const info = backups.get(result.part.backupId) ?? { indices: new Set() };
          info.indices.add(result.part.partIndex);
          info.totalParts ??= result.part.totalParts;
          backups.set(result.part.backupId, info);
        }
        importedFileCount++;
      }

      // 分包沒選齊：資料還是導入了，但要讓使用者知道缺哪幾包
      const warnings: string[] = [];
      for (const info of backups.values()) {
        if (info.indices.size === 1 && info.totalParts === 1) continue;
        if (info.totalParts === undefined) {
          warnings.push("沒有選到這份備份的最後一部分，可能還有檔案沒導入");
          continue;
        }
        const missing: number[] = [];
        for (let k = 0; k < info.totalParts; k++) {
          if (!info.indices.has(k)) missing.push(k + 1);
        }
        if (missing.length > 0) {
          warnings.push(`這份備份缺少第 ${missing.join("、")} 部分`);
        }
      }

      const stats = Object.entries(totals)
        .filter(([key, value]) => key !== "聊天續段" || value > 0)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      const fileCount = files.length > 1 ? `（${files.length} 個檔案）` : "";
      const warningText = warnings.length
        ? `\n\n⚠ ${warnings.join("\n⚠ ")}\n（如果已經分開導入過可以忽略）`
        : "";

      alert(
        `導入成功！${fileCount}\n${stats}${warningText}\n\n即將重新整理頁面以套用變更...`,
      );

      // 刷新存儲狀態後重新載入頁面
      await charactersStore.loadCharacters();
      await lorebooksStore.loadLorebooks();
      await settingsStore.loadSettings();
      await userStore.loadUserData();
      await themeStore.loadFromStorage();
      location.reload();
    } catch (e) {
      console.error("導入失敗:", e);
      alert("導入失敗: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      clearImportWatchdog();
      isImporting.value = false;
      importProgress.value = "";
      target.value = "";
    }
  }


  return { isImporting, importProgress, handleFileImport, clearImportWatchdog };
}
