/**
 * 內建篝火面對面預設的面板配置
 *
 * 條目以 identifier 引用；條目改名不影響面板。
 * 重置面對面提示詞時，面板配置會一併重置成這份。
 */
import type { F2FPanelLayout } from "@/types/f2fPanel";

const FOREIGN_REQUIRED = "f2f_custom_1790597154035"; // 【對白萬國語言】（外語必開）

export const DEFAULT_F2F_PANEL_LAYOUT: F2FPanelLayout = {
  version: 1,
  modules: [
    {
      id: "pov",
      title: "視角",
      mode: "single",
      allowNone: false,
      options: [
        { id: "user_first", label: "用戶第一人稱", entries: ["f2f_custom_1790012657776"] },
        { id: "user_second", label: "用戶第二人稱", entries: ["f2f_custom_1790012657808"] },
        { id: "user_third", label: "用戶第三人稱", entries: ["f2f_custom_1790012657841"] },
        { id: "char_first", label: "角色第一人稱", entries: ["f2f_custom_1790012657874"] },
        { id: "char_second", label: "角色第二人稱", entries: ["f2f_custom_1790012657907"] },
        { id: "char_third", label: "角色第三人稱", entries: ["f2f_custom_1790012657941"] },
      ],
    },
    {
      id: "ghost",
      title: "轉述代筆",
      mode: "single",
      allowNone: false,
      options: [
        { id: "strict", label: "完全不可搶話代筆", entries: ["f2f_custom_1790012658057"] },
        { id: "transcribe", label: "僅轉述潤色", entries: ["f2f_custom_1790012658094"] },
        { id: "novel", label: "完整小說代筆・轉述版", entries: ["f2f_custom_1790012658129"] },
        { id: "direct", label: "完整小說代筆・直接延續版", entries: ["f2f_custom_1790012658166"] },
      ],
    },
    {
      id: "tone",
      title: "文學主調",
      mode: "multi",
      allowNone: false,
      options: [
        { id: "tension", label: "拉扯調調", entries: ["f2f_custom_1790012658277"] },
        { id: "ambiguous", label: "曖昧調調", entries: ["f2f_custom_1790012658314"] },
        { id: "daily", label: "日常調調", entries: ["f2f_custom_1790012658352"] },
        { id: "bitter", label: "酸澀調調", entries: ["f2f_custom_1790012658390"] },
        { id: "sweet", label: "甜寵調調", entries: ["f2f_custom_1790012658430"] },
      ],
    },
    {
      id: "style",
      title: "文學風格",
      mode: "single",
      allowNone: false,
      options: [
        { id: "adaptive", label: "自適應文風", entries: ["f2f_custom_1790012658550"] },
        { id: "plain", label: "白描暗湧", entries: ["f2f_custom_1790012658590"] },
        { id: "warm", label: "溫厚留白", entries: ["f2f_custom_1790012658633"] },
        { id: "ambiguous", label: "曖昧拉扯", entries: ["f2f_custom_1790012658675"] },
        { id: "classical", label: "古風言情", entries: ["f2f_custom_1790012658718"] },
        { id: "wuxia", label: "江湖武俠", entries: ["f2f_custom_1790012658761"] },
      ],
    },
    {
      id: "body",
      title: "女性描寫",
      mode: "single",
      allowNone: false,
      options: [
        { id: "general", label: "女性通用描寫", entries: ["f2f_custom_1790012658940"] },
        { id: "plump", label: "棉花糖女孩", entries: ["f2f_custom_1790012658985"] },
        { id: "pregnant", label: "有孕姑娘", entries: ["f2f_custom_1790012659032"] },
      ],
    },
    {
      id: "beauty",
      title: "親密加強",
      mode: "multi",
      allowNone: false,
      options: [{ id: "enhanced", label: "女性美(提高親密描寫)", entries: ["f2f_custom_1790012658896"] }],
    },
    {
      id: "lust",
      title: "淫慾風格",
      mode: "multi",
      allowNone: false,
      options: [
        { id: "tension", label: "針鋒相對", entries: ["f2f_custom_1790012659474"] },
        { id: "impact", label: "高度衝擊與言語羞辱風", entries: ["f2f_custom_1790012659525"] },
        { id: "classical", label: "古風雲雨", entries: ["f2f_custom_1790012659577"] },
        { id: "modern", label: "現代文雅", entries: ["f2f_custom_1790012659631"] },
        { id: "sm", label: "中度SM與心理支配", entries: ["f2f_custom_1790012659684"] },
        { id: "gentle", label: "溫柔直白", entries: ["f2f_custom_1790012659738"] },
      ],
    },
    {
      id: "lang",
      title: "輸出語言",
      mode: "single",
      allowNone: false,
      options: [
        { id: "simplified", label: "簡體中文", entries: ["f2f_custom_1790012660070"] },
        { id: "traditional", label: "繁體中文", entries: ["f2f_custom_1790012660127"] },
      ],
    },
    {
      id: "dialogue",
      title: "對白外語",
      mode: "single",
      allowNone: true,
      options: [
        { id: "english", label: "英文", entries: ["f2f_custom_1790597153852", FOREIGN_REQUIRED] },
        { id: "japanese", label: "日文", entries: ["f2f_custom_1790597153918", FOREIGN_REQUIRED] },
        { id: "korean", label: "韓文", entries: ["f2f_custom_1790597153976", FOREIGN_REQUIRED] },
      ],
    },
  ],
  styles: [
    {
      id: "preset_tension",
      name: "預設拉扯",
      desc: "拉扯＋曖昧主調，自適應文風，針鋒相對的親密筆法。",
      selections: { tone: ["tension", "ambiguous"], style: ["adaptive"], body: ["general"], beauty: ["enhanced"], lust: ["tension"] },
    },
    {
      id: "preset_daily",
      name: "溫柔日常",
      desc: "日常主調，溫厚留白風格，溫柔直白親密筆法。",
      selections: { tone: ["daily"], style: ["warm"], body: ["general"], beauty: [], lust: ["gentle"] },
    },
    {
      id: "preset_classical",
      name: "古風雲雨",
      desc: "古風言情＋古風雲雨親密風格，甜寵調調。",
      selections: { tone: ["sweet"], style: ["classical"], body: ["general"], beauty: [], lust: ["classical"] },
    },
    {
      id: "preset_ambiguous",
      name: "曖昧拉扯",
      desc: "曖昧拉扯文風＋現代文雅親密，把張力留在未說破的距離裡。",
      selections: { tone: ["tension", "ambiguous"], style: ["ambiguous"], body: ["general"], beauty: ["enhanced"], lust: ["modern"] },
    },
    {
      id: "preset_plain",
      name: "白描暗湧",
      desc: "白描暗湧文風＋酸澀調調，鏡頭克制但情緒直給。",
      selections: { tone: ["bitter"], style: ["plain"], body: ["general"], beauty: [], lust: ["modern"] },
    },
    {
      id: "preset_dominant",
      name: "支配調教",
      desc: "白描暗湧文風，針鋒相對＋高度衝擊與言語羞辱風的強烈親密筆法。若與角色設定或用戶偏好衝突，切回其它風格即可恢復。",
      selections: { style: ["plain"], body: ["general"], beauty: ["enhanced"], lust: ["tension", "impact"] },
    },
  ],
};
