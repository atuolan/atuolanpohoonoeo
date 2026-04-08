/**
 * PeekPhonePromptBuilder
 * 建構各模塊組的 AI prompt，指示 AI 以 YAML 格式輸出角色手機內容
 */

/**
 * 建構角色資訊區塊（所有 prompt 共用）
 */
function buildCharacterBlock(
  charName: string,
  charDesc: string,
  personality: string,
  scenario: string,
  chatContext: string,
  userName: string,
  userDescription: string,
  worldInfo: string,
  summariesAndEvents: string,
): string {
  const lines = [
    `角色名稱: ${charName}`,
    `角色描述: ${charDesc}`,
    `性格: ${personality}`,
    `場景: ${scenario}`,
  ];
  
  if (userDescription) {
    lines.push(`用戶名稱: ${userName}`);
    lines.push(`用戶描述: ${userDescription}`);
  } else {
    lines.push(`用戶名稱: ${userName}`);
  }
  
  if (worldInfo) {
    lines.push("");
    lines.push(`世界觀設定:\n${worldInfo}`);
  }
  
  if (summariesAndEvents) {
    lines.push("");
    lines.push(summariesAndEvents);
  }
  
  lines.push("");
  lines.push(`近期聊天記錄（最近15輪對話）:\n${chatContext}`);
  lines.push(
    "",
    `重要：在生成的所有內容中，請直接使用「${userName}」來稱呼用戶，絕對不要使用 {{user}} 這個佔位符。`,
  );
  return lines.join("\n");
}

/**
 * 建構翻譯規則區塊（所有 prompt 共用）
 * 此區塊指示 AI：所有非中文的文字欄位都必須附上中文翻譯。
 */
function buildTranslationRule(): string {
  return `重要翻譯規則：如果角色的語言設定不是中文（例如日語、英語、韓語等），所有文字欄位的內容都必須使用以下格式：
先寫外語原文，然後換行寫中文翻譯（用實際換行，不要用任何標記）。
例如日語角色：
  今日は天気がいいね
  今天天氣真好呢
例如英語角色：
  How are you doing?
  你最近好嗎？
如果角色本身就是中文使用者，則直接用中文即可，不需要翻譯。
注意：包含換行的欄位值，請使用 YAML 的 | 語法（block scalar）。`;
}

/**
 * 建構 Group A (聊天) 的 prompt
 * 指示 AI 生成 2~5 個聊天對話串，每個包含角色自己和對方的訊息
 */
export function buildGroupAPrompt(
  charName: string,
  charDesc: string,
  personality: string,
  scenario: string,
  chatContext: string,
  userName: string = "使用者",
  userDescription: string = "",
  worldInfo: string = "",
  summariesAndEvents: string = "",
): string {
  const charBlock = buildCharacterBlock(
    charName,
    charDesc,
    personality,
    scenario,
    chatContext,
    userName,
    userDescription,
    worldInfo,
    summariesAndEvents,
  );

  return `你是一個角色扮演內容生成器。請根據以下角色資訊，生成該角色手機中的聊天紀錄。

${charBlock}

請生成 2 到 5 個聊天對話串，每個對話串包含一個虛構聯絡人與角色之間的對話。
每個對話串需包含角色自己發送的訊息（self: true）和對方發送的訊息（self: false）。
聊天內容必須符合角色的性格和當前故事背景。

${buildTranslationRule()}

【最重要的規則 —— 必須嚴格遵守】
所有聊天對話串中的「每一條」訊息，不論是哪個對話串、不論是角色自己發的（self: true）還是聯絡人發的（self: false），每一條 text 都必須包含「原文＋換行＋中文翻譯」。
不可以有任何一條訊息只有原文沒有翻譯。包含與「${userName}」的對話，也包含與其他所有聯絡人的對話，全部都要翻譯。
如果角色本身就是中文使用者，則直接用中文即可。

只輸出 YAML，不要加任何其他文字。

請嚴格使用以下 YAML 格式輸出（注意：每一條 text 都必須包含原文＋換行＋中文翻譯）：

chats:
  - contact: 聯絡人名稱
    messages:
      - from: 發送者名稱
        text: |
          Hey, are you free tonight?
          嘿，你今晚有空嗎？
        self: false
        time: 時間戳數字
      - from: 角色名
        text: |
          Yeah, what's up?
          嗯，怎麼了？
        self: true
        time: 時間戳數字
  - contact: 另一個聯絡人
    messages:
      - from: 另一個聯絡人名
        text: |
          Don't forget the meeting tomorrow.
          別忘了明天的會議。
        self: false
        time: 時間戳數字
      - from: 角色名
        text: |
          Got it, thanks for the reminder.
          收到，感謝提醒。
        self: true
        time: 時間戳數字`;
}

