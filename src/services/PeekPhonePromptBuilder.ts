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
 * 建構 Group D (相冊) 的 prompt
 * 指示 AI 生成 4~8 張照片描述，包含角色自拍、拍攝的風景/物品、從聊天保存的圖片
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

  return `你是一個角色扮演內容生成器。請根據以下角色資訊，生成該角色手機相冊中的照片記錄。

${charBlock}

請生成 4 到 8 張照片記錄。每張照片包含：
- description: 照片的文字描述（描述照片中的畫面，要生動具體）
- source: 照片來源，三種之一：
  - selfie: 角色的自拍照
  - scene: 角色拍攝的風景、食物、物品等
  - saved: 從聊天中保存的圖片（別人傳給角色的）
- reason: 角色保存這張照片的原因（用角色的口吻寫，像內心獨白）
- date: 拍攝/保存日期（YYYY-MM-DD）

照片內容和保存原因必須符合角色的性格和故事背景。
reason 要有角色的個人風格，例如「覺得這張超蠢超可愛」「難得拍到這麼美的夕陽」「他傳來的表情包笑死我了」。

${buildTranslationRule()}

只輸出 YAML，不要加任何其他文字。

請嚴格使用以下 YAML 格式輸出：

gallery:
  - description: |
      照片描述（如有翻譯則原文加換行加中文翻譯）
    source: selfie
    reason: |
      保存原因（如有翻譯則原文加換行加中文翻譯）
    date: "2026-02-20"
  - description: 朋友傳來的搞笑貓咪梗圖
    source: saved
    reason: 這隻貓的表情跟我起床的時候一模一樣哈哈哈
    date: "2026-02-19"`;
}
