/**
 * 预设表情包配置
 *
 * 新用户首次使用时会自动加载这些表情包
 *
 * 格式说明：
 * - 每个表情包需要提供 name（名称）和 url（图片链接）
 * - name: 表情包的显示名称，会在聊天时显示
 * - url: 图片链接（支持 https:// 或 http://）
 *
 * 快速编辑方式：
 * 1. 复制下面的格式
 * 2. 修改 name 和 url
 * 3. 保存文件即可
 */

export type StickerEmotionId =
  | 'love'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprise'
  | 'shy'
  | 'tired'
  | 'mischief'
  | 'sos'
  | 'cute_action'
  | 'food'
  | 'nsfw'
  | 'misc'
  | 'uncategorized';

export interface StickerEmotionDefinition {
  id: StickerEmotionId;
  displayName: string;
  emoji: string;
  sortIndex: number;
}

export const UNCATEGORIZED_EMOTION_ID: StickerEmotionId = 'uncategorized';

export const EMOTION_DEFINITIONS: StickerEmotionDefinition[] = [
  { id: 'love', displayName: '愛與親密', emoji: '💚', sortIndex: 10 },
  { id: 'happy', displayName: '開心得意', emoji: '😄', sortIndex: 20 },
  { id: 'sad', displayName: '哭泣難過', emoji: '😭', sortIndex: 30 },
  { id: 'angry', displayName: '生氣憤怒', emoji: '😡', sortIndex: 40 },
  { id: 'surprise', displayName: '驚訝困惑', emoji: '😳', sortIndex: 50 },
  { id: 'shy', displayName: '害羞撒嬌', emoji: '🥺', sortIndex: 60 },
  { id: 'tired', displayName: '疲憊無奈', emoji: '😮‍💨', sortIndex: 70 },
  { id: 'mischief', displayName: '搞怪整蠱', emoji: '😈', sortIndex: 80 },
  { id: 'sos', displayName: '求助緊張', emoji: '🆘', sortIndex: 90 },
  { id: 'cute_action', displayName: '可愛動作', emoji: '🐾', sortIndex: 100 },
  { id: 'food', displayName: '飲食', emoji: '🍜', sortIndex: 110 },
  { id: 'nsfw', displayName: '成人向', emoji: '🔞', sortIndex: 120 },
  { id: 'misc', displayName: '雜項', emoji: '✨', sortIndex: 130 },
  { id: UNCATEGORIZED_EMOTION_ID, displayName: '未分類', emoji: '❓', sortIndex: 999 },
];

export interface DefaultSticker {
  name: string;
  url: string;
  emotion: StickerEmotionId;
}

type RawDefaultSticker = Omit<DefaultSticker, 'emotion'>;

function stickerGroup(
  emotion: StickerEmotionId,
  stickers: RawDefaultSticker[],
): DefaultSticker[] {
  return stickers.map((sticker) => ({ ...sticker, emotion }));
}

/**
 * 预设表情包列表
 *
 * 📝 编辑说明：
 * - 在下面的数组中添加或删除表情包
 * - 格式：{ name: '表情包名', url: '图片链接' }
 * - 每行一个表情包，用逗号分隔
 *
 * 💡 提示：
 * - 建议使用稳定的图床链接（如 imgur、aguacloud 等）
 * - 图片格式支持 jpg、png、gif、webp
 * - 建议图片大小不超过 500KB
 */
