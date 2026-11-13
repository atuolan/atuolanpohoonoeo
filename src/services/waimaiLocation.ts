import { WORLD_CITIES } from "../data/worldCities";
import type { WaimaiDestinationSnapshot } from "../types/waimaiDelivery";

/**
 * 外賣收貨地：不用地址簿，直接用「收件人在哪」。
 * - 送給自己：天氣設定裡的城市
 * - 送給角色：角色設定的所在地（角色搬家、旅行時會自己更新）
 * 地點是自由文字，這裡負責認出國家（決定走就近／國內／跨境）和城市（顯示用）。
 */

interface CountryInfo {
  code: string;
  name: string;
  /** 文字裡出現這些字就算這個國家（WORLD_CITIES 的國家名會自動加進來） */
  aliases: string[];
}

const COUNTRIES: CountryInfo[] = [
  { code: "TW", name: "台灣", aliases: ["台灣", "臺灣", "台湾", "taiwan"] },
  { code: "JP", name: "日本", aliases: ["日本", "japan"] },
  { code: "KR", name: "韓國", aliases: ["韓國", "韩国", "南韓", "korea"] },
  { code: "HK", name: "香港", aliases: ["香港", "hong kong"] },
  { code: "MO", name: "澳門", aliases: ["澳門", "澳门", "macau", "macao"] },
  { code: "CN", name: "中國", aliases: ["中國", "中国", "大陸", "大陆", "china"] },
  { code: "SG", name: "新加坡", aliases: ["新加坡", "singapore"] },
  { code: "MY", name: "馬來西亞", aliases: ["馬來西亞", "马来西亚", "malaysia"] },
  { code: "TH", name: "泰國", aliases: ["泰國", "泰国", "thailand"] },
  { code: "VN", name: "越南", aliases: ["越南", "vietnam", "viet nam"] },
  { code: "PH", name: "菲律賓", aliases: ["菲律賓", "菲律宾", "philippines"] },
  { code: "ID", name: "印尼", aliases: ["印尼", "印度尼西亞", "indonesia"] },
  { code: "IN", name: "印度", aliases: ["印度", "india"] },
  {
    code: "US",
    name: "美國",
    aliases: ["美國", "美国", "united states", "usa", "america"],
  },
  { code: "CA", name: "加拿大", aliases: ["加拿大", "canada"] },
  {
    code: "GB",
    name: "英國",
    aliases: ["英國", "英国", "united kingdom", "england", "scotland", "britain"],
  },
  { code: "FR", name: "法國", aliases: ["法國", "法国", "france"] },
  { code: "DE", name: "德國", aliases: ["德國", "德国", "germany"] },
  { code: "IT", name: "義大利", aliases: ["義大利", "意大利", "italy"] },
  { code: "ES", name: "西班牙", aliases: ["西班牙", "spain"] },
  { code: "NL", name: "荷蘭", aliases: ["荷蘭", "荷兰", "netherlands"] },
  { code: "CH", name: "瑞士", aliases: ["瑞士", "switzerland"] },
  { code: "AT", name: "奧地利", aliases: ["奧地利", "奥地利", "austria"] },
  { code: "PT", name: "葡萄牙", aliases: ["葡萄牙", "portugal"] },
  { code: "GR", name: "希臘", aliases: ["希臘", "希腊", "greece"] },
  { code: "CZ", name: "捷克", aliases: ["捷克", "czech"] },
  { code: "PL", name: "波蘭", aliases: ["波蘭", "波兰", "poland"] },
  { code: "HU", name: "匈牙利", aliases: ["匈牙利", "hungary"] },
  { code: "NO", name: "挪威", aliases: ["挪威", "norway"] },
  { code: "SE", name: "瑞典", aliases: ["瑞典", "sweden"] },
  { code: "DK", name: "丹麥", aliases: ["丹麥", "丹麦", "denmark"] },
  { code: "FI", name: "芬蘭", aliases: ["芬蘭", "芬兰", "finland"] },
  { code: "IS", name: "冰島", aliases: ["冰島", "冰岛", "iceland"] },
  { code: "RU", name: "俄羅斯", aliases: ["俄羅斯", "俄罗斯", "russia"] },
  { code: "AU", name: "澳洲", aliases: ["澳洲", "澳大利亞", "australia"] },
  { code: "NZ", name: "紐西蘭", aliases: ["紐西蘭", "新西蘭", "new zealand"] },
  { code: "AE", name: "阿聯酋", aliases: ["阿聯酋", "杜拜", "dubai", "emirates"] },
  { code: "TR", name: "土耳其", aliases: ["土耳其", "turkey", "türkiye"] },
  { code: "IL", name: "以色列", aliases: ["以色列", "israel"] },
  { code: "EG", name: "埃及", aliases: ["埃及", "egypt"] },
  { code: "ZA", name: "南非", aliases: ["南非", "south africa"] },
  { code: "BR", name: "巴西", aliases: ["巴西", "brazil"] },
  { code: "MX", name: "墨西哥", aliases: ["墨西哥", "mexico"] },
  { code: "AR", name: "阿根廷", aliases: ["阿根廷", "argentina"] },
];

