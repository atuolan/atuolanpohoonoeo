<script setup lang="ts">
/**
 * 棉花娃娃（正面、固定姿勢）：依造型分層畫出來，表情會跟著碰觸變
 * 座標：viewBox 0 0 240 340；部位熱區對齊這套座標（見 DOLL_ZONE_SHAPES）
 */
import { computed } from "vue";
import {
  outlineOf,
  shade,
  skinColorOf,
  TOP_STYLES,
  type DollLook,
} from "@/data/dollWardrobe";

const props = withDefaults(
  defineProps<{
    look: DollLook;
    /** 正在做的動作（戳、捏…），沒有就是平常表情 */
    reaction?: string | null;
    /** 臉紅程度 0～1 */
    flush?: number;
  }>(),
  { reaction: null, flush: 0 },
);

const uid = `doll-${Math.random().toString(36).slice(2, 8)}`;
const paint = (name: string) => `url(#${uid}-${name})`;

const skin = computed(() => skinColorOf(props.look));
const skinLine = computed(() => outlineOf(skin.value));
const hair = computed(() => props.look.hairColor);
const hairLine = computed(() => outlineOf(hair.value));
const top = computed(() => props.look.topColor);
const topLine = computed(() => outlineOf(top.value));
const bottom = computed(() => props.look.bottomColor);
const bottomLine = computed(() => outlineOf(bottom.value));
const shoes = computed(() => props.look.shoesColor);
const shoesLine = computed(() => outlineOf(shoes.value));
const acc = computed(() => props.look.accessoryColor);
const accLine = computed(() => outlineOf(acc.value));

const fullBody = computed(() => !!TOP_STYLES.find((t) => t.id === props.look.top)?.fullBody);
const showBottom = computed(() => !fullBody.value && props.look.bottom !== "none");
/** 吊帶褲的吊帶要蓋在上衣上面 */
const bottomOverTop = computed(() => props.look.bottom === "overalls");

const eyeL = computed(() => 86 - props.look.tune.eyeGap);
const eyeR = computed(() => 154 + props.look.tune.eyeGap);
const EYE_Y = 133;

/** 碰觸時的表情 */
const eyeMode = computed(() => {
  switch (props.reaction) {
    case "pinch":
    case "bite":
    case "lick":
    case "tickle":
    case "suck":
      return "squeeze";
    case "poke":
    case "blow":
    case "pat":
      return "surprised";
    case "stroke":
    case "kiss":
    case "hug":
    case "knead":
      return "happy";
    default:
      return props.look.eyes;
  }
});
const mouthMode = computed(() => {
  switch (props.reaction) {
    case "poke":
    case "blow":
    case "pat":
    case "suck":
      return "o";
    case "kiss":
      return "kiss";
    case "pinch":
    case "bite":
    case "tickle":
    case "knead":
      return "wavy";
    case "lick":
      return "tongue";
    default:
      return props.look.mouth;
  }
});
const blushOpacity = computed(() =>
  Math.min(0.95, (props.look.blush ? 0.42 : 0) + Math.max(0, Math.min(1, props.flush)) * 0.5),
);

const hairY = computed(() => props.look.tune.hairY);
const accTransform = computed(() => {
  const { accY, accScale } = props.look.tune;
  return `translate(120 ${70 + accY}) scale(${accScale}) translate(-120 -70)`;
});

