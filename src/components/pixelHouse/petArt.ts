/**
 * 狗、倉鼠、倉鼠籠的圖（用程式畫的小 SVG，跟貓一樣：同一套圖換顏色）。貓的圖在 houseCat.ts。
 *
 * 省電：倉鼠跑滾輪只用 CSS 換兩張圖（opacity），不用計時器；籠子在畫面外就停。
 */
import { CAT_ART, CAT_H, CAT_W, type CatPose, type HamsterPose, type PetSpecies } from "./houseCat";

// ===== 狗：22×13，面向右，腳底在最下面一列 =====

export const DOG_W = 22;
export const DOG_H = 13;

/** o 外框、b 身體、w 白色（嘴、胸口、肚子）、e 眼睛、n 鼻子、c 閉著的眼睛 */
export const DOG_ART: Record<CatPose, string[]> = {
  "walk-a": [
    "..............o..o....",
    ".............oboobo...",
    "..oo........obbbbbbo..",
    ".obbo.......obbbbebo..",
    ".obo........obbbbbwwwo",
    ".obo.oooooooobbbbwwwwn",
    "..obobbbbbbbbbbbwwwoo.",
    "...obbbbbbbbbbbbwo....",
    "...obbbbbbbbbbbbwo....",
    "...owwwwwwwwwwwwwo....",
    "...obooooooooooboo....",
    "...owo........owo.....",
    "...ooo........ooo.....",
  ],
  "walk-b": [
    "..............o..o....",
    ".............oboobo...",
    "..oo........obbbbbbo..",
    ".obbo.......obbbbebo..",
    ".obo........obbbbbwwwo",
    ".obo.oooooooobbbbwwwwn",
    "..obobbbbbbbbbbbwwwoo.",
    "...obbbbbbbbbbbbwo....",
    "...obbbbbbbbbbbbwo....",
    "...owwwwwwwwwwwwwo....",
    "...ooobooooooboooo....",
    ".....owo....owo.......",
    ".....ooo....ooo.......",
  ],
  "sit": [
    "..............o..o....",
    ".............oboobo...",
    "............obbbbbbo..",
    "............obbbbebo..",
    "............obbbbbwwwo",
    "...........oobbbbwwwwn",
    "..oo......obbbbbwwwoo.",
    ".obbo....obbbbbbwwo...",
    ".obo....obbbbbbbwwo...",
    "..oboo.obbbbbbbbwwo...",
    "...obbobbbbbbbbbwwo...",
    "....obbbbbbbbbbowwo...",
    "....ooooooooooooooo...",
  ],
  "sleep": [
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "..............o..o....",
    ".....ooooooooooboobo..",
    "....obbbbbbbbobbbbbbo.",
    "...obbbbbbbbbobcbbbwwo",
    "..obbbbbbbbbbobbbwwwwn",
    ".oobbbbbbbbbbbowwwwoo.",
    "obbowwwwwwwwwwwoooo...",
    ".oooooooooooooo.......",
  ],
  "eat": [
    "......................",
    "..oo..................",
    ".obbo.................",
    ".obo..................",
    ".obo.ooooooooo........",
    "..obobbbbbbbbbo..o..o.",
    "...obbbbbbbbbbbooboobo",
    "...obbbbbbbbbbbbbbbbbo",
    "...obbbbbbbbbbbbbebbbo",
    "...owwwwwwwwwwwbbbbwwo",
    "...obooooooooobowwwwwn",
    "...owo.......owo.oooo.",
    "...ooo.......ooo......",
  ],
};

/** 會在家裡走的：這種動物的圖和大小 */
export function walkerArt(species: PetSpecies): { art: Record<CatPose, string[]>; w: number; h: number } {
  return species === "dog" ? { art: DOG_ART, w: DOG_W, h: DOG_H } : { art: CAT_ART, w: CAT_W, h: CAT_H };
}

// ===== 倉鼠：11×9 =====

export const HAMSTER_W = 11;
export const HAMSTER_H = 9;