/** 常見城市的英文名，角色所在地常寫成 "Tokyo" 這種 */
const ENGLISH_CITIES: Array<{ alias: string; city: string; code: string }> = [
  { alias: "taipei", city: "台北", code: "TW" },
  { alias: "kaohsiung", city: "高雄", code: "TW" },
  { alias: "taichung", city: "台中", code: "TW" },
  { alias: "tokyo", city: "東京", code: "JP" },
  { alias: "osaka", city: "大阪", code: "JP" },
  { alias: "kyoto", city: "京都", code: "JP" },
  { alias: "seoul", city: "首爾", code: "KR" },
  { alias: "busan", city: "釜山", code: "KR" },
  { alias: "beijing", city: "北京", code: "CN" },
  { alias: "shanghai", city: "上海", code: "CN" },
  { alias: "bangkok", city: "曼谷", code: "TH" },
  { alias: "new york", city: "紐約", code: "US" },
  { alias: "los angeles", city: "洛杉磯", code: "US" },
  { alias: "san francisco", city: "舊金山", code: "US" },
  { alias: "london", city: "倫敦", code: "GB" },
  { alias: "paris", city: "巴黎", code: "FR" },
  { alias: "berlin", city: "柏林", code: "DE" },
  { alias: "sydney", city: "雪梨", code: "AU" },
];

/** 斯堪地那維亞在城市清單裡是一組，國家寫在城市名的括號裡 */
const SCANDINAVIA_KEY = "斯堪地那維亞";

const DEFAULT_COUNTRY = COUNTRIES[0];

function findCountryByName(name: string): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.name === name || c.aliases.includes(name));
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** 去掉「（挪威）」這種括號註記 */
function stripNote(name: string): string {
  return name.replace(/（.*?）|\(.*?\)/g, "").trim();
}

export interface ResolvedPlace {
  countryCode: string;
  countryName: string;
  /** 顯示用城市；認不出時是使用者原本寫的第一段 */
  city: string;
}

/** 從自由文字認出國家與城市；連國家都認不出就回傳 null。 */
export function resolvePlaceText(text: string | undefined | null): ResolvedPlace | null {
  const raw = (text || "").trim();
  if (!raw) return null;
  const lower = normalize(raw);
  const firstPart = raw.split(/[,，、]/)[0].trim();

  // 1. 文字裡直接寫了國家
  for (const country of COUNTRIES) {
    if (country.aliases.some((a) => lower.includes(a.toLowerCase()))) {
      const cityMatch = findCityInCountry(raw, country);
      // 只寫了國家（例如「日本」）時城市留空
      const city = cityMatch ?? (isCountryOnly(firstPart, country) ? "" : firstPart);
      return { countryCode: country.code, countryName: country.name, city };
    }
  }

  // 2. 只寫城市：比對城市清單（中文）
  for (const [countryKey, cities] of Object.entries(WORLD_CITIES)) {
    for (const c of cities) {
      const cityName = stripNote(c.name);
      if (cityName.length < 2) continue;
      const short = cityName.replace(/[市縣]$/, "");
      if (raw.includes(cityName) || (short.length >= 2 && raw.includes(short))) {
        const country =
          countryKey === SCANDINAVIA_KEY
            ? findCountryByName(c.name.match(/（(.+?)）/)?.[1] ?? "") ?? findCountryByName("瑞典")!
            : findCountryByName(countryKey);
        if (country) {
          return { countryCode: country.code, countryName: country.name, city: cityName };
        }
      }
    }
  }

  // 3. 英文城市名
  for (const e of ENGLISH_CITIES) {
    if (lower.includes(e.alias)) {
      const country = COUNTRIES.find((c) => c.code === e.code)!;
      return { countryCode: country.code, countryName: country.name, city: e.city };
    }
  }

  return null;
}