/** 下面的 path 都是手調的；改形狀時記得部位熱區要一起對 */
const HAIR_BACK: Record<string, string> = {
  bob: "M22 126 C18 52 64 22 120 22 C176 22 222 52 218 126 L218 178 C206 192 188 188 182 172 L182 128 L58 128 L58 172 C52 188 34 192 22 178 Z",
  long: "M22 126 C18 52 64 22 120 22 C176 22 222 52 218 126 L228 262 C212 278 186 272 176 256 L176 150 L64 150 L64 256 C54 272 28 278 12 262 Z",
  bun: "M24 122 C20 52 66 24 120 24 C174 24 220 52 216 122 L208 142 L32 142 Z",
  twintails: "M24 122 C20 52 66 24 120 24 C174 24 220 52 216 122 L208 142 L32 142 Z",
  short: "M26 124 C22 54 66 24 120 24 C174 24 218 54 214 124 L206 134 L34 134 Z",
};
const HAIR_FRONT: Record<string, string> = {
  bob: "M28 118 C26 50 70 26 120 26 C170 26 214 50 212 118 C204 98 190 88 176 98 C168 80 150 74 138 90 C128 74 110 72 100 90 C88 76 70 80 64 98 C50 90 36 100 28 118 Z",
  // 瀏海和兩側髮束是同一塊，從頭頂順下來
  long: "M34 190 C25 166 23 136 27 108 C30 50 70 26 120 26 C170 26 210 50 213 108 C217 136 215 166 206 190 C200 193 192 188 192 180 L193 106 C170 94 146 90 120 90 C94 90 70 94 47 106 L48 180 C48 188 40 193 34 190 Z",
  bun: "M28 120 C26 50 70 26 120 26 C170 26 214 50 212 120 C200 92 176 78 150 80 C128 82 110 92 98 104 C86 96 70 92 56 96 C44 100 34 108 28 120 Z",
  twintails: "M28 118 C26 50 70 26 120 26 C170 26 214 50 212 118 C204 98 190 88 176 98 C168 80 150 74 138 90 C128 74 110 72 100 90 C88 76 70 80 64 98 C50 90 36 100 28 118 Z",
  short: "M28 118 C26 50 70 24 120 24 C170 24 214 50 212 118 L200 100 L190 112 L180 88 L166 106 L152 82 L138 102 L122 80 L108 102 L94 84 L82 106 L70 90 L60 110 L46 96 Z",
};
const TWIN_TAILS = [
  "M36 98 C6 112 -2 172 8 222 C14 240 32 240 36 222 C42 190 46 150 54 118 Z",
  "M204 98 C234 112 242 172 232 222 C226 240 208 240 204 222 C198 190 194 150 186 118 Z",
];

const TEE_BODY =
  "M78 196 C82 190 92 188 100 188 C108 197 132 197 140 188 C148 188 158 190 162 196 L166 256 C150 264 90 264 74 256 Z";
const SLEEVE_SHORT = [
  "M80 194 C66 196 53 208 49 223 C57 231 68 233 76 229 L83 210 Z",
  "M160 194 C174 196 187 208 191 223 C183 231 172 233 164 229 L157 210 Z",
];
const SLEEVE_LONG = [
  "M80 194 C64 196 50 214 46 240 C50 254 66 256 72 248 L82 214 Z",
  "M160 194 C176 196 190 214 194 240 C190 254 174 256 168 248 L158 214 Z",
];
</script>