/**
 * 建構 Group B (行程+飲食+備忘錄) 的 prompt
 * 指示 AI 生成行程 3~8 項、飲食 1~5 項、備忘錄 2~6 項
 */
export function buildGroupBPrompt(
  charName: string,
  charDesc: string,
  personality: string,
  scenario: string,
  chatContext: string,
  userName: string = "使用者",
  userDescription: string = "",
  worldInfo: string = "",
  summariesAndEvents: string = "",
): string {
  const charBlock = buildCharacterBlock(
    charName,
    charDesc,
    personality,
    scenario,
    chatContext,
    userName,
    userDescription,
    worldInfo,
    summariesAndEvents,
  );

  return `你是一個角色扮演內容生成器。請根據以下角色資訊，生成該角色手機中的行程、飲食記錄和備忘錄。

${charBlock}

請生成：
- 3 到 8 個行程項目，包含時間（HH:MM）、標題、可選地點、完成狀態
- 1 到 5 個飲食記錄，包含餐別（breakfast/lunch/dinner/snack）、食物描述、時間、可選備註
- 2 到 6 個備忘錄項目，包含內容和完成狀態

所有內容必須符合角色的性格和當前故事背景。

${buildTranslationRule()}

只輸出 YAML，不要加任何其他文字。

請嚴格使用以下 YAML 格式輸出：

schedule:
  - time: "08:00"
    title: |
      項目標題（如有翻譯則原文加換行加中文翻譯）
    location: 地點（可省略）
    done: true或false

meals:
  - type: breakfast
    food: |
      食物描述（如有翻譯則原文加換行加中文翻譯）
    time: "07:30"
    note: 備註（可省略）

memos:
  - text: |
      備忘內容（如有翻譯則原文加換行加中文翻譯）
    done: true或false`;
}

/**
 * 建構 Group C (記事本+日記+錢包) 的 prompt
 * 指示 AI 生成記事本 1~3 篇、日記 1~3 篇、錢包餘額
 */
export function buildGroupCPrompt(
  charName: string,
  charDesc: string,
  personality: string,
  scenario: string,
  chatContext: string,
  userName: string = "使用者",
  userDescription: string = "",
  worldInfo: string = "",
  summariesAndEvents: string = "",
): string {
  const charBlock = buildCharacterBlock(
    charName,
    charDesc,
    personality,
    scenario,
    chatContext,
    userName,
    userDescription,
    worldInfo,
    summariesAndEvents,
  );

  return `你是一個角色扮演內容生成器。請根據以下角色資訊，生成該角色手機中的記事本、日記和錢包資訊。

${charBlock}

請生成：
- 1 到 3 篇記事本，包含標題和內容
- 1 到 3 篇日記，包含日期（YYYY-MM-DD）、心情（happy/neutral/sad/angry/excited）、內容、可選天氣
- 1 個錢包餘額數字，符合角色的經濟設定
- 3 到 8 筆交易記錄，包含描述、金額（正數=入帳，負數=出帳）、時間

所有內容必須符合角色的性格和當前故事背景。

${buildTranslationRule()}

只輸出 YAML，不要加任何其他文字。

請嚴格使用以下 YAML 格式輸出：

notes:
  - title: |
      標題（如有翻譯則原文加換行加中文翻譯）
    content: |
      內容文字（如有翻譯則原文加換行加中文翻譯）...

diary:
  - date: "2026-02-22"
    mood: happy
    content: |
      日記內容（如有翻譯則原文加換行加中文翻譯）...
    weather: 晴（可省略）

balance: 42850

transactions:
  - description: |
      交易描述（如有翻譯則原文加換行加中文翻譯）
    amount: -85
    time: "09:15"
  - description: 薪資入帳
    amount: 28000
    time: "10:00"`;
}