function isCountryOnly(part: string, country: CountryInfo): boolean {
  const p = normalize(part);
  return p === country.name.toLowerCase() || country.aliases.some((a) => a.toLowerCase() === p);
}

function findCityInCountry(raw: string, country: CountryInfo): string | null {
  const key = Object.keys(WORLD_CITIES).find((k) => findCountryByName(k)?.code === country.code);
  const lower = normalize(raw);
  if (key) {
    for (const c of WORLD_CITIES[key]) {
      const cityName = stripNote(c.name);
      const short = cityName.replace(/[市縣]$/, "");
      if (raw.includes(cityName) || (short.length >= 2 && raw.includes(short))) return cityName;
    }
  }
  const english = ENGLISH_CITIES.find((e) => e.code === country.code && lower.includes(e.alias));
  return english ? english.city : null;
}

export type WaimaiRecipientKind = "me" | "char";

export interface RecipientDestinationInput {
  recipient: WaimaiRecipientKind;
  /** 角色名字（送給角色時當收件人） */
  charName: string;
  /** 角色設定的所在地 */
  charPlace?: string | null;
  /** 使用者在天氣設定的城市（可能帶國家） */
  userPlace?: string | null;
  /** 這一單手動改的地點（只用這一次） */
  overridePlace?: string | null;
}

export interface RecipientDestinationResult {
  destination: WaimaiDestinationSnapshot;
  /** 用了替代地點時的說明；正常時為空字串 */
  note: string;
}

/**
 * 依收件人決定收貨地。永遠回傳一個可用的地點，不讓下單卡住：
 * - 角色沒設所在地 → 當成在使用者附近
 * - 使用者沒設城市 → 用台灣
 * - 有寫地點但認不出國家 → 當成國內（跟使用者同一國，沒有就台灣）
 */
export function buildRecipientDestination(
  input: RecipientDestinationInput,
): RecipientDestinationResult {
  const recipientName = input.recipient === "me" ? "我" : input.charName;
  const userResolved = resolvePlaceText(input.userPlace);
  const homeCountry: ResolvedPlace = userResolved ?? {
    countryCode: DEFAULT_COUNTRY.code,
    countryName: DEFAULT_COUNTRY.name,
    city: "",
  };

  const make = (place: ResolvedPlace, note: string): RecipientDestinationResult => ({
    destination: {
      source: "recipient",
      recipientName,
      countryCode: place.countryCode,
      countryName: place.countryName,
      city: place.city,
      addressLine: "",
    },
    note,
  });

  const override = (input.overridePlace || "").trim();
  if (override) {
    const resolved = resolvePlaceText(override);
    if (resolved) return make(resolved, "");
    return make(
      { ...homeCountry, city: override },
      `認不出「${override}」在哪個國家，先當成${homeCountry.countryName}國內。`,
    );
  }

  if (input.recipient === "char") {
    const charPlace = (input.charPlace || "").trim();
    if (!charPlace) {
      return make(
        homeCountry,
        userResolved
          ? `${input.charName} 還沒設定所在地，先當成在你附近。`
          : `${input.charName} 還沒設定所在地，先用${homeCountry.countryName}計算。`,
      );
    }
    const resolved = resolvePlaceText(charPlace);
    if (resolved) return make(resolved, "");
    return make(
      { ...homeCountry, city: charPlace.split(/[,，]/)[0].trim() },
      `認不出「${charPlace}」在哪個國家，先當成${homeCountry.countryName}國內。`,
    );
  }

  const userPlace = (input.userPlace || "").trim();
  if (!userPlace) {
    return make(homeCountry, "還沒設定你的城市（天氣設定），先用台灣計算。");
  }
  if (userResolved) return make(userResolved, "");
  return make(
    { ...homeCountry, city: userPlace.split(/[,，]/)[0].trim() },
    `認不出「${userPlace}」在哪個國家，先用台灣計算。`,
  );
}

/** 卡片與訊息上的收貨地文字：國家＋城市（＋舊訂單的詳細地址） */
export function formatWaimaiDestination(
  destination: Pick<WaimaiDestinationSnapshot, "countryName" | "city" | "addressLine"> | undefined,
): string {
  if (!destination) return "";
  const place = [destination.countryName, destination.city].filter(Boolean).join(" ");
  return destination.addressLine ? `${place}｜${destination.addressLine}` : place;
}