<template>
  <svg class="cotton-doll" viewBox="0 0 240 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient :id="`${uid}-skin`" cx="0.38" cy="0.3" r="0.78">
        <stop offset="0" :stop-color="shade(skin, 0.35)" />
        <stop offset="0.55" :stop-color="skin" />
        <stop offset="1" :stop-color="shade(skin, -0.1)" />
      </radialGradient>
      <linearGradient :id="`${uid}-hair`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="shade(hair, 0.22)" />
        <stop offset="0.5" :stop-color="hair" />
        <stop offset="1" :stop-color="shade(hair, -0.12)" />
      </linearGradient>
      <linearGradient :id="`${uid}-top`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="shade(top, 0.18)" />
        <stop offset="1" :stop-color="shade(top, -0.1)" />
      </linearGradient>
      <linearGradient :id="`${uid}-bottom`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="shade(bottom, 0.15)" />
        <stop offset="1" :stop-color="shade(bottom, -0.12)" />
      </linearGradient>
      <radialGradient :id="`${uid}-blush`">
        <stop offset="0" stop-color="#ff7f98" stop-opacity="1" />
        <stop offset="1" stop-color="#ff7f98" stop-opacity="0" />
      </radialGradient>
      <filter :id="`${uid}-soft`" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-color="#6b4a35" flood-opacity="0.16" />
      </filter>
    </defs>

    <!-- 地上的影子 -->
    <ellipse cx="120" cy="326" rx="66" ry="8" fill="#000" opacity="0.1" />

    <g :filter="paint('soft')">
      <!-- 後髮 -->
      <g v-if="look.hair !== 'none'" :fill="paint('hair')" :stroke="hairLine" stroke-width="2.4" stroke-linejoin="round">
        <circle v-if="look.hair === 'bun'" cx="120" cy="26" r="27" />
        <path v-for="(d, i) in look.hair === 'twintails' ? TWIN_TAILS : []" :key="`tail-${i}`" :d="d" />
        <path v-if="HAIR_BACK[look.hair]" :d="HAIR_BACK[look.hair]" />
      </g>
      <g v-if="look.hair === 'twintails'" fill="#f39a8b" :stroke="outlineOf('#f39a8b')" stroke-width="1.6">
        <circle cx="42" cy="106" r="7" />
        <circle cx="198" cy="106" r="7" />
      </g>

      <!-- 腿 -->
      <g :fill="paint('skin')" :stroke="skinLine" stroke-width="2.4">
        <rect x="90" y="270" width="28" height="50" rx="14" />
        <rect x="122" y="270" width="28" height="50" rx="14" />
      </g>

      <!-- 身體 -->
      <path
        d="M86 188 C78 188 74 196 74 210 L74 262 C74 284 92 292 120 292 C148 292 166 284 166 262 L166 210 C166 196 162 188 154 188 Z"
        :fill="paint('skin')"
        :stroke="skinLine"
        stroke-width="2.4"
      />
      <circle cx="120" cy="254" r="1.8" :fill="skinLine" opacity="0.6" />

      <!-- 手（掌心有小肉墊） -->
      <g :fill="paint('skin')" :stroke="skinLine" stroke-width="2.4">
        <ellipse cx="64" cy="228" rx="15" ry="27" transform="rotate(24 64 228)" />
        <ellipse cx="176" cy="228" rx="15" ry="27" transform="rotate(-24 176 228)" />
      </g>
      <g fill="#f7a8b4" opacity="0.75">
        <ellipse cx="55" cy="246" rx="5" ry="4" />
        <ellipse cx="185" cy="246" rx="5" ry="4" />
      </g>

      <!-- 下身（吊帶褲以外） -->
      <g v-if="showBottom && !bottomOverTop" :fill="paint('bottom')" :stroke="bottomLine" stroke-width="2.2" stroke-linejoin="round">
        <path v-if="look.bottom === 'shorts'" d="M75 246 L165 246 L167 282 L124 284 L120 272 L116 284 L73 282 Z" />
        <template v-else-if="look.bottom === 'skirt'">
          <path d="M76 244 L164 244 L180 290 C140 298 100 298 60 290 Z" />
          <path d="M100 247 L92 292 M120 247 L120 295 M140 247 L148 292" fill="none" opacity="0.55" />
        </template>
        <path v-else-if="look.bottom === 'pants'" d="M75 244 L165 244 L165 262 L151 316 L124 316 L120 280 L116 316 L89 316 L75 262 Z" />
      </g>

      <!-- 上衣 -->
      <template v-if="look.top !== 'none'">
        <ellipse v-if="look.top === 'hoodie'" cx="120" cy="190" rx="54" ry="15" :fill="shade(top, -0.08)" :stroke="topLine" stroke-width="2.2" />
        <g :fill="paint('top')" :stroke="topLine" stroke-width="2.2" stroke-linejoin="round">
          <template v-if="look.top === 'dress' || look.top === 'maid'">
            <path d="M82 232 L158 232 C170 254 182 276 188 292 C150 302 90 302 52 292 C58 276 70 254 82 232 Z" />
            <path d="M80 194 C86 189 96 188 102 188 C110 197 130 197 138 188 C144 188 154 189 160 194 L158 238 L82 238 Z" />
            <circle cx="77" cy="201" r="14" />
            <circle cx="163" cy="201" r="14" />
          </template>
          <template v-else>
            <path v-for="(d, i) in look.top === 'hoodie' ? SLEEVE_LONG : SLEEVE_SHORT" :key="`sleeve-${i}`" :d="d" />
            <path :d="TEE_BODY" />
          </template>
        </g>
        <!-- 細節 -->
        <path v-if="look.top === 'tee' || look.top === 'hoodie'" d="M100 189 C108 198 132 198 140 189" fill="none" :stroke="topLine" stroke-width="2" />
        <template v-if="look.top === 'hoodie'">
          <path d="M96 236 L144 236 L148 255 L92 255 Z" fill="none" :stroke="topLine" stroke-width="2" />
          <path d="M111 197 L109 220 M129 197 L131 220" :stroke="topLine" stroke-width="2" stroke-linecap="round" />
          <circle cx="109" cy="222" r="2.4" :fill="topLine" />
          <circle cx="131" cy="222" r="2.4" :fill="topLine" />
        </template>
        <template v-if="look.top === 'sailor'">
          <path
            d="M97 188 L120 220 L143 188 L161 195 L151 215 L120 232 L89 215 L79 195 Z"
            :fill="top === '#ffffff' ? '#2f3a56' : '#ffffff'"
            :stroke="top === '#ffffff' ? '#1d2438' : topLine"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path d="M84 200 L92 212 M156 200 L148 212" :stroke="top === '#ffffff' ? '#ffffff' : '#2f3a56'" stroke-width="2" stroke-linecap="round" />
          <g fill="#e8605a" stroke="#b8433f" stroke-width="1.6" stroke-linejoin="round">
            <path d="M120 224 L106 216 L106 232 Z" />
            <path d="M120 224 L134 216 L134 232 Z" />
            <path d="M118 226 L112 246 L118 242 L120 248 L122 242 L128 246 L122 226 Z" />
            <circle cx="120" cy="224" r="4" />
          </g>
        </template>
        <template v-if="look.top === 'dress'">
          <path d="M82 238 L158 238" :stroke="topLine" stroke-width="2" />
          <path d="M56 290 C90 299 150 299 184 290" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="1 6" stroke-linecap="round" />
        </template>
        <template v-if="look.top === 'maid'">
          <path d="M104 204 L136 204 L138 238 L102 238 Z" fill="#ffffff" stroke="#d9d2cc" stroke-width="1.8" />
          <path d="M98 236 L142 236 L156 286 C132 294 108 294 84 286 Z" fill="#ffffff" stroke="#d9d2cc" stroke-width="1.8" />
          <path d="M86 286 C94 292 100 292 108 290 C116 294 124 294 132 290 C140 292 146 292 154 286" fill="none" stroke="#d9d2cc" stroke-width="1.6" />
          <path d="M100 188 C108 201 132 201 140 188 L135 186 Q120 197 105 186 Z" fill="#ffffff" stroke="#d9d2cc" stroke-width="1.6" />
        </template>
      </template>

      <!-- 吊帶褲 -->
      <g v-if="showBottom && bottomOverTop" :fill="paint('bottom')" :stroke="bottomLine" stroke-width="2.2" stroke-linejoin="round">
        <path d="M75 244 L165 244 L167 286 L124 288 L120 276 L116 288 L73 286 Z" />
        <path d="M92 214 L148 214 L150 250 L90 250 Z" />
        <path d="M93 217 L86 191 L95 189 L101 215 Z" />
        <path d="M147 217 L154 191 L145 189 L139 215 Z" />
        <path d="M106 224 L134 224 L133 238 L107 238 Z" fill="none" opacity="0.6" />
        <circle cx="97" cy="219" r="3.2" fill="#ffd36e" stroke="#c99b2e" stroke-width="1.2" />
        <circle cx="143" cy="219" r="3.2" fill="#ffd36e" stroke="#c99b2e" stroke-width="1.2" />
      </g>

      <!-- 鞋 -->
      <g v-if="look.shoes !== 'none'" :fill="shoes" :stroke="shoesLine" stroke-width="2.2">
        <ellipse cx="104" cy="315" rx="17" ry="10" />
        <ellipse cx="136" cy="315" rx="17" ry="10" />
        <template v-if="look.shoes === 'sneakers'">
          <rect x="86" y="317" width="36" height="6" rx="3" fill="#ffffff" stroke="#d9d2cc" stroke-width="1.6" />
          <rect x="118" y="317" width="36" height="6" rx="3" fill="#ffffff" stroke="#d9d2cc" stroke-width="1.6" />
          <path d="M98 309 L110 309 M130 309 L142 309" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
        </template>
        <ellipse v-else cx="99" cy="311" rx="5" ry="2.5" fill="#ffffff" stroke="none" opacity="0.35" />
      </g>

      <!-- 頭在身體上的陰影 -->
      <ellipse cx="120" cy="194" rx="48" ry="9" fill="#6b4a35" opacity="0.13" />

      <!-- 耳朵、頭 -->
      <g :fill="paint('skin')" :stroke="skinLine" stroke-width="2.4">
        <circle cx="30" cy="126" r="15" />
        <circle cx="210" cy="126" r="15" />
      </g>
      <ellipse cx="120" cy="112" rx="94" ry="84" :fill="paint('skin')" :stroke="skinLine" stroke-width="2.6" />
      <ellipse cx="86" cy="66" rx="30" ry="15" fill="#ffffff" opacity="0.22" transform="rotate(-22 86 66)" />

      <!-- 腮紅 -->
      <g transform="translate(0 4)" :opacity="blushOpacity">
        <ellipse cx="68" cy="152" rx="20" ry="12" :fill="paint('blush')" />
        <ellipse cx="172" cy="152" rx="20" ry="12" :fill="paint('blush')" />
      </g>
      <g v-if="flush > 0.6" transform="translate(0 4)" stroke="#ff7f98" stroke-width="2" stroke-linecap="round" opacity="0.8">
        <path d="M60 156 L64 148 M68 156 L72 148 M76 156 L80 148" />
        <path d="M164 156 L168 148 M172 156 L176 148 M180 156 L184 148" />
      </g>

      <!-- 眼睛 -->
      <g fill="none" stroke="#3a2a2a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
        <template v-for="(x, i) in [eyeL, eyeR]" :key="`eye-${i}`">
          <template v-if="eyeMode === 'squeeze'">
            <path v-if="i === 0" :d="`M${x - 8} ${EYE_Y - 8} L${x + 6} ${EYE_Y} L${x - 8} ${EYE_Y + 8}`" />
            <path v-else :d="`M${x + 8} ${EYE_Y - 8} L${x - 6} ${EYE_Y} L${x + 8} ${EYE_Y + 8}`" />
          </template>
          <path
            v-else-if="eyeMode === 'happy' || eyeMode === 'smile' || (eyeMode === 'wink' && i === 1)"
            :d="`M${x - 10} ${EYE_Y + 3} Q${x} ${EYE_Y - 9} ${x + 10} ${EYE_Y + 3}`"
          />
          <template v-else-if="eyeMode === 'sleepy'">
            <path :d="`M${x - 10} ${EYE_Y} Q${x} ${EYE_Y + 7} ${x + 10} ${EYE_Y}`" />
            <path :d="i === 0 ? `M${x - 10} ${EYE_Y} L${x - 14} ${EYE_Y - 3}` : `M${x + 10} ${EYE_Y} L${x + 14} ${EYE_Y - 3}`" stroke-width="2.4" />
          </template>
          <g v-else stroke="none">
            <ellipse :cx="x" :cy="EYE_Y" rx="12" :ry="eyeMode === 'surprised' ? 15 : 14" fill="#3a2a2a" />
            <ellipse :cx="x" :cy="EYE_Y + 5.5" rx="8" ry="6.5" fill="#7a5644" opacity="0.65" />
            <circle :cx="x - 4" :cy="EYE_Y - 5.5" r="4.3" fill="#ffffff" />
            <circle :cx="x + 4" :cy="EYE_Y + 4" r="2" fill="#ffffff" />
          </g>
        </template>
      </g>

      <!-- 嘴 -->
      <g transform="translate(0 6)" fill="none" stroke="#8a4a4a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <ellipse v-if="mouthMode === 'o'" cx="120" cy="153" rx="5" ry="6" fill="#c4626a" stroke="#8a4a4a" stroke-width="2" />
        <ellipse v-else-if="mouthMode === 'tiny'" cx="120" cy="152" rx="3.5" ry="4.2" fill="#c4626a" stroke="none" />
        <path v-else-if="mouthMode === 'cat'" d="M110 150 Q115 156 120 150 Q125 156 130 150" />
        <path v-else-if="mouthMode === 'kiss'" d="M117 145 Q125 148 119 151 Q125 154 117 158" />
        <path v-else-if="mouthMode === 'wavy'" d="M109 153 Q112 149 115 153 Q118 157 121 153 Q124 149 127 153 Q130 157 133 153" />
        <template v-else-if="mouthMode === 'tongue'">
          <path d="M112 150 Q120 158 128 150" />
          <path d="M116 154 Q120 163 124 154" fill="#f08a9a" stroke-width="1.8" />
        </template>
        <path v-else d="M113 150 Q120 157 127 150" />
      </g>

      <!-- 前髮 -->
      <g v-if="look.hair !== 'none'" :transform="`translate(0 ${hairY})`" :fill="paint('hair')" :stroke="hairLine" stroke-width="2.4" stroke-linejoin="round">
        <path v-if="HAIR_FRONT[look.hair]" :d="HAIR_FRONT[look.hair]" />
        <path d="M70 52 C88 40 108 35 130 37" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.28" />
      </g>
      <!-- 頭頂縫線（光頭才看得到） -->
      <path v-else d="M120 30 L120 64" fill="none" :stroke="skinLine" stroke-width="2" stroke-dasharray="3 4" opacity="0.6" />

      <!-- 頭飾 -->
      <!-- 眼鏡跟著眼睛，不吃頭飾的位置和大小 -->
      <g v-if="look.accessory === 'glasses'" fill="#ffffff" fill-opacity="0.14" stroke="#3a2a2a" stroke-width="3">
        <circle :cx="eyeL" :cy="EYE_Y" r="18" />
        <circle :cx="eyeR" :cy="EYE_Y" r="18" />
        <path :d="`M${eyeL + 18} ${EYE_Y - 2} Q120 ${EYE_Y - 8} ${eyeR - 18} ${EYE_Y - 2}`" fill="none" />
      </g>
      <g v-if="look.accessory !== 'none' && look.accessory !== 'glasses'" :transform="accTransform" stroke-linejoin="round">
        <g v-if="look.accessory === 'bow'" :fill="acc" :stroke="accLine" stroke-width="2.2">
          <path d="M176 58 C160 40 146 46 148 60 C150 72 164 72 176 58 Z" />
          <path d="M176 58 C192 40 206 46 204 60 C202 72 188 72 176 58 Z" />
          <path d="M172 62 L166 82 L174 78 L177 64 Z M180 62 L186 82 L178 78 L175 64 Z" />
          <circle cx="176" cy="59" r="6" />
        </g>
        <g v-else-if="look.accessory === 'headband'">
          <path d="M38 100 C36 44 78 22 120 22 C162 22 204 44 202 100" fill="none" :stroke="accLine" stroke-width="12" stroke-linecap="round" />
          <path d="M38 100 C36 44 78 22 120 22 C162 22 204 44 202 100" fill="none" :stroke="acc" stroke-width="8" stroke-linecap="round" />
          <path d="M78 36 C92 28 106 25 120 25" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.5" />
        </g>
        <g v-else-if="look.accessory === 'catears'" :fill="acc" :stroke="accLine" stroke-width="2.2">
          <path d="M40 74 L54 18 L94 46 Z" />
          <path d="M200 74 L186 18 L146 46 Z" />
          <path d="M52 62 L58 32 L80 48 Z" fill="#f7a8b4" stroke="none" />
          <path d="M188 62 L182 32 L160 48 Z" fill="#f7a8b4" stroke="none" />
        </g>
        <g v-else-if="look.accessory === 'flower'" :fill="acc" :stroke="accLine" stroke-width="1.8">
          <circle cx="64" cy="48" r="9" />
          <circle cx="78" cy="56" r="9" />
          <circle cx="74" cy="72" r="9" />
          <circle cx="56" cy="72" r="9" />
          <circle cx="52" cy="56" r="9" />
          <circle cx="65" cy="61" r="6" fill="#ffd36e" stroke="#c99b2e" />
        </g>
        <g v-else-if="look.accessory === 'crown'" transform="translate(0 12)">
          <path d="M94 36 L98 8 L110 24 L120 4 L130 24 L142 8 L146 36 Z" fill="#ffd36e" stroke="#c99b2e" stroke-width="2.2" />
          <circle cx="120" cy="28" r="4" :fill="acc" stroke="#c99b2e" stroke-width="1.2" />
          <circle cx="104" cy="30" r="2.6" fill="#ffffff" opacity="0.8" />
          <circle cx="136" cy="30" r="2.6" fill="#ffffff" opacity="0.8" />
        </g>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.cotton-doll {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