/**
 * 建構 Group B+C 合併 prompt（行程+飲食+備忘+記事+日記+錢包）
 * 包含 A 組已生成的聊天紀錄作為上下文，確保日記/行程/備忘與聊天內容互相呼應
 */
export function buildGroupBCPrompt(
  charName: string,
  charDesc: string,
  personality: string,
  scenario: string,
  chatContext: string,
  userName: string = "使用者",
  userDescription: string = "",
  worldInfo: string = "",
  summariesAndEvents: string = "",
  previousContext: string = "",
): string {
  const charBlock = buildCharacterBlock(
    charName,
    charDesc,
    personality,
    scenario,
    chatContext,
    userName,
    userDescription,
    worldInfo,
    summariesAndEvents,
  );

  const prevBlock = previousContext
    ? `\n【已生成的手機資料 —— 請根據以下內容保持一致、互相呼應】\n${previousContext}\n`
    : "";

  return `你是一個角色扮演內容生成器。請根據以下角色資訊，生成該角色手機中的行程、飲食、備忘錄、記事本、日記、帳戶資訊。\n\n${charBlock}${prevBlock}\n請生成以下部分（所有內容必須與已有資料保持一致、互相呼應）：\n- 3 到 8 個行程項目，包含時間（HH:MM）、標題、可選地點、完成狀態\n- 1 到 5 個飲食記錄，包含餐別（breakfast/lunch/dinner/snack）、食物描述、時間、可選備註\n- 2 到 6 個備忘錄項目，包含內容和完成狀態\n- 1 到 3 篇記事本，包含標題和內容\n- 1 到 3 篇日記，包含日期（YYYY-MM-DD）、心情（happy/neutral/sad/angry/excited）、內容、可選天氣\n  （日記應自然提及聊天記錄或行程中發生的事情）\n- 1 個錢包餘額數字，符合角色的經濟設定\n- 3 到 8 筆交易記錄，包含描述、金額（正數=入帳，負數=出帳）、時間\n\n所有內容必須符合角色的性格和當前故事背景。\n\n${buildTranslationRule()}\n\n只輸出 YAML，不要加任何其他文字。\n\n請嚴格使用以下 YAML 格式輸出：\n\nschedule:\n  - time: "08:00"\n    title: |\n      項目標題（如有翻譯則原文加換行加中文翻譯）\n    location: 地點（可省略）\n    done: true或false\n\nmeals:\n  - type: breakfast\n    food: |\n      食物描述（如有翻譯則原文加換行加中文翻譯）\n    time: "07:30"\n    note: 備註（可省略）\n\nmemos:\n  - text: |\n      備忘內容（如有翻譯則原文加換行加中文翻譯）\n    done: true或false\n\nnotes:\n  - title: |\n      標題（如有翻譯則原文加換行加中文翻譯）\n    content: |\n      內容文字（如有翻譯則原文加換行加中文翻譯）...\n\ndiary:\n  - date: "2026-04-07"\n    mood: happy\n    content: |\n      日記內容（如有翻譯則原文加換行加中文翻譯）...\n    weather: 晴（可省略）\n\nbalance: 42850\n\ntransactions:\n  - description: |\n      交易描述（如有翻譯則原文加換行加中文翻譯）\n    amount: -85\n    time: "09:15"`;
}

/**
 * 建構合併 prompt（全部模塊合一）
 * 一次生成所有手機內容，確保各模塊之間內容一致、互相呼應
 */