export const defaultStickers: DefaultSticker[] = [
  // ========================================
  // 💡 提示：修改 name 字段来自定义表情包名称
  // 情緒分類：愛與親密 / 開心得意 / 哭泣難過 / 生氣憤怒 /
  //           驚訝困惑 / 害羞撒嬌 / 疲憊無奈 / 搞怪整蠱 /
  //           求助緊張 / 可愛動作 / 飲食 / 成人向 / 雜項
  // ========================================

  // ── 愛與親密 ──────────────────────────────
  ...stickerGroup('love', [
  { name: '貓貓愛你', url: 'https://aguacloudreve.aguacloud.uk/f/1YtQ/1306600983643684884.jpg' },
  { name: 'miku-love', url: 'https://aguacloudreve.aguacloud.uk/f/eZIp/1338461829046992946.jpg' },
  { name: '牽牽手', url: 'https://aguacloudreve.aguacloud.uk/f/8wgfe/8D533AC6DDE9E910A2D9B8EA94B735BA.gif?raw=true' },
  { name: '嫁給我好嗎（鑽戒版）', url: 'https://aguacloudreve.aguacloud.uk/f/RwPcd/25B32767F48B4217F4C847652BEB8B76.gif?raw=true' },
  { name: '喔喔喔好愛你', url: 'https://aguacloudreve.aguacloud.uk/f/ejZfp/D0B7058C9C25209CF5B0460843B8E151.gif?raw=true' },
  { name: '愛心', url: 'https://aguacloudreve.aguacloud.uk/f/39Pf2/discord_070.png' },
  { name: '紫色愛心', url: 'https://aguacloudreve.aguacloud.uk/f/E3jfk/discord_076.png' },
  { name: '藍色愛心', url: 'https://aguacloudreve.aguacloud.uk/f/zQVig/discord_097.png' },
  { name: '貓貓貼貼', url: 'https://aguacloudreve.aguacloud.uk/f/d4KU9/%E8%B2%93%E8%B2%93%E8%B2%BC%E8%B2%BC.gif' },
  ]),

  // ── 開心／得意 ────────────────────────────
  ...stickerGroup('happy', [
  { name: '邪惡發言', url: 'https://aguacloudreve.aguacloud.uk/f/Kngs3/%E6%80%9D%E8%80%83%E4%B8%80%E4%B8%8B%E9%96%8B%E5%A7%8B%E8%A9%86%E6%AF%80.gif' },
  { name: 'yaaabi!', url: 'https://aguacloudreve.aguacloud.uk/f/yaum/5B9803A81AA3D710D8A03AEB82A113AE.gif?raw=true' },
  { name: '賊笑', url: 'https://aguacloudreve.aguacloud.uk/f/Q29HY/62009B27C04B49E253438103E3F94BCD.gif?raw=true' },
  { name: '嘻嘻', url: 'https://aguacloudreve.aguacloud.uk/f/RQ5td/hehe.png' },
  { name: '好棒', url: 'https://aguacloudreve.aguacloud.uk/f/A77u1/%E5%A5%BD%E6%A3%92.gif' },
  { name: '驚喜', url: 'https://aguacloudreve.aguacloud.uk/f/5NVfp/%E9%A9%9A%E8%A8%9D.gif' },
  { name: '聰明如我', url: 'https://aguacloudreve.aguacloud.uk/f/rJDCp/729CF75F892F083E449B8F879974DBD2.gif?raw=true' },
  { name: '我他嗎快笑死', url: 'https://aguacloudreve.aguacloud.uk/f/XZkHk/discord_099.png' },
  { name: '得意轉圈圈', url: 'https://aguacloudreve.aguacloud.uk/f/Rr5Ud/%E5%BE%97%E6%84%8F%E8%BD%89%E5%9C%88%E5%9C%88.gif' },
  { name: '得意扭扭', url: 'https://aguacloudreve.aguacloud.uk/f/6Nqfw/%E5%BE%97%E6%84%8F%E6%89%AD%E6%89%AD.gif' },
  { name: '得意老鼠', url: 'https://aguacloudreve.aguacloud.uk/f/7N6SW/%E5%BE%97%E6%84%8F%E8%80%81%E9%BC%A0.jpg' },
  { name: '驚訝得意貓', url: 'https://aguacloudreve.aguacloud.uk/f/vvbHB/%E5%BE%97%E6%84%8F%E9%A9%9A%E8%A8%9D%E8%B2%93.gif' },
  { name: '我是皇帝聽我的', url: 'https://aguacloudreve.aguacloud.uk/f/aYnIB/%E6%88%91%E6%98%AF%E7%9A%87%E5%B8%9D%E8%81%BD%E6%88%91%E7%9A%84.jpg' },
  { name: '瑞克搖', url: 'https://aguacloudreve.aguacloud.uk/f/kEqTL/1436259632422326292.gif' },
  { name: 'claude真棒', url: 'https://aguacloudreve.aguacloud.uk/f/JkBiO/%E5%B0%8F%E5%85%8B%E7%9C%9F%E6%A3%92.jpg' },
  ]),

  // ── 哭泣／難過 ────────────────────────────
  ...stickerGroup('sad', [
  { name: 'qwq', url: 'https://aguacloudreve.aguacloud.uk/f/BqT7/1338461812974420038.jpg' },
  { name: '哭給你看', url: 'https://aguacloudreve.aguacloud.uk/f/WEcQ/3F36986994FF237E068BCA684D24B3F6.gif?raw=true' },
  { name: '嗚嗚...', url: 'https://aguacloudreve.aguacloud.uk/f/VbUq/BBE976EC62EA108E0FB661F01B03625F.jpg' },
  { name: '貓哭哭', url: 'https://aguacloudreve.aguacloud.uk/f/EJjFk/714CC468146A74D954A5904CFDFA03F2.gif?raw=true' },
  { name: '我...嗚嗚...', url: 'https://aguacloudreve.aguacloud.uk/f/OxzhZ/1379226440410599535.jpg' },
  { name: 'QAQ', url: 'https://aguacloudreve.aguacloud.uk/f/L9pt9/discord_026.gif?raw=true' },
  { name: '嗚 嗚嗚....', url: 'https://aguacloudreve.aguacloud.uk/f/NE6Ux/%E5%97%9A%20%E5%97%9A%E5%97%9A....gif' },
  { name: '海豹嗚嗚', url: 'https://aguacloudreve.aguacloud.uk/f/PVdhN/%E6%B5%B7%E8%B1%B9%E5%97%9A%E5%97%9A.gif' },
  { name: '別丟下我', url: 'https://aguacloudreve.aguacloud.uk/f/7l6tW/%E5%88%A5%E4%B8%9F%E4%B8%8B%E6%88%91.jpg' },
  { name: '為什麼欺負我', url: 'https://aguacloudreve.aguacloud.uk/f/6a8sw/7C8559BAAD836B2DF23272FD78F959F5.jpg' },
  { name: '你忍心嗎', url: 'https://aguacloudreve.aguacloud.uk/f/Q76IY/1428404132045262979.gif' },
  { name: '沒能成為人類', url: 'https://aguacloudreve.aguacloud.uk/f/N55Sx/41B7C2A89850B4FA903E95EBB8BA4C8C.jpg' },
  ]),

  // ── 生氣／憤怒 ────────────────────────────
  ...stickerGroup('angry', [
  { name: '我很生氣（肌肉版）', url: 'https://aguacloudreve.aguacloud.uk/f/znVtg/792AF19A279448BF4F75A995266C7977.gif?raw=true' },
  { name: '你聽過狗叫嗎（生氣版）', url: 'https://aguacloudreve.aguacloud.uk/f/wr9I6/3262A3A397145E6A3A3F027D5A1A387F.png' },
  { name: '我要敲你', url: 'https://aguacloudreve.aguacloud.uk/f/d9Nh9/discord_022.gif?raw=true' },
  { name: '我要鬧了！', url: 'https://aguacloudreve.aguacloud.uk/f/K5zh3/498DD873650FA80636205CEF8B064675.gif?raw=true' },
  { name: '放馬過來', url: 'https://aguacloudreve.aguacloud.uk/f/bmlt6/D35AB02AAE58381D18E2D3482221ACAB.jpg' },
  { name: '怒了一下', url: 'https://aguacloudreve.aguacloud.uk/f/3WKH2/%E6%80%92%E4%BA%86%E4%B8%80%E4%B8%8B.gif' },
  { name: '捏爆你', url: 'https://aguacloudreve.aguacloud.uk/f/E6ZCk/%E6%8D%8F%E7%88%86%E4%BD%A0%28%E6%80%92%29.jpg' },
  { name: '換顆腦袋', url: 'https://aguacloudreve.aguacloud.uk/f/7v4UW/45DEA4EC387B95EA2A5F34D8D99F3331.gif?raw=true' },
  { name: '瘋狂大鬧', url: 'https://aguacloudreve.aguacloud.uk/f/OjRHZ/%E6%88%91%E8%A6%81%E9%AC%A7%E4%BA%86.gif' },
  ]),

  // ── 驚訝／困惑 ────────────────────────────
  ...stickerGroup('surprise', [
  { name: '?什麼?', url: 'https://aguacloudreve.aguacloud.uk/f/AOH1/1342124188646903818.jpg' },
  { name: '貓咪驚嚇', url: 'https://aguacloudreve.aguacloud.uk/f/9Etb/8CED2AE31A02A42120E55308A3545737.gif?raw=true' },
  { name: '頭腦爆炸（當機版）', url: 'https://aguacloudreve.aguacloud.uk/f/gv3iR/72741A1D32090905DF41D991AE2EBBF4.jpg' },
  { name: '啊？', url: 'https://aguacloudreve.aguacloud.uk/f/JxAiO/discord_006.png' },
  { name: '啥？', url: 'https://aguacloudreve.aguacloud.uk/f/x5eFQ/discord_012.gif?raw=true' },
  { name: '你說啥?', url: 'https://aguacloudreve.aguacloud.uk/f/VEbhq/discord_018.gif?raw=true' },
  { name: '驚訝', url: 'https://aguacloudreve.aguacloud.uk/f/vYdtB/EFCB4E72A9437869671A0641480DE6A2.gif?raw=true' },
  { name: 'shockcat', url: 'https://aguacloudreve.aguacloud.uk/f/2BPTx/1408865981035581510.png' },
  { name: '阿巴阿巴', url: 'https://aguacloudreve.aguacloud.uk/f/prRUq/1364565154347352117.gif' },
  { name: '真的嗎', url: 'https://aguacloudreve.aguacloud.uk/f/ZQJFk/%E7%9C%9F%E7%9A%84%E5%97%8E.jpg' },
  { name: '等一下您是人類嗎', url: 'https://aguacloudreve.aguacloud.uk/f/jpXsl/%E7%AD%89%E4%B8%80%E4%B8%8B%E6%82%A8%E6%98%AF%E4%BA%BA%E9%A1%9E%E5%97%8E.jpg' },
  { name: '你說什麼', url: 'https://aguacloudreve.aguacloud.uk/f/ZpJhk/%E4%BD%A0%E8%AA%AA%E4%BB%80%E9%BA%BC.gif' },
  ]),

  // ── 害羞／撒嬌 ────────────────────────────
  ...stickerGroup('shy', [
  { name: '害羞扭扭', url: 'https://aguacloudreve.aguacloud.uk/f/DJ6f2/6382B304F28E0DD95491FF21EB8284C0.gif?raw=true' },
  { name: '心虛', url: 'https://aguacloudreve.aguacloud.uk/f/BBeF7/%E5%BF%83%E8%99%9B.gif' },
  { name: '這有點那啥了', url: 'https://aguacloudreve.aguacloud.uk/f/dNF9/06E94D3228758EB161513309A0A5F246.jpg' },
  { name: '開心又害羞', url: 'https://aguacloudreve.aguacloud.uk/f/92yUb/%E9%96%8B%E5%BF%83%E5%8F%88%E5%AE%B3%E7%BE%9E.gif' },
  { name: '求夸夸', url: 'https://aguacloudreve.aguacloud.uk/f/rONip/%E6%B1%82%E8%A1%A8%E6%8F%9A.gif' },
  { name: '我像狗一樣求你', url: 'https://aguacloudreve.aguacloud.uk/f/8RzIe/%E6%88%91%E5%83%8F%E7%8B%97%E4%B8%80%E6%A8%A3%E6%B1%82%E4%BD%A0.jpg' },
  { name: '高高舉起', url: 'https://aguacloudreve.aguacloud.uk/f/kvduL/1331696006269505576.jpg' },
  { name: '搖擺', url: 'https://aguacloudreve.aguacloud.uk/f/5jsp/B36F5F9652D3E7A5263F7F3E5E4658D2.gif?raw=true' },
  ]),

  // ── 疲憊／無奈 ────────────────────────────
  ...stickerGroup('tired', [
  { name: '嘛...', url: 'https://aguacloudreve.aguacloud.uk/f/Xkhk/1369896376212656180.jpg' },
  { name: '我看開了', url: 'https://aguacloudreve.aguacloud.uk/f/blC6/1338692131232940072.jpg' },
  { name: '疲憊', url: 'https://aguacloudreve.aguacloud.uk/f/PrkHN/462DC450B0F7AA374A1C611B0998CDEF.png' },
  { name: '疲憊呆滯貓', url: 'https://aguacloudreve.aguacloud.uk/f/m6QSw/0C202AE4530156C6FDC308EEB0C9E906.jpg' },
  { name: '我睡不著', url: 'https://aguacloudreve.aguacloud.uk/f/zZxSg/%E6%88%91%E7%9D%A1%E4%B8%8D%E8%91%97.jpg' },
  { name: '(沉默)', url: 'https://aguacloudreve.aguacloud.uk/f/43OiQ/discord_042.gif?raw=true' },
  { name: '安詳離世', url: 'https://aguacloudreve.aguacloud.uk/f/r8Ntp/%E5%AE%89%E8%A9%B3%E9%9B%A2%E4%B8%96.jpg' },
  { name: '我不聽，這不一樣', url: 'https://aguacloudreve.aguacloud.uk/f/aQXCB/ACB881C4CB07625DFFB7B66BA8BE4BE5.jpg' },
  ]),

  // ── 搞怪／整蠱 ────────────────────────────
  ...stickerGroup('mischief', [
  { name: 'u~嚇嚇你', url: 'https://aguacloudreve.aguacloud.uk/f/4OCQ/6BC5361AFF317ECDDBD9741ACE061B86.gif?raw=true' },
  { name: '眨眨眼', url: 'https://aguacloudreve.aguacloud.uk/f/LpH9/7ABB6102E33AF94E3F509DA9E95D5B8F.gif?raw=true' },
  { name: '對你做鬼臉', url: 'https://aguacloudreve.aguacloud.uk/f/vzYiB/15C37783A047725DAE55503B0E92A90F.gif?raw=true' },
  { name: '一陣強勁的吱吱', url: 'https://aguacloudreve.aguacloud.uk/f/lDS9/0C0A43DDFE93EDBF82D7810CF0DA25D1.jpg' },
  { name: '光速跑走', url: 'https://aguacloudreve.aguacloud.uk/f/ZyQuk/92B72B14B0C7594E578DAA29319014D5.gif?raw=true' },
  { name: '這是精神攻擊', url: 'https://aguacloudreve.aguacloud.uk/f/6vjsw/emotional-damage.gif' },
  { name: '你看著我的眼睛！', url: 'https://aguacloudreve.aguacloud.uk/f/2PlFx/1338759788615569460.jpg' },
  { name: '我們不要學他', url: 'https://aguacloudreve.aguacloud.uk/f/P3dTN/%E6%88%91%E5%80%91%E4%B8%8D%E8%A6%81%E5%AD%B8%E4%BB%96.jpg' },
  { name: '吃吃瓜', url: 'https://aguacloudreve.aguacloud.uk/f/1WYTQ/DB90CAF7311460DCA2A1FC8F14CE7B8D.gif?raw=true' },
  ]),

  // ── 求助／緊張 ────────────────────────────
  ...stickerGroup('sos', [
  { name: 'HELP', url: 'https://aguacloudreve.aguacloud.uk/f/A2Os1/discord_008.gif?raw=true' },
  { name: 'SOS', url: 'https://aguacloudreve.aguacloud.uk/f/x6jsQ/SOS.jpg' },
  { name: '啊（完蛋了）', url: 'https://aguacloudreve.aguacloud.uk/f/NvJSx/FD87039D3A3982E3FBCF56C976A477C4.gif?raw=true' },
  { name: '我不要我不要', url: 'https://aguacloudreve.aguacloud.uk/f/xeiQ/7A85C9080D7539A7D88812DE36A3A7E2.gif?raw=true' },
  { name: '貓查覺到了不對勁', url: 'https://aguacloudreve.aguacloud.uk/f/q3kuz/33002E8A41FED8839984FAF7AF47EA06.jpg' },
  ]),

  // ── 可愛動作 ──────────────────────────────
  ...stickerGroup('cute_action', [
  { name: '揉揉自己的臉', url: 'https://aguacloudreve.aguacloud.uk/f/kdsL/1239411374015381524%20%281%29.jpg' },
  { name: '貓貓看你', url: 'https://aguacloudreve.aguacloud.uk/f/2lUx/1364263177944170536.jpg' },
  { name: '貓貓搖屁股', url: 'https://aguacloudreve.aguacloud.uk/f/QvefY/07697D3476D1419CD2ACCE47A6617E3B.gif' },
  { name: '地板打滾', url: 'https://aguacloudreve.aguacloud.uk/f/jBIl/9D59402CFB98C107A75C2B0DBB30CEBD.gif?raw=true' },
  { name: '撓撓頭', url: 'https://aguacloudreve.aguacloud.uk/f/3PT2/9A7CA4A53723E4901CF97BBDA70812F9.gif?raw=true' },
  { name: '搖尾巴', url: 'https://aguacloudreve.aguacloud.uk/f/8Bzfe/%E6%90%96%E5%B0%BE%E5%B7%B4.gif' },
  { name: '點頭點頭', url: 'https://aguacloudreve.aguacloud.uk/f/v9bSB/%E9%BB%9E%E9%A0%AD%E9%BB%9E%E9%A0%AD.gif' },
  { name: '搓揉團子', url: 'https://aguacloudreve.aguacloud.uk/f/EyZfk/%E6%90%93%E6%8F%89%E5%9C%98%E5%AD%90.gif' },
  { name: '撫摸毛球', url: 'https://aguacloudreve.aguacloud.uk/f/KXgi3/%E6%92%AB%E6%91%B8%E6%AF%9B%E7%90%83.gif' },
  { name: '摸摸小貓', url: 'https://aguacloudreve.aguacloud.uk/f/wR2s6/%E6%91%B8%E6%91%B8%E5%B0%8F%E8%B2%93.gif' },
  { name: '高速旋轉攪拌貓', url: 'https://aguacloudreve.aguacloud.uk/f/V6QFq/%E6%94%AA%E6%8B%8C%E8%B2%93.gif' },
  { name: '貓吃巧克力死掉了', url: 'https://aguacloudreve.aguacloud.uk/f/nEKsd/%E8%B2%93%E5%90%83%E5%B7%A7%E5%85%8B%E5%8A%9B%E6%AD%BB%E6%8E%89%E4%BA%86.gif' },
  ]),

  // ── 飲食 ──────────────────────────────────
  ...stickerGroup('food', [
  { name: '謝謝你的食物', url: 'https://aguacloudreve.aguacloud.uk/f/pE9Uq/009012075DBB7089B73DAD23924580EB.gif?raw=true' },
  { name: '餓死了', url: 'https://aguacloudreve.aguacloud.uk/f/YE6TW/4752DCEA75F4D16DD405EF4FB4186E17.gif?raw=true' },
  { name: '我能吃下一頭牛', url: 'https://aguacloudreve.aguacloud.uk/f/68quw/%E6%88%91%E8%83%BD%E5%90%83%E4%B8%8B%E4%B8%80%E9%A0%AD%E7%89%9B.png' },
  { name: '大口吃肉', url: 'https://aguacloudreve.aguacloud.uk/f/lE1H9/%E5%A4%A7%E5%90%83%E9%A6%99%E8%85%B8%E8%B2%93.gif' },
  { name: '嚼嚼嚼', url: 'https://aguacloudreve.aguacloud.uk/f/ygVim/%E5%9A%BC%E5%9A%BC%E5%9A%BC.gif' },
  ]),

  // ── 成人向 ────────────────────────────────
  ...stickerGroup('nsfw', [
  { name: '按摩棒', url: 'https://aguacloudreve.aguacloud.uk/f/53jtp/discord_029.gif?raw=true' },
  { name: '不想做愛', url: 'https://aguacloudreve.aguacloud.uk/f/nnDHd/discord_014.gif?raw=true' },
  { name: '跳蛋', url: 'https://aguacloudreve.aguacloud.uk/f/97Efb/discord_043.gif?raw=true' },
  { name: '寶貝我來了', url: 'https://aguacloudreve.aguacloud.uk/f/j1BFl/discord_067.gif?raw=true' },
  { name: '我下面很愛你', url: 'https://aguacloudreve.aguacloud.uk/f/vYYTB/discord_066.png' },
  { name: '打屁股用拍子', url: 'https://aguacloudreve.aguacloud.uk/f/6v8uw/discord_073.gif?raw=true' },
  { name: '子彈型跳蛋', url: 'https://aguacloudreve.aguacloud.uk/f/724TW/discord_074.gif?raw=true' },
  { name: '屁屁發光', url: 'https://aguacloudreve.aguacloud.uk/f/K6zI3/discord_078.png' },
  { name: '我要操你屁股', url: 'https://aguacloudreve.aguacloud.uk/f/RRdUd/E516DE016CF4F1514F293AEFBD4AF893.jpg' },
  { name: '我的下面不好惹，快跟他求饒', url: 'https://aguacloudreve.aguacloud.uk/f/zZPcg/76CB60947C0FE11097FE700672D628B2.jpg' },
  { name: '吸你奶子', url: 'https://aguacloudreve.aguacloud.uk/f/bbOS6/%E5%90%B8%E4%BD%A0%E5%A5%B6%E5%AD%90.gif' },
  { name: '正在製作淫穢物品', url: 'https://aguacloudreve.aguacloud.uk/f/1qbSQ/%E6%AD%A3%E5%9C%A8%E8%A3%BD%E4%BD%9C%E6%B7%AB%E7%A9%A2%E7%89%A9%E5%93%81.jpg' },
  { name: '正在飲用春藥', url: 'https://aguacloudreve.aguacloud.uk/f/eL5fp/%E6%AD%A3%E5%9C%A8%E5%BC%95%E7%94%A8%E6%98%A5%E8%97%A5.jpg' },
  { name: '嘿嘿我要摸你', url: 'https://aguacloudreve.aguacloud.uk/f/4qDTQ/%E5%98%BF%E5%98%BF%E8%AE%93%E6%88%91%E6%91%B8%E6%91%B8%E4%BD%A0.jpg' },
  { name: '準備品鑑', url: 'https://aguacloudreve.aguacloud.uk/f/L4jh9/%E6%BA%96%E5%82%99%E5%93%81%E9%91%91.gif' },
  { name: '把玩你', url: 'https://aguacloudreve.aguacloud.uk/f/N96ix/%E6%8A%8A%E7%8E%A9%E4%BD%A0.gif' },
  { name: '讓我摸摸你', url: 'https://aguacloudreve.aguacloud.uk/f/WWvfQ/%E8%AE%93%E6%88%91%E6%91%B8%E6%91%B8%E4%BD%A0.jpg' },
  ]),

  // ── 雜項／符號 ────────────────────────────
  ...stickerGroup('misc', [
  { name: '靈火', url: 'https://aguacloudreve.aguacloud.uk/f/Nv5cx/discord_049.png' },
  { name: '骷髏頭', url: 'https://aguacloudreve.aguacloud.uk/f/ZaQhk/discord_077.png' },
  { name: '鑽石', url: 'https://aguacloudreve.aguacloud.uk/f/PPkiN/discord_089.png' },
  { name: '哥布林要飯', url: 'https://aguacloudreve.aguacloud.uk/f/8vJfe/discord_098.png' },
  { name: '我是什麼很賤的人嗎', url: 'https://aguacloudreve.aguacloud.uk/f/RRPFd/discord_075.png' },
  { name: '我在拉屎', url: 'https://aguacloudreve.aguacloud.uk/f/XQWCk/%E6%88%91%E5%9C%A8%E6%8B%89%E5%B1%8E.jpg' },
  ]),
];

/**
 * 预设表情包分类名称
 * 可以修改这个名称来自定义表情包分类的显示名称
 */
export const DEFAULT_CATEGORY_NAME = '我的表情';

export const DEFAULT_CATEGORY_ID = 'default-pack';

/**
 * 预设表情包分类图标
 * 使用 Material Design Icons (iconify)
 * 推荐图标：
 * - mdi:folder-outline (线框文件夹)
 * - mdi:folder-heart-outline (爱心文件夹)
 * - mdi:folder-star-outline (星星文件夹)
 * - mdi:image-multiple-outline (多图片)
 * - mdi:sticker-emoji (贴纸)
 */
export const DEFAULT_CATEGORY_ICON = 'mdi:folder-outline';