/** sit、eat 是正面；sleep、run-a、run-b 是側面（面向右） */
export const HAMSTER_ART: Record<"sit" | "eat" | "sleep" | "run-a" | "run-b", string[]> = {
  "sit": [
    "..oo..oo...",
    ".onoooono..",
    ".obbbbbbo..",
    "obebbbbebo.",
    "obbbnnbbbo.",
    "obwwwwwwbo.",
    "obwwwwwwbo.",
    ".obwwwwbo..",
    "..oooooo...",
  ],
  "eat": [
    "..oo..oo...",
    ".onoooono..",
    ".obbbbbbo..",
    "obcbbbbcbo.",
    "obbbnnbbbo.",
    "obwosowwbo.",
    "obwwoowwbo.",
    ".obwwwwbo..",
    "..oooooo...",
  ],
  "sleep": [
    "...........",
    "...........",
    "...........",
    "....oo.o...",
    "..oobboboo.",
    ".obbbbbbbbo",
    "obbbbbbcbbo",
    "obbbbbbbnno",
    ".ooooooooo.",
  ],
  "run-a": [
    "...........",
    "...........",
    "......oo...",
    "..ooooonoo.",
    ".obbbbbbbeo",
    "obbbbbbbbbn",
    "obwwwwwwwo.",
    ".oowooowo..",
    "..oo...oo..",
  ],
  "run-b": [
    "...........",
    "...........",
    "......oo...",
    "..ooooonoo.",
    ".obbbbbbbeo",
    "obbbbbbbbbn",
    "obwwwwwwwo.",
    ".oowowoo...",
    "...ooo.....",
  ],
};

/** 倉鼠在籠子裡現在用哪幾張圖（跑滾輪是兩張輪流） */
export function hamsterFrames(pose: HamsterPose): (keyof typeof HAMSTER_ART)[] {
  return pose === "run" ? ["run-a", "run-b"] : [pose];
}

// ===== 倉鼠籠：26×20，滾輪 11×11 =====

export const CAGE_W = 26;
export const CAGE_H = 20;
/** 滾輪在籠子裡的哪裡（左上角）；跑步的倉鼠、坐著的倉鼠在哪 */
export const CAGE_WHEEL = { x: 13, y: 3 };
export const CAGE_RUNNER = { x: 13, y: 5 };
export const CAGE_SITTER = { x: 2, y: 7 };

export const CAGE_PALETTE: Record<string, string> = {
  o: "#4A3328",
  g: "#A9B4C2",
  h: "#D8DEE6",
  p: "#E8A0B4",
  d: "#C77A93",
  y: "#F1DDB0",
  k: "#D9BC84",
  r: "#7FB3D8",
  s: "#4F86B0",
  m: "#B98B5E",
};

/** back：木屑和滾輪的腳（畫在倉鼠後面）；front：鐵絲和底盤（畫在倉鼠前面） */
export const CAGE_ART: Record<"back" | "front" | "wheel-a" | "wheel-b", string[]> = {
  "back": [
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..................m.m.....",
    "..................m.m.....",
    ".................mm.mm....",
    ".yykyyyykyyyyykyyyykyyyyy.",
    ".ykyyykyyyykyyyyykyyykyyy.",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
  ],
  "front": [
    "......oooooooooooooo......",
    "....oohhhhhhhhhhhhhhoo....",
    "..oog......g.....g...goo..",
    ".og........g.....g.....go.",
    ".og........g.....g.....go.",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "og.........g.....g......go",
    "oppppppppppppppppppppppppo",
    "opppppppppppppppppppppppdo",
    "oddddddddddddddddddddddddo",
    ".oooooooooooooooooooooooo.",
  ],
  "wheel-a": [
    "...ooooo...",
    "..orrrrro..",
    ".or..s..ro.",
    "orr..s..rro",
    "or...s...ro",
    "orsssmsssro",
    "or...s...ro",
    "orr..s..rro",
    ".or..s..ro.",
    "..orrrrro..",
    "...ooooo...",
  ],
  "wheel-b": [
    "...ooooo...",
    "..orrrrro..",
    ".ors...sro.",
    "orrs...srro",
    "or..s.s..ro",
    "or...m...ro",
    "or..s.s..ro",
    "orrs...srro",
    ".ors...sro.",
    "..orrrrro..",
    "...ooooo...",
  ],
};

// ===== 狗的尿布墊（浴室地上）、狗碗 =====

export const PAD_ART: Record<"ready" | "empty", { rows: string[]; palette: Record<string, string> }> = {
  ready: {
    rows: [
      ".oooooooooooooo.",
      "obbbbbbbbbbbbbbo",
      "obwwlwwwlwwwlwbo",
      "obwlwwwlwwwlwwbo",
      "obbbbbbbbbbbbbbo",
      ".oooooooooooooo.",
    ],
    palette: { o: "#4F86B0", b: "#9CC7E6", w: "#FBF7EE", l: "#DDEAF3" },
  },
  // 沒有尿布墊了：地上只剩一個框
  empty: {
    rows: [
      ".oo.oo.oo.oo.oo.",
      "o..............o",
      "................",
      "o..............o",
      "................",
      ".oo.oo.oo.oo.oo.",
    ],
    palette: { o: "#9CC7E6" },
  },
};

/** 狗碗：形狀跟貓碗一樣，藍色 */
export const DOG_BOWL_PALETTE: Record<string, string> = { o: "#3B2A26", r: "#5A8FD8", k: "#8A5A33" };