export function buildCombinedPrompt(
  charName: string,
  charDesc: string,
  personality: string,
  scenario: string,
  chatContext: string,
  userName: string = "使用者",
  userDescription: string = "",
  worldInfo: string = "",
  summariesAndEvents: string = "",
): string {
  const charBlock = buildCharacterBlock(
    charName,
    charDesc,
    personality,
    scenario,
    chatContext,
    userName,
    userDescription,
    worldInfo,
    summariesAndEvents,
  );

  return `你是一個角色扮演內容生成器。請根據以下角色資訊，一次性生成該角色手機中的全部內容。

${charBlock}

請在同一個回應中生成以下所有部分，所有內容必須互相呼應、保持一致的時間軸和故事背景（例如日記可提到行程中的事，聊天記錄可呼應備忘錄或日記的內容，交易記錄可對應行程中的消費）：

1. chats（聊天記錄）：2 到 5 個聊天對話串，每串包含角色與不同聯絡人的往來訊息
2. schedule（行程）：3 到 8 個今日行程，包含時間、標題、地點、完成狀態
3. meals（飲食記錄）：1 到 5 筆今日飲食，包含餐別、食物、時間、備註
4. memos（備忘錄）：2 到 6 條待辦/備忘，包含內容和完成狀態
5. notes（記事本）：1 到 3 篇筆記，包含標題和內容
6. diary（日記）：1 到 3 篇日記，包含日期、心情、內容、天氣
7. balance（帳戶餘額）：一個符合角色經濟設定的數字
8. transactions（交易記錄）：3 到 8 筆，包含描述、金額、時間
9. gallery（相冊）：3 到 6 張普通照片記錄，包含描述、來源、保存原因、日期
10. browser_history（瀏覽器歷史）：6 到 10 筆，**必須包含至少 2 到 3 筆 category: adult 的成人網站瀏覽紀錄**（例如 pornhub.com、xvideos.com 等，要有具體影片標題或搜尋詞），其餘為 search 和 general
11. hidden_photos（隱藏私密照片）：2 到 4 張深藏手機的私密照片，包含描述、類型、藏起來的原因、日期

${buildTranslationRule()}

【聊天記錄翻譯規則 —— 必須嚴格遵守】
所有聊天對話串中的「每一條」訊息的 text 都必須包含「原文＋換行＋中文翻譯」。
如果角色本身就是中文使用者，則直接用中文即可。

只輸出 YAML，不要加任何其他文字。

請嚴格使用以下 YAML 格式輸出：

chats:
  - contact: 聯絡人名稱
    messages:
      - from: 發送者名稱
        text: |
          Hey, are you free tonight?
          嘿，你今晚有空嗎？
        self: false
        time: 時間戳數字
      - from: ${charName}
        text: |
          Yeah, what's up?
          嗯，怎麼了？
        self: true
        time: 時間戳數字

schedule:
  - time: "08:00"
    title: 行程標題
    location: 地點（可省略）
    done: false

meals:
  - type: breakfast
    food: 食物描述
    time: "07:30"
    note: 備註（可省略）

memos:
  - text: 備忘內容
    done: false

notes:
  - title: 筆記標題
    content: |
      筆記內容...

diary:
  - date: "2026-04-07"
    mood: happy
    content: |
      日記內容...
    weather: 晴（可省略）

balance: 42850

transactions:
  - description: 交易描述
    amount: -85
    time: "09:15"

gallery:
  - description: |
      照片描述
    source: selfie
    reason: |
      保存原因
    date: "2026-04-07"

browser_history:
  - title: |
      How to get rid of dark circles
      如何消除黑眼圈
    url: google.com/search?q=how+to+get+rid+of+dark+circles
    time: "09:14"
    category: search
  - title: |
      [4K] Mia Khalifa - Fantasy Roleplay
      米亞·卡莉法 幻想角色扮演
    url: pornhub.com/view_video.php?viewkey=ph6xxxxx
    time: "23:47"
    category: adult
  - title: |
      Petite Asian teen seduced - xvideos
      嬌小亞裔少女被勾引
    url: xvideos.com/video12345/petite_asian
    time: "01:12"
    category: adult
  - title: Instagram
    url: instagram.com
    time: "14:22"
    category: general

hidden_photos:
  - description: |
      私密照片描述
    type: selfie
    reason: |
      為什麼藏起來的原因
    date: "2026-04-07"`;
}

