"""像素小屋場景產生器：邏輯解析度 130x282，顯示時放大 3 倍。"""
import math
import sys
import numpy as np
from PIL import Image

W, H = 130, 282
FLOOR_Y = 200


def hx(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


# ---------- 調色盤（奶茶暖色）----------
P = {
    "wall": "#E9D9C4", "wallS": "#DECAB1", "wallL": "#F3E7D6", "trim": "#C9A985",
    "wood": "#B98A62", "woodL": "#D2A67C", "woodS": "#94673F", "woodO": "#5E3E2A",
    "floor": "#B48660", "floorS": "#A27550", "floorL": "#C39570", "floorO": "#8A5E3E",
    "cream": "#F4ECDD", "creamS": "#E0D2BC", "creamO": "#B9A68A",
    "terra": "#D47F58", "terraS": "#B2603D", "terraL": "#E9A07A", "terraO": "#7E3F27",
    "olive": "#7F9B5B", "oliveS": "#5D7742", "oliveL": "#A3BC7A", "oliveO": "#3F5230",
    "mustard": "#E2B455", "mustardS": "#C4923A", "mustardL": "#F0CF7E", "mustardO": "#8E6428",
    "slate": "#5B5470", "slateS": "#463F58", "slateO": "#2F2A3D",
    "ink": "#3B2A26", "white": "#FBF7EE",
    "sky": "#BFE0EA", "skyL": "#DCEFF4",
}
C = {k: hx(v) for k, v in P.items()}

CHAR_PAL = {
    "o": "#3E2A22", "h": "#5A3D30", "H": "#80604C",
    "O": "#B9806A", "s": "#F6D7BC", "S": "#E6B596", "b": "#F0A08E",
    "e": "#2E2230", "w": "#FFFFFF", "m": "#B5735A",
    "k": "#8E6428", "y": "#E2B455", "Y": "#C4923A", "l": "#F0CF7E",
    "c": "#FBF6EC", "C": "#E2D8C6",
    "q": "#332C40", "p": "#5B5470", "P": "#463F58",
    "f": "#4A3328",
}

CHAR = [
    "........oo..........",
    ".......ohHo.o.......",
    "....oo.ohHhhohoo....",
    "...ohhoohHhhhhhho...",
    "..ohhHHhhhhhhhHhho..",
    ".ohhHHhhhhhhhhhHhho.",
    "ohhhhhhhhhhhhhhhhhho",
    "ohhhhHhhhhhhhhHhhhho",
    "ohhhhhhhhhhhhhhhhhho",
    "ohhhshhhshhshhhshhho",
    "ohhssshssssssshssshho"[:20],
    "ohsssewssssssewsssho",
    "ohssseesssssseesssho",
    "ohsbbsssssssssbbshho"[:20],
    ".oSsssssssmmssssSSo."[:20],
    "..oOSSSSSSSSSSSSOo..",
    "....kccccccccccck...",
    "...kyyccCyyCccyyk...",
    "..klyyyycyycyyyyYk..",
    "..klyyyyyyyyyyyyYk..",
    ".kllyyyyyyyyyyyyYYk.",
    ".klykyyyyyyyyyykYYk.",
    ".kyykyyyyyyyyyYkYYk.",
    ".kssYyyyyyyyyyYYkSSk"[:20],
    "..kkkYYYYYYYYYYkkk..",
    "....qppppppppppPq...",
    "....qpppPqqpppPq....",
    "....qpppPqqpppPq....",
    "...qffffq..qffffq...",
    "...qqqqqq..qqqqqq...",
]


class Scene:
    def __init__(self):
        self.img = np.zeros((H, W, 3), dtype=float)
        self.emit = np.zeros((H, W), dtype=bool)  # 自己會發光的像素，不吃夜晚色調
        self.char = np.zeros((H, W), dtype=bool)  # 人物：晚上暗得少一點，才看得清楚

    def px(self, x, y, c, emit=False):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < W and 0 <= y < H:
            self.img[y, x] = C[c] if isinstance(c, str) else c
            if emit:
                self.emit[y, x] = True

    def rect(self, x, y, w, h, c, emit=False):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.px(xx, yy, c, emit)

    def box(self, x, y, w, h, fill, o, light=None, shade=None, emit=False):
        """有外框、左上亮邊、右下暗邊的方塊（光源在左上）"""
        self.rect(x, y, w, h, o, emit)
        self.rect(x + 1, y + 1, w - 2, h - 2, fill, emit)
        if light is not None:
            self.rect(x + 1, y + 1, w - 2, 1, light, emit)
            self.rect(x + 1, y + 1, 1, h - 2, light, emit)
        if shade is not None:
            self.rect(x + 1, y + h - 2, w - 2, 1, shade, emit)
            self.rect(x + w - 2, y + 2, 1, h - 3, shade, emit)

    def sprite(self, rows, pal, x, y, emit=False):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != "." and ch in pal:
                    self.px(x + i, y + j, hx(pal[ch]), emit)

    def shade_rect(self, x, y, w, h, k):
        """把一塊區域調暗（k<1）或調亮（k>1）"""
        y0, y1 = max(0, y), min(H, y + h)
        x0, x1 = max(0, x), min(W, x + w)
        self.img[y0:y1, x0:x1] = np.clip(self.img[y0:y1, x0:x1] * k, 0, 255)


def draw_room(s, t, weather):
    # 牆
    s.rect(0, 0, W, FLOOR_Y, "wall")
    for x in range(0, W, 12):
        s.rect(x + 10, 0, 1, 150, "wallS")
    s.rect(0, 150, W, 46, "wallS")
    s.rect(0, 150, W, 2, "trim")
    s.rect(0, 152, W, 1, "woodS")
    for x in range(0, W, 10):
        s.rect(x, 153, 1, 43, "creamO")
    s.rect(0, 194, W, 6, "woodS")
    s.rect(0, 194, W, 1, "woodL")
    s.rect(0, 199, W, 1, "woodO")
    # 地板
    s.rect(0, FLOOR_Y, W, H - FLOOR_Y, "floor")
    for i, y in enumerate(range(FLOOR_Y + 9, H, 10)):
        s.rect(0, y, W, 1, "floorS")
        off = 17 if i % 2 else 0
        for x in range(off, W, 34):
            s.rect(x, y - 9, 1, 9, "floorS")
        s.rect(0, y - 9, W, 1, "floorL") if y - 9 > FLOOR_Y else None
    s.rect(0, FLOOR_Y, W, 2, "floorO")

    # 燈串
    prev = None
    for x in range(4, 126):
        y = 9 + int(round(2.2 * math.sin((x - 4) / 121 * math.pi)))
        if prev is not None:
            for yy in range(min(prev, y), max(prev, y) + 1):
                s.px(x, yy, "ink")
        s.px(x, y, "ink")
        prev = y
    bulbs = ["mustardL", "terraL", "oliveL", "cream"]
    for i, x in enumerate(range(10, 124, 11)):
        y = 9 + int(round(2.2 * math.sin((x - 4) / 121 * math.pi)))
        s.rect(x - 1, y + 1, 3, 3, bulbs[i % 4], emit=(t == "night"))
        s.px(x, y + 1, "white", emit=(t == "night"))

    # 相框架
    s.box(5, 44, 34, 3, "wood", "woodO", "woodL")
    s.box(7, 29, 12, 15, "sky", "woodO")
    s.rect(8, 30, 10, 13, "skyL")
    s.rect(8, 38, 10, 5, "oliveL")
    s.rect(10, 34, 2, 2, "S" if False else "creamS")
    s.rect(10, 34, 2, 2, "terraL")
    s.rect(10, 36, 2, 4, "terra")
    s.rect(14, 34, 2, 2, "mustardL")
    s.rect(14, 36, 2, 4, "olive")
    s.box(21, 33, 10, 11, "cream", "woodS")
    s.rect(24, 36, 4, 3, "terraL")
    s.rect(25, 39, 2, 1, "terraL")
    s.box(32, 39, 6, 5, "terra", "terraO", "terraL", "terraS")
    for (x, y, h) in [(33, 34, 5), (35, 32, 7), (36, 35, 4), (34, 36, 3)]:
        s.rect(x, y, 1, h, "olive")
        s.px(x, y, "oliveL")

    # 月曆
    s.box(9, 58, 20, 24, "white", "creamO")
    s.rect(10, 59, 18, 5, "terra")
    s.rect(10, 59, 18, 1, "terraL")
    s.rect(13, 56, 1, 4, "ink")
    s.rect(24, 56, 1, 4, "ink")
    for r in range(4):
        for c in range(5):
            s.px(12 + c * 3, 67 + r * 3, "creamO")
    s.rect(20, 72, 3, 2, "terra")
    s.px(21, 74, "terra")

    # 窗戶
    sky = {"day": "#BFE0EA", "dusk": "#F2B07E", "night": "#25304F"}[t]
    sky2 = {"day": "#DCEFF4", "dusk": "#F6CB97", "night": "#2F3B60"}[t]
    if weather == "rain":
        sky, sky2 = ("#9AAABA", "#AEBDCB") if t != "night" else ("#222A40", "#2A3350")
    s.box(44, 36, 46, 56, "woodS", "woodO", "woodL")
    s.rect(47, 39, 40, 50, hx(sky), emit=True)
    s.rect(47, 39, 40, 20, hx(sky2), emit=True)
    if weather == "rain":
        for (x, y, w) in [(50, 44, 14), (52, 42, 9), (66, 48, 16), (69, 46, 9)]:
            s.rect(x, y, w, 3, hx("#C9D2DC" if t != "night" else "#3A4560"), emit=True)
        for i in range(26):
            x = 48 + (i * 17) % 38
            y = 52 + (i * 11) % 34
            s.rect(x, y, 1, 3, hx("#E3EEF7" if t != "night" else "#5A6A8A"), emit=True)
    elif t == "night":
        s.rect(73, 44, 7, 7, hx("#F4EFD2"), emit=True)
        s.rect(72, 45, 9, 5, hx("#F4EFD2"), emit=True)
        s.rect(76, 43, 5, 6, hx(sky2), emit=True)
        for (x, y) in [(52, 44), (58, 52), (82, 60), (54, 68), (64, 42), (80, 74), (61, 79)]:
            s.px(x, y, hx("#FFF6C8"), emit=True)
    else:
        sun = "#FFE08A" if t == "day" else "#FFC062"
        s.rect(72, 46, 8, 8, hx(sun), emit=True)
        s.rect(71, 47, 10, 6, hx(sun), emit=True)
        s.rect(52, 52, 12, 3, hx("#FFFFFF"), emit=True)
        s.rect(55, 50, 6, 2, hx("#FFFFFF"), emit=True)
        if t == "dusk":
            s.rect(47, 80, 40, 9, hx("#E59A6E"), emit=True)
    # 窗格
    s.rect(66, 39, 2, 50, "woodS")
    s.rect(66, 39, 1, 50, "woodL")
    s.rect(47, 62, 40, 2, "woodS")
    s.rect(47, 62, 40, 1, "woodL")
    # 窗簾
    for (x0, flip) in [(39, False), (84, True)]:
        s.rect(x0, 34, 11, 60, "creamO")
        s.rect(x0 + 1, 34, 9, 59, "cream")
        for k in range(3):
            fx = x0 + 2 + k * 3
            s.rect(fx, 35, 1, 58, "creamS")
        s.rect(x0, 92, 11, 2, "creamO")
        s.rect(x0 + 2, 70, 7, 2, "terra")
    s.rect(36, 32, 62, 2, "woodO")
    s.px(35, 32, "ink"); s.px(98, 32, "ink")
    # 窗台
    s.box(41, 92, 52, 4, "woodL", "woodO", "cream", "wood")
    s.box(51, 86, 6, 6, "terra", "terraO", "terraL", "terraS")
    for (x, y) in [(52, 83), (54, 82), (55, 84), (53, 85)]:
        s.rect(x, y, 2, 3, "olive")
        s.px(x, y, "oliveL")
    s.rect(79, 85, 4, 7, hx("#CFE5E6"))
    s.rect(80, 83, 2, 2, hx("#CFE5E6"))
    s.px(79, 86, "white")
    s.rect(80, 80, 1, 5, "olive")

    # 時鐘
    cx, cy, r = 108, 46, 8
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            d = math.hypot(x - cx, y - cy)
            if d <= r + 0.3:
                s.px(x, y, "woodO" if d > r - 1.2 else ("cream" if d < r - 2.2 else "woodS"))
    s.rect(cx, cy - 5, 1, 5, "ink")
    s.rect(cx, cy, 4, 1, "terraS")
    s.px(cx, cy, "ink")
    for (dx, dy) in [(0, -6), (6, 0), (0, 6), (-6, 0)]:
        s.px(cx + dx, cy + dy, "creamO")

    # 軟木留言板
    s.box(48, 104, 34, 24, hx("#D6A877"), "woodO", hx("#E2B98A"), hx("#C29466"))
    s.rect(51, 107, 9, 9, hx("#FFF3B0")); s.px(55, 107, "terra")
    s.rect(63, 108, 8, 10, hx("#CFE5E6")); s.px(66, 108, "olive")
    s.rect(73, 106, 7, 8, hx("#F6C9C0")); s.px(76, 106, "mustardS")
    s.rect(54, 118, 12, 7, "white"); s.px(59, 118, "terra")
    for x in range(52, 59, 2):
        s.px(x, 110, "creamO")
        s.px(x, 112, "creamO")

    # 書櫃
    s.box(3, 106, 30, 90, "woodS", "woodO", "woodL")
    s.rect(5, 108, 26, 86, "woodO")
    s.rect(5, 108, 26, 86, hx("#6E4A33"))
    for sy in (128, 150, 172):
        s.rect(4, sy, 28, 3, "wood")
        s.rect(4, sy, 28, 1, "woodL")
        s.rect(4, sy + 2, 28, 1, "woodO")
    s.rect(4, 192, 28, 2, "wood")

    def book(x, top, bottom, col, w=3):
        s.rect(x, top, w, bottom - top, C[col + "O"] if col + "O" in C else C["ink"])
        s.rect(x, top, w - 1, bottom - top, C[col])
        s.rect(x, top, w - 1, 1, C[col + "L"] if col + "L" in C else C[col])
        s.px(x + 1, top + 3, C["cream"])
        s.px(x + 1, top + 4, C["cream"])

    for (x, top, col) in [(6, 114, "terra"), (9, 112, "olive"), (12, 116, "mustard"), (15, 113, "slate"),
                          (18, 115, "cream"), (24, 112, "terra")]:
        book(x, top, 128, col)
    s.rect(21, 118, 3, 10, "oliveO"); s.rect(21, 118, 2, 10, "oliveL")
    for (x, top, col) in [(6, 137, "slate"), (9, 136, "mustard"), (12, 138, "olive")]:
        book(x, top, 150, col)
    s.box(20, 143, 8, 7, "terra", "terraO", "terraL", "terraS")
    for (x, y, h) in [(21, 136, 7), (23, 134, 9), (25, 137, 6), (22, 139, 4), (26, 140, 3)]:
        s.rect(x, y, 1, h, "olive")
        s.px(x, y, "oliveL")
        s.px(x + 1, y + 1, "oliveS")
    for (x, top, col) in [(6, 158, "cream"), (9, 159, "terra"), (12, 160, "olive"), (15, 158, "slate"),
                          (18, 161, "mustard")]:
        book(x, top, 172, col)
    s.box(22, 164, 9, 8, "cream", "creamO", "white", "creamS")
    for (y, w, col) in [(189, 14, "olive"), (186, 13, "terra"), (183, 14, "mustard")]:
        s.rect(6, y, w, 3, C[col + "O"])
        s.rect(6, y, w - 1, 2, C[col])
        s.rect(6, y, w - 1, 1, C[col + "L"])
    s.rect(23, 182, 6, 10, hx("#CFE5E6"))
    s.rect(23, 181, 6, 1, "creamO")
    s.rect(24, 186, 4, 5, "mustardL")

    # 唱片機
    s.box(5, 100, 24, 7, "wood", "woodO", "woodL", "woodS")
    s.rect(7, 97, 14, 4, "ink")
    s.rect(8, 96, 12, 1, "ink")
    s.rect(11, 98, 4, 1, "terra")
    s.rect(24, 95, 1, 5, "creamO")
    s.rect(21, 95, 4, 1, "creamO")
    s.rect(26, 103, 2, 1, "mustard")

    # 書桌
    dy = 178
    s.box(38, dy, 54, 5, "woodL", "woodO", "cream", "wood")
    s.rect(39, dy + 4, 52, 1, "woodS")
    s.rect(40, dy + 5, 3, 16, "woodS"); s.rect(40, dy + 5, 1, 16, "wood")
    s.box(72, dy + 5, 18, 12, "wood", "woodO", "woodL", "woodS")
    s.rect(73, dy + 10, 16, 1, "woodO")
    s.rect(79, dy + 7, 4, 1, "mustardS")
    s.rect(79, dy + 13, 4, 1, "mustardS")
    s.rect(86, dy + 17, 3, 4, "woodS")
    # 桌下陰影
    s.shade_rect(43, dy + 5, 29, 16, 0.86)
    # 螢幕（復古米色）
    s.box(46, 158, 26, 18, hx("#E6DFD0"), "ink", hx("#F5F1E6"), hx("#C9BFAA"))
    scr = {"day": "#4E6B78", "dusk": "#4E6B78", "night": "#5FA6C4"}[t]
    s.rect(49, 161, 20, 12, hx(scr), emit=True)
    s.rect(51, 163, 9, 1, hx("#BFE6EE"), emit=True)
    s.rect(51, 165, 13, 1, hx("#8FC3D2"), emit=True)
    s.rect(51, 167, 7, 1, hx("#8FC3D2"), emit=True)
    s.rect(63, 167, 3, 3, hx("#F2A27E"), emit=True)
    s.rect(57, 176, 4, 2, "ink")
    s.rect(50, 177, 18, 1, hx("#C9BFAA"))
    # 番茄鐘
    s.rect(40, 172, 6, 6, "terraO")
    s.rect(41, 172, 4, 5, hx("#E0563F"))
    s.rect(40, 173, 6, 3, hx("#E0563F"))
    s.px(41, 173, hx("#F7A08F"))
    s.rect(42, 170, 2, 2, "olive")
    s.px(43, 169, "oliveS")
    # 馬克杯
    s.box(74, 172, 5, 6, "terra", "terraO", "terraL", "terraS")
    s.rect(79, 174, 1, 2, "terraO")
    if t == "day":
        s.px(76, 169, "white"); s.px(75, 167, "white"); s.px(76, 165, "white")
    # 檯燈
    s.rect(84, 160, 8, 1, "mustardO")
    s.rect(83, 161, 10, 5, "mustardO")
    s.rect(84, 161, 8, 4, "mustard", emit=(t != "day"))
    s.rect(84, 161, 8, 1, "mustardL", emit=(t != "day"))
    s.rect(87, 166, 2, 10, "ink")
    s.rect(85, 176, 6, 2, "ink")

    # 落地植物
    s.box(91, 186, 9, 14, "terra", "terraO", "terraL", "terraS")
    s.rect(90, 186, 11, 2, "terraS")
    leaves = [(88, 172, 5, 3), (95, 168, 5, 3), (91, 176, 4, 3), (97, 175, 5, 3), (86, 179, 5, 3), (93, 162, 4, 3),
              (99, 181, 4, 2)]
    for (x, y, w, h) in leaves:
        s.rect(x, y, w, h, "oliveO")
        s.rect(x, y, w - 1, h - 1, "olive")
        s.rect(x, y, w - 1, 1, "oliveL")
    s.rect(95, 166, 1, 20, "oliveS")

    # 門
    s.box(97, 120, 31, 80, "woodS", "woodO", "woodL")
    s.box(100, 123, 25, 77, "wood", "woodO", "woodL", "woodS")
    s.box(104, 128, 17, 26, "wood", "woodS", None, "woodL")
    s.box(104, 160, 17, 32, "wood", "woodS", None, "woodL")
    s.rect(107, 156, 11, 2, "ink")
    s.rect(121, 160, 2, 3, "mustard")
    s.px(121, 160, "mustardL")
    s.rect(98, 200, 30, 4, "terraS")
    s.rect(99, 200, 28, 3, "terra")
    for x in range(100, 126, 3):
        s.px(x, 201, "terraL")


def draw_front(s, t, state):
    # 地毯
    for y in range(248, 266):
        for x in range(48, 104):
            dx = (x - 76) / 28
            dy = (y - 257) / 9
            d = dx * dx + dy * dy
            if d <= 1:
                col = "terraS" if d > 0.86 else ("cream" if d > 0.72 else ("creamS" if d < 0.25 else "cream"))
                if 0.72 < d <= 0.86:
                    col = "mustardL"
                s.px(x, y, col)

    # 床
    s.box(2, 200, 8, 64, "wood", "woodO", "woodL", "woodS")
    s.rect(1, 199, 10, 3, "woodO"); s.rect(2, 199, 8, 1, "woodL")
    s.box(60, 232, 6, 32, "wood", "woodO", "woodL", "woodS")
    s.box(9, 244, 52, 9, "wood", "woodO", "woodL", "woodS")
    s.rect(11, 253, 3, 9, "woodO"); s.rect(56, 253, 3, 9, "woodO")
    s.rect(10, 234, 51, 10, "creamO")
    s.rect(10, 234, 50, 9, "white")
    s.box(11, 226, 16, 10, "white", "creamO", None, "creamS")
    s.rect(13, 228, 12, 1, "creamS")
    if state == "sleep" and not SPRITE_DIR:
        draw_sleep_head(s)
    # 被子
    top = 229
    if state == "sleep":
        s.rect(26, 225, 30, 6, "oliveO")
        s.rect(27, 226, 28, 5, "olive")
        s.rect(27, 226, 28, 1, "oliveL")
    s.rect(24, top, 37, 17, "oliveO")
    s.rect(25, top + 1, 35, 15, "olive")
    s.rect(25, top + 1, 35, 4, "cream")
    s.rect(25, top + 4, 35, 1, "creamS")
    for (x, y) in [(30, 237), (38, 240), (46, 237), (54, 240), (34, 243), (50, 243)]:
        s.px(x, y, "oliveL")
        s.px(x + 1, y, "oliveL")
    s.rect(25, top + 14, 35, 1, "oliveS")
    # 床上的手機
    s.rect(47, 234, 5, 8, "ink")
    s.rect(48, 235, 3, 6, hx("#8FD8FF"), emit=True)
    s.px(50, 235, "terra", emit=True)

    # 電視櫃
    s.box(92, 236, 36, 26, "wood", "woodO", "woodL", "woodS")
    s.rect(95, 241, 30, 12, "woodO")
    s.rect(96, 242, 28, 10, hx("#6E4A33"))
    s.box(98, 246, 14, 6, hx("#EDEDF2"), "slateO", "white", hx("#C9C9D6"))
    s.px(109, 248, "terra", emit=True)
    s.box(114, 247, 8, 5, hx("#EDEDF2"), "slateO", "white", hx("#C9C9D6"))
    s.rect(95, 256, 30, 1, "woodS")
    s.rect(108, 255, 4, 1, "mustardS")
    s.rect(94, 262, 2, 3, "woodO"); s.rect(124, 262, 2, 3, "woodO")
    # 電視
    s.box(95, 208, 30, 26, "ink", "ink")
    tv_on = t != "night" or state != "sleep"
    s.rect(97, 210, 26, 21, hx("#9ED3E0" if tv_on else "#1E2430"), emit=tv_on)
    if tv_on:
        s.rect(97, 225, 26, 6, hx("#6FAF5E"), emit=True)
        s.rect(97, 225, 26, 1, hx("#9BD483"), emit=True)
        s.rect(102, 220, 4, 5, hx("#E2B455"), emit=True)
        s.rect(102, 219, 4, 1, hx("#D47F58"), emit=True)
        s.rect(114, 216, 3, 3, hx("#D47F58"), emit=True)
        s.rect(108, 213, 7, 2, hx("#FFFFFF"), emit=True)
        s.rect(118, 222, 3, 3, hx("#F0CF7E"), emit=True)
    s.rect(104, 234, 12, 2, "ink")

    # 啞鈴
    s.rect(54, 255, 3, 6, "slateO"); s.rect(54, 255, 2, 5, "slate")
    s.rect(63, 255, 3, 6, "slateO"); s.rect(63, 255, 2, 5, "slate")
    s.rect(57, 257, 6, 2, "creamO"); s.rect(57, 257, 6, 1, "cream")

    # 工具箱
    s.rect(7, 264, 10, 2, "ink"); s.rect(7, 264, 1, 3, "ink"); s.rect(16, 264, 1, 3, "ink")
    s.box(3, 266, 18, 12, hx("#D9573F"), hx("#7E2E21"), hx("#EE8066"), hx("#B23B2B"))
    s.rect(4, 270, 16, 1, hx("#7E2E21"))
    s.rect(11, 269, 2, 3, "mustard")


SPRITE_DIR = None  # 設定後改用清洗過的人物圖


def paste(s, path, x, bottom):
    sp = np.asarray(Image.open(path).convert("RGBA")).astype(float)
    h, w = sp.shape[:2]
    y = bottom - h
    for j in range(h):
        for i in range(w):
            if sp[j, i, 3] > 127 and 0 <= y + j < H and 0 <= x + i < W:
                s.img[y + j, x + i] = sp[j, i, :3]
                s.char[y + j, x + i] = True
    return w, h


def floor_shadow(s, cx, y, rx):
    for i in range(-rx, rx + 1):
        for j in range(2):
            xx, yy = cx + i, y + j
            if 0 <= xx < W and 0 <= yy < H and abs(i) <= rx - j * 2:
                s.img[yy, xx] *= 0.8


def draw_char(s, state):
    if SPRITE_DIR:
        if state == "idle":
            floor_shadow(s, 76, 263, 12)
            paste(s, f"{SPRITE_DIR}/boy_front_54.png", 61, 264)
        elif state == "busy":
            floor_shadow(s, 76, 263, 12)
            paste(s, f"{SPRITE_DIR}/boy_phone_54.png", 60, 264)
        elif state == "sleep":
            paste(s, f"{SPRITE_DIR}/boy_sleep_54.png", 14, 247)
        return
    pal = CHAR_PAL
    if state == "idle":
        x, y = 68, 226
        shadow(s, x + 2, y + 29, 16)
        s.sprite(CHAR, pal, x, y)
    elif state == "busy":
        x, y = 50, 172
        shadow(s, x + 2, y + 29, 16)
        rows = [list(r) for r in CHAR]
        # 低頭看手機：眼睛往下
        for j in (11, 12):
            for i, ch in enumerate(rows[j]):
                if ch in "ew":
                    rows[j][i] = "s"
        for i in (5, 6, 13, 14):
            rows[12][i] = "e"
        s.sprite(["".join(r) for r in rows], pal, x, y)
        # 手機和舉起的手
        s.rect(x + 11, y + 18, 5, 7, hx("#2E2230"))
        s.rect(x + 12, y + 19, 3, 5, hx("#8FD8FF"), emit=True)
        s.rect(x + 11, y + 23, 2, 2, hx("#F6D7BC"))
        s.rect(x + 15, y + 22, 2, 2, hx("#F6D7BC"))


def draw_sleep_head(s):
    if True:
        x, y = 8, 216
        pal = CHAR_PAL
        rows = [list(r) for r in CHAR[:16]]
        for j in (11, 12):
            for i, ch in enumerate(rows[j]):
                if ch in "ew":
                    rows[j][i] = "s"
        for i in (5, 6, 13, 14):
            rows[12][i] = "e"
        rows[11][4] = "e"; rows[11][15] = "e"
        s.sprite(["".join(r) for r in rows], pal, x, y)


def shadow(s, x, y, w):
    for i in range(w):
        for j in range(2):
            s.img[min(H - 1, y + j), min(W - 1, x + i)] *= 0.78


def lighting(s, t, weather, state):
    img = s.img
    yy, xx = np.mgrid[0:H, 0:W]
    if t == "day" and weather != "rain":
        # 窗戶照進來的光：牆上斜斜的光帶＋地上的光斑
        band = (xx - (47 + (yy - 92) * 0.55) >= 0) & (xx - (87 + (yy - 92) * 0.55) <= 0) & (yy > 96) & (yy < 200)
        img[band & ~s.emit] = img[band & ~s.emit] * 0.85 + hx("#FFF6E2") * 0.15
        patch = (yy >= 202) & (yy <= 232) & (xx >= 60 + (yy - 202) * 0.9) & (xx <= 104 + (yy - 202) * 0.9)
        img[patch & ~s.emit] = img[patch & ~s.emit] * 0.72 + hx("#FFF3D6") * 0.28
    if t == "dusk":
        m = ~s.emit
        img[m] = img[m] * 0.78 + hx("#E0895E") * 0.22
        d = np.hypot(xx - 88, (yy - 168) * 1.1)
        glow = np.clip(1 - d / 40, 0, 1) ** 1.6
        img[m] += (hx("#FFD08A") * 0.35)[None, :] * glow[m][:, None]
        band = (xx - (47 + (yy - 92) * 0.9) >= 0) & (xx - (87 + (yy - 92) * 0.9) <= 0) & (yy > 96) & (yy < 200)
        if weather != "rain":
            img[band & m] = img[band & m] * 0.8 + hx("#FFC58C") * 0.2
    if weather == "rain":
        m = ~s.emit
        img[m] = img[m] * 0.9 + hx("#6C7A92") * 0.1
    if t == "night":
        m = ~s.emit & ~s.char
        img[m] = img[m] * np.array([0.42, 0.42, 0.62])
        img[s.char] = img[s.char] * np.array([0.78, 0.76, 0.92]) + hx("#3A3F6A") * 0.08
        m = ~s.emit
        # 檯燈的暖光
        d = np.hypot(xx - 88, (yy - 168) * 1.1)
        glow = np.clip(1 - d / 46, 0, 1) ** 1.6
        img[m] += (hx("#FFD08A") * 0.55)[None, :] * glow[m][:, None] * 1.0
        img[m] = np.maximum(img[m], 0)
        # 燈串小光暈
        for x in range(10, 124, 11):
            y = 11 + int(round(2.2 * math.sin((x - 4) / 121 * math.pi)))
            dd = np.hypot(xx - x, yy - y)
            g = np.clip(1 - dd / 6, 0, 1) ** 2
            img[m] += (hx("#FFD08A") * 0.35)[None, :] * g[m][:, None]
        # 電視／手機的冷光
        if state != "sleep":
            d2 = np.hypot(xx - 110, yy - 222)
            g2 = np.clip(1 - d2 / 34, 0, 1) ** 2
            img[m] += (hx("#9ED3E0") * 0.3)[None, :] * g2[m][:, None]
    np.clip(img, 0, 255, out=img)


def render(t, state, weather, out):
    s = Scene()
    draw_room(s, t, weather)
    if state == "busy":
        s.rect(102, 189, 13, 11, hx("#A9784C"))
        s.rect(103, 190, 11, 9, hx("#D9A76A"))
        s.rect(103, 190, 11, 1, hx("#E8C08A"))
        s.rect(108, 190, 2, 9, hx("#F4ECDD"))
    draw_front(s, t, state)
    draw_char(s, state)
    lighting(s, t, weather, state)
    im = Image.fromarray(s.img.astype(np.uint8), "RGB")
    im.save(out)
    im.resize((W * 3, H * 3), Image.NEAREST).save(out.replace(".png", "@3x.png"))


if __name__ == "__main__":
    outdir = sys.argv[1]
    if len(sys.argv) > 2:
        SPRITE_DIR = sys.argv[2]
    render("day", "idle", "sunny", f"{outdir}/room-day.png")
    render("dusk", "busy", "rain", f"{outdir}/room-dusk.png")
    render("night", "sleep", "sunny", f"{outdir}/room-night.png")
    for r in CHAR:
        assert len(r) == 20, (len(r), r)
    print("ok")
