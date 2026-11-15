"""
從使用者畫的兩隻狗（petArt.ts 的 DOG_ART 垂耳、PRICK_DOG_ART 立耳）改花紋，產生其他品種的圖：
寫進 src/components/pixelHouse/dogBreedArt.ts（那個檔案不要手改，改這裡再跑一次）。

    python3 scripts/pixel-house/dog-breeds.py

只換顏色就做得出來的品種（柴柴、灰灰）不用來這裡，直接在 DOG_COLORS 加調色盤。
這裡放的是要「換部位」的：同一格在原本的圖是白、在這個品種要變黃褐這種。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src/components/pixelHouse/petArt.ts"
OUT = ROOT / "src/components/pixelHouse/dogBreedArt.ts"
POSES = ["walk-a", "walk-b", "sit", "sleep", "eat"]
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def load_art(name):
    src = SRC.read_text()
    i = src.index(f"export const {name}: Record<CatPose, string[]> = {{")
    blk = src[i : src.index("\n};\n", i)]
    out = {}
    for pose in POSES:
        m = re.search(r'  "?%s"?: \[\n(.*?)\n  \],' % re.escape(pose), blk, re.S)
        out[pose] = [l.strip().strip(",").strip('"') for l in m.group(1).split("\n")]
    return out


def touching(g, x, y, ch):
    H, W = len(g), len(g[0])
    return any(0 <= x + dx < W and 0 <= y + dy < H and g[y + dy][x + dx] == ch for dx, dy in N4)


def components(g, ch):
    """同一個字母、上下左右連在一起的一塊一塊"""
    H, W = len(g), len(g[0])
    seen, out = set(), []
    for y in range(H):
        for x in range(W):
            if g[y][x] != ch or (x, y) in seen:
                continue
            stack, part = [(x, y)], []
            while stack:
                a, b = stack.pop()
                if (a, b) in seen or not (0 <= a < W and 0 <= b < H) or g[b][a] != ch:
                    continue
                seen.add((a, b))
                part.append((a, b))
                stack += [(a + dx, b + dy) for dx, dy in N4]
            out.append(part)
    return out


# 垂耳那套：身體（背上的鞍）在哪一區。坐著是正面，脖子以下；其他幾張頭在右邊，左邊是身體
FLOPPY_BODY = {
    "sit": lambda x, y: y >= 17,
    "walk-a": lambda x, y: x < 19,
    "walk-b": lambda x, y: x < 19,
    "sleep": lambda x, y: x < 20,
    "eat": lambda x, y: x < 19,
}


def beagle(base):
    """米格魯（三色）：身體的花斑和深色變黑鞍（b），鞍旁邊一圈白變黃褐（t）；頭上的花斑黃褐，耳朵（k）深咖啡。
    字母：o 外框｜w 白｜t 黃褐｜b 黑｜k 耳朵｜g 遠的腳｜i 眼睛反光｜r 腮紅"""
    out = {}
    for pose in POSES:
        g = [list(r) for r in base[pose]]
        body = FLOPPY_BODY[pose]
        for y, row in enumerate(g):
            for x, c in enumerate(row):
                if body(x, y) and c in "sk":
                    row[x] = "b"
                elif c == "s":
                    row[x] = "t"
        edge = [(x, y) for y, row in enumerate(g) for x, c in enumerate(row) if c == "w" and body(x, y) and touching(g, x, y, "b")]
        for x, y in edge:
            g[y][x] = "t"
        out[pose] = ["".join(r) for r in g]
    return out


def black_shiba(base):
    """黑柴：花斑當黑色（s 不動，顏色交給調色盤），臉、身體、腳、尾巴的白貼著黑的那一圈變黃褐（t），
    眼睛上面那一圈就是黑柴的黃褐眉毛。耳朵裡面那一小塊白（不到 16 格）不動。
    字母：o 外框｜w 白｜s 黑｜t 黃褐｜g 遠的腳｜i 眼睛反光｜r 腮紅"""
    out = {}
    for pose in POSES:
        g = [list(r) for r in base[pose]]
        small = {xy for part in components(g, "w") if len(part) < 16 for xy in part}
        edge = [(x, y) for y, row in enumerate(g) for x, c in enumerate(row) if c == "w" and (x, y) not in small and touching(g, x, y, "s")]
        for x, y in edge:
            g[y][x] = "t"
        out[pose] = ["".join(r) for r in g]
    return out


# 巴哥：黑面罩的範圍（左上 x, y, 右下 x, y，含）：眼睛到嘴巴、兩眼外側。框裡面取橢圓（四個角不要，才不會方方的），
# 頭那一區的毛（不含耳朵、腮紅）變黑
PUG_MASK = {
    "sit": (23, 9, 35, 16),
    "walk-a": (30, 12, 41, 19),
    "walk-b": (30, 12, 41, 19),
    "sleep": (29, 26, 39, 30),
    "eat": (26, 22, 40, 27),
}


def pug(base):
    """巴哥：全身淺黃褐（w），花斑當深一點的黃褐（d），身體那區的深色也是 d；耳朵（k）黑；臉中間黑面罩（m）。
    字母：o 外框｜w 黃褐｜d 深一點的黃褐｜k 耳朵｜m 面罩｜g 遠的腳｜i 眼睛反光｜r 腮紅"""
    out = {}
    for pose in POSES:
        g = [list(r) for r in base[pose]]
        body = FLOPPY_BODY[pose]
        x0, y0, x1, y1 = PUG_MASK[pose]
        cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + 0.5, (y1 - y0) / 2 + 0.5
        for y, row in enumerate(g):
            for x, c in enumerate(row):
                if body(x, y):
                    if c in "sk":
                        row[x] = "d"
                elif ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 and c in "ws":
                    row[x] = "m"
                elif c == "s":
                    row[x] = "d"
        out[pose] = ["".join(r) for r in g]
    return out


# 柯基：腳變短。每張拿掉腳那一段的兩列，上面整個往下移、腳底不動。走路的腳是斜的，拿掉後有的腳底會缺外框，
# 所以拿掉後把「貼著透明、又不是外框」的格子補成外框（腳底變平的）。哪兩列是一個一個試、看圖挑的
CORGI_CUT = {"walk-a": [29, 31], "walk-b": [28, 30], "sit": [29, 30], "eat": [28, 30], "sleep": []}
# 柯基：額頭中間一條白（從臉往上到兩耳中間）
CORGI_BLAZE = {
    "sit": [(29, 10), (29, 9), (30, 9), (31, 9)] + [(x, 8) for x in range(27, 32)] + [(x, y) for y in (5, 6, 7) for x in (28, 29, 30)] + [(29, 4)],
    "walk-a": [(32, 10), (33, 10), (34, 10), (33, 9)],
    "walk-b": [(32, 11), (33, 11), (34, 11), (33, 10)],
    "eat": [(33, 19), (34, 19), (35, 19), (34, 18)],
    "sleep": [],
}


def corgi(base):
    """柯基：立耳那套，腳短一點（CORGI_CUT），額頭加一條白（CORGI_BLAZE）；顏色交給調色盤（s 橘、w 白）。
    字母跟立耳那套一樣：o 外框｜w 白｜s 橘｜g 遠的腳｜i 眼睛反光｜r 腮紅"""
    out = {}
    for pose in POSES:
        g = [list(r) for r in base[pose]]
        for x, y in CORGI_BLAZE[pose]:
            if g[y][x] == "s":
                g[y][x] = "w"
        cut = CORGI_CUT[pose]
        g = [list("." * len(g[0])) for _ in cut] + [r for y, r in enumerate(g) if y not in cut]
        edge = [(x, y) for y, row in enumerate(g) for x, c in enumerate(row) if c not in ".o" and touching(g, x, y, ".")]
        for x, y in edge:
            g[y][x] = "o"
        out[pose] = ["".join(r) for r in g]
    return out


def ts_art(name, doc, art):
    s = f"/**\n{doc}\n */\nexport const {name}: Record<CatPose, string[]> = {{\n"
    for pose in POSES:
        s += f'  "{pose}": [\n' + "".join(f'    "{r}",\n' for r in art[pose]) + "  ],\n"
    return s + "};\n"


def main():
    floppy, prick = load_art("DOG_ART"), load_art("PRICK_DOG_ART")
    body = "// 由 scripts/pixel-house/dog-breeds.py 產生，不要手改：改那個檔案再跑一次。\n"
    body += "// 從使用者畫的兩隻狗改花紋的品種；大小、zZ 跟原本那隻一樣（petArt.ts 的 walkerArt）。\n"
    body += 'import type { CatPose } from "./houseCat";\n\n'
    body += ts_art(
        "BEAGLE_DOG_ART",
        " * 米格魯：垂耳那套（DOG_ART）改三色。身體的花斑和深色變黑鞍，鞍旁邊一圈白變黃褐；頭上的花斑黃褐，耳朵深咖啡。\n"
        " * 字母：o 外框｜w 白｜t 黃褐｜b 黑｜k 耳朵｜g 遠的腳｜i 眼睛反光｜r 腮紅",
        beagle(floppy),
    )
    body += "\n"
    body += ts_art(
        "BLACK_SHIBA_DOG_ART",
        " * 黑柴：立耳那套（PRICK_DOG_ART）。花斑當黑色，白色貼著黑的那一圈變黃褐（眉毛、臉頰、腳、尾巴），耳朵裡面的白不動。\n"
        " * 字母：o 外框｜w 白｜s 黑｜t 黃褐｜g 遠的腳｜i 眼睛反光｜r 腮紅",
        black_shiba(prick),
    )
    body += "\n"
    body += ts_art(
        "PUG_DOG_ART",
        " * 巴哥：垂耳那套（DOG_ART）。全身黃褐、花斑深一點，耳朵黑，臉中間黑面罩（眼睛到嘴巴）。\n"
        " * 字母：o 外框｜w 黃褐｜d 深一點的黃褐｜k 耳朵｜m 面罩｜g 遠的腳｜i 眼睛反光｜r 腮紅",
        pug(floppy),
    )
    body += "\n"
    body += ts_art(
        "CORGI_DOG_ART",
        " * 柯基：立耳那套（PRICK_DOG_ART），腳短兩格（拿掉腳那一段的兩列），額頭中間一條白。\n"
        " * 字母跟立耳那套一樣：o 外框｜w 白｜s 橘｜g 遠的腳｜i 眼睛反光｜r 腮紅",
        corgi(prick),
    )
    OUT.write_text(body)
    print("寫好了", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
