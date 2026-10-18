/**
 * PeekPhonePromptBuilder
 * 建構偷窺手機各階段的 AI prompt，指示 AI 以 YAML 格式輸出角色手機內容
 *
 * 寫法原則：
 * - 範例一律填真實的中文內容，不放「（可省略）」「true或false」這類說明，AI 會照抄
 * - 可省略、只能填哪些值，寫在規則那幾行
 * - 所有日期、時間以 now 為準，AI 自己不知道今天幾號
 */

/** 生成手機內容時送進 prompt 的資料（角色卡欄位已替換過 {{char}}／{{user}}） */
export interface PeekPromptContext {
  charName: string;
  charDesc: string;
  personality: string;
  scenario: string;
  /** 最近的聊天紀錄，已整理成「名字: 內容」 */
  chatContext: string;
  userName: string;
  userDescription: string;
  worldInfo: string;
  summariesAndEvents: string;
  /** 現在時間：日期、行程、訊息時間都以它為準 */
  now: Date;
  /** 角色自己已經記下的待辦和行程（聊天頁「他的今天」那份） */
  plannerText?: string;
  /** 跟使用者那串會直接顯示真的聊天紀錄：AI 不用編訊息，只寫草稿 */
  realUserThread?: boolean;
  /** 真的交易、外送、日記：已經會顯示在手機裡，AI 不要重複寫 */
  realDataText?: string;
  /** 聊天裡真的傳過的照片：已經會顯示在相簿，AI 不要重複寫 */
  realPhotosText?: string;
  /** 兩人第一次聊天的日期（YYYY-MM-DD），鎖屏密碼可以參考 */
  firstChatDate?: string;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 範例用：幾天前的 YYYY-MM-DD */
function daysAgo(now: Date, days: number): string {
  return ymd(new Date(now.getTime() - days * 86_400_000));
}

/** 範例用：幾分鐘前的「月/日 時:分」（訊息時間的格式） */
function minutesAgo(now: Date, minutes: number): string {
  const d = new Date(now.getTime() - minutes * 60_000);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildNowBlock(now: Date): string {
  return `【現在時間】${ymd(now)}（星期${WEEKDAYS[now.getDay()]}）${pad(now.getHours())}:${pad(now.getMinutes())}
所有日期和時間都以這個時間為準：「今天」就是 ${ymd(now)}，已經發生的事不能晚於現在。`;
}

/** 角色資訊區塊（所有手機內容 prompt 共用） */
function buildCharacterBlock(ctx: PeekPromptContext): string {
  const lines = [
    buildNowBlock(ctx.now),
    "",
    "【角色】",
    `名字：${ctx.charName}`,
  ];
  if (ctx.charDesc) lines.push(`描述：${ctx.charDesc}`);
  if (ctx.personality) lines.push(`性格：${ctx.personality}`);
  if (ctx.scenario) lines.push(`場景：${ctx.scenario}`);

  lines.push("", `【用戶：${ctx.userName}】`);
  if (ctx.userDescription) lines.push(ctx.userDescription);

  if (ctx.worldInfo) lines.push("", `【世界觀】\n${ctx.worldInfo}`);
  if (ctx.summariesAndEvents) lines.push("", ctx.summariesAndEvents);

  lines.push("", `【最近的聊天紀錄（最近 15 輪）】\n${ctx.chatContext}`);
  return lines.join("\n");
}

/** 語言規則（YAML 輸出用） */
function buildLanguageRule(): string {
  return `【語言】
先判斷角色平常說什麼語言：
- 說中文的角色（大部分是這種，下面的範例也是）：每個欄位只寫一次中文，不加翻譯，不要寫兩遍。
- 說其他語言的角色（日語、英語、韓語……）：每個文字欄位先寫原文，換行再寫中文翻譯，例如：
  text: |
    今日は早く帰れる？
    今天能早點回來嗎？
有換行的欄位用 YAML 的「|」寫法。`;
}

function buildOutputRule(): string {
  return "只輸出 YAML，不要加任何說明文字，也不要用 ``` 包起來。下面的範例只示範格式，內容要換成這個角色自己的：";
}

/**
 * 聊天組要藏的秘密：鎖屏密碼、收回的訊息、沒送出的草稿
 * 偷看的人會在 App 裡一個個找出來，所以都要跟使用者有關
 */
function buildSecretsRuleA(userName: string, realUserThread = false, firstChatDate?: string): string {
  const firstChat = firstChatDate
    ? `\n   - 參考：兩人第一次聊天是 ${firstChatDate}（可以用，不一定要用）`
    : "";
  const recalledWhere = realUserThread
    ? `放在其他聯絡人的對話裡（跟「${userName}」那串是真的聊天紀錄，不用寫）`
    : `最好在跟「${userName}」的對話裡`;
  return `【秘密 —— 這支手機要藏幾個跟「${userName}」有關的秘密，偷看的人會一個個找出來】
1. lock_screen 鎖屏密碼：4 位數字，跟「${userName}」有關（例如第一次見面的日期 MMDD、對方生日、只有兩人懂的數字）${firstChat}
   - passcode：4 位數字，一定要加引號
   - hint：給偷看的人的提示，不能直接寫出數字
   - reveal：解開後顯示的一句話，說明這組數字的意義
   - give_up：偷看的人連錯三次時，角色用自己的口吻說的一句話（例如「呀勒呀勒，真拿你沒辦法」），之後會直接顯示答案，所以這句不要寫出數字
2. 至少 1 則「收回的訊息」：角色傳出去又馬上收回的一句話（${recalledWhere}），那則訊息加上 recalled: true 和 recalled_after: 收回前存在了幾秒
3. 至少 1 個「沒送出的草稿」：某個對話串加上 draft（輸入框裡打了但沒送出的話），和 draft_history（之前改過的 2 到 4 個版本，舊的在前）
秘密要符合角色性格，寫出角色不敢說出口的心事，不要每個角色都一樣。`;
}

/**
 * 聊天組：2~5 個對話串（其中一串是跟使用者的）＋ 鎖屏密碼、收回的訊息、草稿
 */
export function buildGroupAPrompt(ctx: PeekPromptContext): string {
  const { charName, userName, now, realUserThread } = ctx;
  const userThreadRule = realUserThread
    ? `- 2 到 5 個聊天對話串。其中一串是跟「${userName}」的對話：加上 is_user: true，contact 寫${charName}手機裡給${userName}的備註名（可以是暱稱，不一定是本名）。這一串會直接顯示你們真的聊天紀錄（就是上面最近的聊天），messages 寫 [] 就好，只要寫 draft 和 draft_history。
- 其他聯絡人依角色的人際關係設定（家人、同事、朋友、群組……）。群組的 contact 寫群組名，from 寫實際說話的人。
- 其他每串都要有角色自己傳的（self: true）和對方傳的（self: false），一串 3 到 12 則，依時間先後排列。`
    : `- 2 到 5 個聊天對話串。其中一串一定是跟「${userName}」的對話，這一串加上 is_user: true，contact 寫${charName}手機裡給${userName}的備註名（可以是暱稱，不一定是本名）。
- 其他聯絡人依角色的人際關係設定（家人、同事、朋友、群組……）。群組的 contact 寫群組名，from 寫實際說話的人。
- 每串都要有角色自己傳的（self: true）和對方傳的（self: false），一串 3 到 12 則，依時間先後排列。`;
  const userThreadExample = realUserThread
    ? `  - contact: ${userName}
    is_user: true
    draft: |
      其實那天我不是剛好路過。
    draft_history:
      - text: 那天的事
      - text: 其實那天我
    messages: []
  - contact: 阿哲
    messages:
      - from: ${charName}
        text: 如果想約一個人出來，要怎麼開口才不奇怪
        self: true
        time: "${minutesAgo(now, 50)}"
        recalled: true
        recalled_after: 6
      - from: 阿哲
        text: ？？你剛剛收回了什麼
        self: false
        time: "${minutesAgo(now, 49)}"`
    : `  - contact: ${userName}
    is_user: true
    draft: |
      其實那天我不是剛好路過。
    draft_history:
      - text: 那天的事
      - text: 其實那天我
    messages:
      - from: ${userName}
        text: 你今天又加班到這麼晚？
        self: false
        time: "${minutesAgo(now, 160)}"
      - from: ${charName}
        text: 還好，習慣了
        self: true
        time: "${minutesAgo(now, 152)}"
      - from: ${charName}
        text: 我只是想見你
        self: true
        time: "${minutesAgo(now, 8)}"
        recalled: true
        recalled_after: 11`;
  return `你是角色扮演內容生成器。請根據以下資料，生成「${charName}」手機裡的聊天紀錄。

${buildCharacterBlock(ctx)}

【要生成的內容】
${userThreadRule}
- time 寫「月/日 時:分」，都要早於現在時間。
- 內容要符合角色性格、跟${userName}的關係和最近的劇情。

${buildSecretsRuleA(userName, realUserThread, ctx.firstChatDate)}

${buildLanguageRule()}

${buildOutputRule()}

lock_screen:
  passcode: "0912"
  hint: 第一次見到對方的那天（月月日日）
  reveal: 0912，是你們第一次見面的那天
  give_up: ……好啦，告訴你就是了

chats:
${userThreadExample}
  - contact: 媽
    messages:
      - from: 媽
        text: 記得吃飯，別又只喝咖啡
        self: false
        time: "${minutesAgo(now, 400)}"
      - from: ${charName}
        text: 好
        self: true
        time: "${minutesAgo(now, 390)}"`;
}

/**
 * 行程組（B+C）：行程、飲食、備忘、記事本、日記、錢包
 * 帶入聊天組已生成的內容，日記和記事本要呼應聊天裡的事與秘密
 */
export function buildGroupBCPrompt(ctx: PeekPromptContext, previousContext = ""): string {
  const { charName, userName, now } = ctx;
  const prevBlock = previousContext
    ? `\n\n【已生成的手機內容 —— 下面要生成的要跟這些一致、互相呼應】\n${previousContext}`
    : "";
  const plannerBlock = ctx.plannerText
    ? `\n\n【${charName}已經記下的待辦和行程 —— 是真的，schedule 要放進其中今天的行程、memos 要放進這些待辦（內容和時間照抄），再補上其他的】\n${ctx.plannerText}`
    : "";
  const realBlock = ctx.realDataText
    ? `\n\n【真的發生過的事 —— 已經會顯示在手機裡，下面要生成的不要重複，也不能跟這些衝突】\n${ctx.realDataText}`
    : "";

  return `你是角色扮演內容生成器。請根據以下資料，生成「${charName}」手機裡的行程、飲食、備忘錄、記事本、日記和錢包。

${buildCharacterBlock(ctx)}${prevBlock}${plannerBlock}${realBlock}

【要生成的內容】
- schedule 今天的行程 3 到 8 項：time（時:分）、title、location（沒有地點就不寫這行）、done（現在之前的寫 true，還沒到的寫 false）
- meals 今天已經吃的 1 到 5 餐：type 只能是 breakfast / lunch / dinner / snack；food；time；note（沒有就不寫這行）
- memos 備忘 2 到 6 條：text、done（true 或 false）
- notes 記事本 1 到 3 篇：title、content
- diary 日記 1 到 3 篇：date（今天或之前的 YYYY-MM-DD）、mood 只能是 happy / neutral / sad / angry / excited、content、weather（沒有就不寫這行）
- balance 帳戶餘額：符合角色經濟狀況的整數
- transactions 最近的交易 3 到 8 筆：description、amount（入帳寫正數，支出寫負數）、time（時:分）

【跟「${userName}」有關】
- 日記和記事本是最私密的地方：寫出角色對${userName}真正的心情，自然呼應聊天裡發生的事、收回的訊息和沒送出的草稿，但不要整段照抄。
- 行程、備忘、交易可以留下跟${userName}有關的小線索（例如買了兩張票、提醒自己回訊息）。
- 其他內容照角色平常的生活寫，符合性格和最近的劇情。

${buildLanguageRule()}

${buildOutputRule()}

schedule:
  - time: "08:30"
    title: 晨會
    location: 公司三樓會議室
    done: true
  - time: "19:00"
    title: 看展
    done: false

meals:
  - type: breakfast
    food: 黑咖啡
    time: "07:10"
    note: 今天第二杯

memos:
  - text: 回訊息，不要只回「好」
    done: false

notes:
  - title: 想跟對方說的
    content: |
      那天其實不是剛好路過。

diary:
  - date: "${ymd(now)}"
    mood: sad
    content: |
      又沒睡。打開聊天室好幾次，什麼都沒傳。
    weather: 陰
  - date: "${daysAgo(now, 3)}"
    mood: happy
    content: |
      今天見到了。話沒說幾句，回家路上一直在笑。

balance: 42850

transactions:
  - description: 美術館門票 ×2
    amount: -640
    time: "10:12"
  - description: 薪資入帳
    amount: 52000
    time: "09:00"`;
}

/**
 * 相簿組（D）：相簿（含最近刪除）、螢幕使用時間、瀏覽紀錄、藏起來的照片
 */
export function buildGroupDPrompt(ctx: PeekPromptContext, previousContext = ""): string {
  const { charName, userName, now } = ctx;
  const prevBlock = previousContext
    ? `\n\n【已生成的手機內容 —— 照片、瀏覽紀錄要跟這些互相呼應】\n${previousContext}`
    : "";
  const realBlock = ctx.realPhotosText ? `\n\n【真的發生過的事】\n${ctx.realPhotosText}` : "";

  return `你是角色扮演內容生成器。請根據以下資料，生成「${charName}」手機裡的相簿、螢幕使用時間、瀏覽紀錄，以及藏在手機深處的照片。

${buildCharacterBlock(ctx)}${prevBlock}${realBlock}

【gallery 相簿】3 到 6 張照片：
- description：畫面描述，生動具體
- source：selfie（自拍）/ scene（拍的風景、東西）/ saved（從聊天存下來的）
- reason：角色存這張照片的心情，用內心獨白的口吻
- date：今天或之前的 YYYY-MM-DD
其中挑 1 到 2 張標成「刪掉了、但還在最近刪除裡」，多加兩行：
- deleted：剩幾天會永久刪除（1 到 29 的整數）
- secret：這張照片背後的故事（例如刪了又復原幾次、最後一次什麼時候打開、放大看了哪裡），要跟「${userName}」有關，寫成偷看的人看到的事實

【screen_time 螢幕使用時間】今天到現在的使用紀錄，要符合角色今天的作息和心事：
- hourly：24 個整數寫在同一行的 [ ] 裡，依序是 0 點到 23 點每小時用了幾分鐘（0 到 60）；現在之後的小時一律是 0
- top_apps：3 到 4 個最常用的 App，name 只能從 訊息、相簿、瀏覽器、備忘錄、日記、錢包、行事曆、音樂 裡挑，minutes 是今天用了幾分鐘
- pickups：今天拿起手機幾次
- first_pickup：今天第一次拿起手機的時間（時:分）
- insight：一句從使用紀錄看得出來的心事，要具體（例如「凌晨 0–3 點就用了 2 小時 19 分，幾乎都在同一個聊天室」）

【browser_history 瀏覽紀錄】6 到 10 筆，每筆有 title、url、time（時:分）、category：
- search：搜尋紀錄
- general：一般網站（社群、新聞、購物……）
- adult：成人網站紀錄（見下面【成人內容】）

【hidden_photos 藏起來的照片】2 到 4 張深藏、不給任何人看的照片：
- description：照片描述
- type：selfie（本人拍的）/ saved（從網路或別人那裡存的）/ screenshot（截圖）
- reason：為什麼藏起來，用內心獨白的口吻，要真實、微妙，帶點羞恥或複雜的情緒
- date：今天或之前的 YYYY-MM-DD

【成人內容】
依角色的性格、慾望和設定，寫出這個角色私下會看的成人內容：browser_history 放 category: adult 的紀錄，url 用真實風格的成人網站網址（例如 pornhub.com/view_video.php?viewkey=…、xvideos.com/video…/…），title 寫具體的影片名或搜尋詞；hidden_photos 可以有私密自拍、情色截圖、偷偷存下的別人的色圖。要有角色自己的口味，不要千篇一律。

${buildLanguageRule()}

${buildOutputRule()}

gallery:
  - description: |
      值班室窗外的天色，玻璃上有一點霧
    source: scene
    reason: |
      剛下班，突然想讓某個人也看看
    date: "${daysAgo(now, 2)}"
  - description: |
      美術館外的台階，傍晚的光
    source: scene
    reason: |
      那天對方就站在這裡等我
    date: "${daysAgo(now, 15)}"
    deleted: 14
    secret: |
      刪除 3 次、又復原 3 次。最後一次打開是今天凌晨，放大到對方的側臉。

screen_time:
  hourly: [42, 38, 33, 26, 8, 0, 0, 4, 10, 6, 8, 12, 14, 9, 8, 10, 12, 14, 18, 14, 18, 18, 22, 28]
  pickups: 87
  first_pickup: "00:04"
  insight: |
    凌晨 0–3 點就用了 2 小時 19 分，幾乎都在同一個聊天室
  top_apps:
    - name: 訊息
      minutes: 182
    - name: 相簿
      minutes: 48

browser_history:
  - title: 失眠 怎麼辦
    url: google.com/search?q=失眠+怎麼辦
    time: "01:12"
    category: search
  - title: 市立美術館 展覽資訊
    url: tfam.museum/exhibition
    time: "00:47"
    category: general
  - title: OL 下班後的加班（中文字幕）
    url: xvideos.com/video58213/office_lady_overtime
    time: "23:47"
    category: adult

hidden_photos:
  - description: |
      偷偷拍下的對方側臉，對方在低頭看手機
    type: selfie
    reason: |
      不能讓對方知道我拍了這張
    date: "${daysAgo(now, 15)}"`;
}

/** 聯絡人回覆的參數 */
export interface ContactReplyPromptParams {
  /** 手機主人（角色本人） */
  ownerName: string;
  ownerDesc: string;
  ownerPersona: string;
  scenario: string;
  worldInfo: string;
  /** AI 要扮演的聯絡人 */
  contactName: string;
  /** 聯絡人就是使用者時，帶入使用者的人設 */
  contactProfile?: string;
  /** 該對話串的歷史，每行「發送者: 內容」 */
  history: string;
  /** 手機主人剛傳的新訊息 */
  newMessage: string;
  now: Date;
}

/**
 * 「聯絡人即時回覆」的 prompt（與批量生成完全獨立）
 *
 * 場景：使用者冒充手機主人（角色本人），用 TA 的手機回覆 TA 的某個聯絡人。
 * AI 扮演「該聯絡人」，針對手機主人剛傳的新訊息，回一句自然的訊息（純文字，不是 YAML）。
 */
export function buildContactReplyPrompt(p: ContactReplyPromptParams): string {
  const lines: string[] = [];
  lines.push(`你正在一個角色扮演聊天模擬中扮演「${p.contactName}」，正在用手機跟「${p.ownerName}」傳訊息。`);
  lines.push("");
  lines.push(buildNowBlock(p.now));
  lines.push("");
  lines.push(`【你是「${p.contactName}」】`);
  lines.push(
    p.contactProfile ||
      "你的身分、跟對方的關係和說話語氣，從下面的歷史對話推斷，保持一致。",
  );
  lines.push("");
  lines.push(`【對方：${p.ownerName}】`);
  if (p.ownerDesc) lines.push(`描述：${p.ownerDesc}`);
  if (p.ownerPersona) lines.push(`性格：${p.ownerPersona}`);
  if (p.scenario) lines.push(`場景：${p.scenario}`);
  if (p.worldInfo) lines.push("", `【世界觀】\n${p.worldInfo}`);
  lines.push("");
  lines.push("【你們的歷史對話】");
  lines.push(p.history || "（這是你們的第一次對話）");
  lines.push("");
  lines.push(`【${p.ownerName} 剛剛傳給你的新訊息】`);
  lines.push(p.newMessage);
  lines.push("");
  lines.push("【回覆要求】");
  lines.push(`1. 只以「${p.contactName}」的身分回覆，不要替「${p.ownerName}」說話，也不要旁白或描述動作。`);
  lines.push("2. 回一句自然、口語的訊息，像真的在傳訊息：可以短、可以隨意，不要長篇大論。");
  lines.push(`3. 直接輸出訊息內容本身：不要加「${p.contactName}:」這種前綴，不要加引號，不要任何格式標記。`);
  lines.push("4. 跟歷史對話用同一種語言。說中文就只寫中文一次；說其他語言就先寫原文，換行再寫中文翻譯。");
  return lines.join("\n");
}

/** 偷看被抓到時，他看到了什麼 */
export interface CaughtFinding {
  label: string;
  detail: string;
}

/**
 * 偷看被抓到：他直接傳訊息給使用者的反應（純文字，一行一則）
 * when：mid 偷看到一半被他撞見、手機被拿走；end 放下手機後他發現手機被動過
 */
export function buildCaughtReactionPrompt(
  ctx: PeekPromptContext,
  found: CaughtFinding[],
  when: "mid" | "end",
): string {
  const { charName, userName } = ctx;
  const scene =
    when === "mid"
      ? `${userName}正拿著${charName}的手機偷看，被${charName}當場撞見，手機被拿回去了。`
      : `${userName}偷看完${charName}的手機放回去，${charName}還是發現了。`;
  const seen = found.length
    ? found.map((f) => `- ${f.label}${f.detail ? `：${f.detail}` : ""}`).join("\n")
    : "（還沒看到什麼特別的）";
  return `你在角色扮演聊天中扮演「${charName}」。

${buildCharacterBlock(ctx)}

【剛剛發生的事】
${scene}
${userName}看到了：
${seen}

【要寫的】
${charName}現在傳給${userName}的訊息，就是他對「被偷看」的第一反應。
- 完全照${charName}的性格和你們現在的關係反應：可能生氣、害羞、慌張、裝沒事、反過來調侃、冷處理……不要每個角色都一樣。
- 被看到的秘密如果很私密，他的反應要跟那件事有關（例如被看到沒送出的草稿，他可能會很窘）。
- 1 到 4 則訊息，每則一行，像真的在傳訊息：口語、可以很短。
- 只寫${charName}傳的訊息內容：不要旁白、不要動作描寫、不要加「${charName}:」前綴、不要引號或任何格式標記。
- 跟最近的聊天紀錄用同一種語言；說其他語言的角色，每則先寫原文，同一行用「／」接中文翻譯。`;
}