/**
 * 建構 Group D (相冊+瀏覽紀錄+隱藏照片) 的 prompt
 * 指示 AI 生成相冊、瀏覽器歷史（含成人紀錄）、隱藏私密照片
 */
export function buildGroupDPrompt(
  charName: string,
  charDesc: string,
  personality: string,
  scenario: string,
  chatContext: string,
  userName: string = "使用者",
  userDescription: string = "",
  worldInfo: string = "",
  summariesAndEvents: string = "",
  previousDataContext: string = "",
): string {
  const charBlock = buildCharacterBlock(
    charName,
    charDesc,
    personality,
    scenario,
    chatContext,
    userName,
    userDescription,
    worldInfo,
    summariesAndEvents,
  );

  const prevBlock = previousDataContext
    ? `\n【已生成的手機資料 —— 請根據以下內容讓照片、瀏覽紀錄、隱藏照片與其互相呼應】\n${previousDataContext}\n`
    : "";

  return `你是一個角色扮演內容生成器。請根據以下角色資訊，生成該角色手機中的相冊、瀏覽器歷史記錄、以及藏在手機深處的私密照片。

${charBlock}${prevBlock}

請生成以下三個部分：

【gallery 相冊】3 到 6 張普通照片：
- description: 照片畫面描述（生動具體）
- source: selfie（自拍）/ scene（風景物品）/ saved（從聊天保存）
- reason: 角色保存這張的心情（內心獨白口吻）
- date: YYYY-MM-DD

【browser_history 瀏覽器歷史】6 到 10 筆，**必須包含至少 2 到 3 筆 category: adult 的成人網站紀錄**（这是強制要求，不可省略）：
  - category: search — 一般搜尋紀錄
  - category: adult — 成人網站瀏覽/觀看紀錄，url 必須是真實風格的成人網址（如 pornhub.com/view_video.php?viewkey=xxxxx、xvideos.com/videoXXXX/標題等），title 要有具體影片名或搜尋關鍵詞
  - category: general — 一般網站瀏覽（社群、新聞等）
  每筆包含：title（如非中文則用 block scalar 加換行中文翻譯）、url、time（HH:mm）、category

【hidden_photos 隱藏私密照片】2 到 4 張（深藏不對外公開的照片）：
- description: 照片描述（可以是私密自拍、情色截圖、悄悄保存的他人H圖等）
- type: selfie（本人拍的）/ saved（從網路/他人保存）/ screenshot（截圖）
- reason: 為什麼藏起來不讓人看到（角色的內心獨白，要真實、微妙、有點羞澀或複雜的情感）
- date: YYYY-MM-DD

所有內容必須符合角色的性格、隱秘欲望和故事背景。成人相關內容要有角色特色，不要千篇一律。

${buildTranslationRule()}

只輸出 YAML，不要加任何其他文字。

請嚴格使用以下 YAML 格式輸出：

gallery:
  - description: |
      照片描述
    source: selfie
    reason: |
      保存原因
    date: "2026-02-20"

browser_history:
  - title: |
      How to get rid of dark circles
      如何消除黑眼圈
    url: google.com/search?q=dark+circles+removal
    time: "09:14"
    category: search
  - title: |
      [4K] Mia Khalifa - Fantasy Roleplay Vol.2
      米亞·卡莉法 幻想角色扮演 第二集
    url: pornhub.com/view_video.php?viewkey=ph5f3xxxx
    time: "23:47"
    category: adult
  - title: |
      Petite Asian teen creampie compilation
      嬌小亞裔內射合集
    url: xvideos.com/video98765/petite_asian_compilation
    time: "01:12"
    category: adult
  - title: Instagram
    url: instagram.com
    time: "14:22"
    category: general

hidden_photos:
  - description: |
      私密照片描述
    type: selfie
    reason: |
      為什麼藏起來的原因（內心獨白）
    date: "2026-02-19"`;
}
