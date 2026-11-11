"""
畫像素房間用的小工具：一張透明畫布、色票、常用的形狀，還有「自動描外框」。

畫法（跟設計參考圖一樣）：先用色塊把東西畫出來，最後 outline() 沿著邊描一圈深棕色的外框。
"""
import json
import os

from PIL import Image, ImageDraw

ROOM_W, ROOM_H = 130, 282
WALL_H = 127
FLOOR_Y = 158

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "pixel-house"))


def hx(s, a=255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


# 色票：全部房間共用，看起來才像同一套
PAL = {
    "ol": "#5b3a29",  # 外框
    "ol2": "#8a6248",  # 淺一點的內線
    # 木頭
    "w1": "#c98d5a", "w2": "#b0733f", "w3": "#e0aa76", "w4": "#8f5a34", "w5": "#edc596",
    # 牆
    "cream": "#f7e8cf", "cream2": "#f0dcbd", "cream3": "#e6cda9",
    # 白
    "wh": "#fdf9f0", "wh2": "#ece4d6", "wh3": "#d6cbb9",
    # 綠
    "g1": "#8fb07a", "g2": "#6f935f", "g3": "#abc995", "g4": "#527a4a",
    "leaf1": "#6aa35c", "leaf2": "#4c8249", "leaf3": "#8ec476",
    # 薄荷（冰箱、浴室）
    "m1": "#a8dccb", "m2": "#85c3b0", "m3": "#c9eee2", "m4": "#63a593",
    "t1": "#d3eee4", "t2": "#b9e0d2", "t3": "#e6f6ef", "t4": "#9fcdbd",
    # 其他顏色
    "pk1": "#f2a9a3", "pk2": "#dd857f", "pk3": "#f9cdc6",
    "y1": "#f4c965", "y2": "#dba544", "y3": "#fbe29b",
    "b1": "#9ccbe8", "b2": "#73a9cf", "b3": "#c7e4f5",
    "r1": "#d9574c", "r2": "#b53f38", "r3": "#ec7f6f",
    "o1": "#e9925a",
    "pu1": "#b9a5e0", "pu2": "#9783c6",
    # 金屬
    "s1": "#bfc3c7", "s2": "#959a9f", "s3": "#dfe2e4", "s4": "#6f7479",
    # 深色（螢幕、鍋子）
    "k1": "#4a4a52", "k2": "#33333a", "k3": "#6a6a74",
    "terra": "#c8754f", "terra2": "#a95a3b",
    "sky": "#bfe3f6", "sky2": "#a5d3ee", "cloud": "#ffffff",
    "hill": "#9fcf8e", "hill2": "#7fb774",
    "nsky": "#2e3866", "nsky2": "#3a467a", "nhill": "#26323f", "star": "#fff4c8",
    "glow": "#fff1b8",
}
PAL = {k: hx(v) for k, v in PAL.items()}
CLEAR = (0, 0, 0, 0)


def col(c):
    if isinstance(c, tuple):
        return c
    if c.startswith("#"):
        return hx(c)
    return PAL[c]


class Cv:
    """透明畫布。座標是畫布自己的，最後裁掉空白邊。"""

    def __init__(self, w, h):
        self.im = Image.new("RGBA", (w, h), CLEAR)
        self.d = ImageDraw.Draw(self.im)
        self.w, self.h = w, h

    # --- 基本形狀（x, y, w, h） ---
    def rect(self, x, y, w, h, c):
        if w > 0 and h > 0:
            self.d.rectangle([x, y, x + w - 1, y + h - 1], fill=col(c))
        return self

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), col(c))
        return self

    def pts(self, pts, c):
        for x, y in pts:
            self.px(x, y, c)
        return self

    def h_(self, x, y, w, c):
        return self.rect(x, y, w, 1, c)

    def v_(self, x, y, h, c):
        return self.rect(x, y, 1, h, c)

    def rrect(self, x, y, w, h, c, r=1):
        """圓角方塊：四個角各切掉 r 階"""
        self.rect(x, y, w, h, c)
        for i in range(r):
            n = r - i
            for dx in range(n):
                for px, py in ((x + dx, y + i), (x + w - 1 - dx, y + i), (x + dx, y + h - 1 - i), (x + w - 1 - dx, y + h - 1 - i)):
                    self.px(px, py, CLEAR)
        return self

    def ell(self, x, y, w, h, c):
        self.d.ellipse([x, y, x + w - 1, y + h - 1], fill=col(c))
        return self

    def poly(self, pts, c):
        self.d.polygon(pts, fill=col(c))
        return self

    def line(self, x0, y0, x1, y1, c):
        self.d.line([x0, y0, x1, y1], fill=col(c))
        return self

    def clear(self, x, y, w, h):
        return self.rect(x, y, w, h, CLEAR)

    def art(self, x, y, rows, pal):
        """字元畫：每個字元查 pal（值是色票名或 #hex），'.' 和空白不畫"""
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in ". ":
                    continue
                self.px(x + i, y + j, pal[ch])
        return self

    def paste(self, other, x, y):
        im = other.im if isinstance(other, Cv) else other
        self.im.alpha_composite(im, (x, y))
        return self

    # --- 外框 ---
    def outline(self, c="ol", diag=False):
        """沿著所有不透明像素的外緣描一圈（往外長 1 格）。diag=False 時轉角是缺一格的圓角。"""
        c = col(c)
        src = self.im.copy()
        a = src.getchannel("A").load()
        out = self.im.load()
        for y in range(self.h):
            for x in range(self.w):
                if a[x, y]:
                    continue
                nb = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
                if diag:
                    nb += [(x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1), (x + 1, y + 1)]
                for nx, ny in nb:
                    if 0 <= nx < self.w and 0 <= ny < self.h and a[nx, ny]:
                        out[x, y] = c
                        break
        return self

    def box(self, x, y, w, h, fill, hi=None, sh=None, r=1):
        """常用的一塊：圓角色塊，上緣一條亮、下緣一條暗"""
        self.rrect(x, y, w, h, fill, r)
        if hi:
            self.h_(x + r, y, w - 2 * r, hi)
        if sh:
            self.h_(x + r, y + h - 1, w - 2 * r, sh)
        return self

    def crop(self):
        bb = self.im.getbbox()
        return self.im.crop(bb), bb


def flip(cv):
    out = Cv(cv.w, cv.h)
    out.im = cv.im.transpose(Image.FLIP_LEFT_RIGHT)
    out.d = ImageDraw.Draw(out.im)
    return out


# ===== 常用的小東西 =====

def plant_leaves(cv, cx, by, kind="bush", s=1):
    """葉子：畫在 (cx, by) 上面（by 是葉子最下面那列）"""
    if kind == "bush":
        rows = [
            "...l.h...",
            ".l.lhh.h.",
            ".llhlhhl.",
            "dllhllhld",
            ".dlllhld.",
            "..ddldd..",
        ]
    elif kind == "small":
        rows = [
            "..l.h..",
            ".llhhl.",
            "dlhlhld",
            ".dllld.",
        ]
    elif kind == "tall":
        rows = [
            "....h....",
            "...lhl...",
            "..llhhl..",
            ".dlhlhld.",
            "..llhhl..",
            ".dllhlhd.",
            "dllhlhlld",
            ".dlllhld.",
            "..ddldd..",
        ]
    elif kind == "fern":
        rows = [
            "l...h...l",
            ".l..h..l.",
            ".dl.h.ld.",
            "..dlhld..",
            "d.dlhld.d",
            ".ddlhldd.",
            "..ddldd..",
        ]
    pal = {"l": "leaf1", "h": "leaf3", "d": "leaf2"}
    w = len(rows[0])
    cv.art(cx - w // 2, by - len(rows) + 1, rows, pal)


def pot(cv, cx, y, w=7, h=5, c="terra", c2="terra2", rim=None):
    """盆：上寬下窄，(cx, y) 是盆口正中"""
    x = cx - w // 2
    cv.rect(x, y, w, 2, rim or c)
    cv.rect(x + 1, y + 2, w - 2, h - 2, c)
    cv.h_(x + 1, y + h - 1, w - 2, c2)
    cv.v_(x + w - 2, y + 2, h - 2, c2)


def potted(kind="bush", pot_c="terra", pot_c2="terra2", pw=7, ph=5):
    """一盆植物（描好框）"""
    cv = Cv(15, 22)
    pot(cv, 7, 22 - ph - 1, pw, ph, pot_c, pot_c2)
    plant_leaves(cv, 7, 22 - ph - 2, kind)
    return cv.outline()


def window_view(cv, x, y, w, h, night=False, moon=False, seed=0):
    """窗外：天空、雲、山丘；晚上是夜空和星星"""
    import random

    rnd = random.Random(seed)
    if night:
        cv.rect(x, y, w, h, "nsky")
        cv.rect(x, y + h // 2, w, h - h // 2, "nsky2")
        for _ in range(max(3, w * h // 90)):
            cv.px(x + rnd.randrange(w), y + rnd.randrange(max(1, h - 8)), "star")
        if moon:
            cv.ell(x + w - 11, y + 3, 6, 6, "#fbf0c6")
            cv.ell(x + w - 9, y + 2, 5, 5, "nsky")
        hill = ("nhill", "nhill")
    else:
        cv.rect(x, y, w, h, "sky")
        cv.rect(x, y + h // 2, w, h - h // 2, "b3")
        # 雲
        cx = x + 2 + rnd.randrange(max(1, w // 3))
        cv.rect(cx, y + 4, 7, 2, "cloud").rect(cx + 2, y + 3, 3, 1, "cloud")
        if w > 24:
            cx2 = x + w - 11
            cv.rect(cx2, y + 9, 6, 2, "cloud").rect(cx2 + 1, y + 8, 3, 1, "cloud")
        hill = ("hill", "hill2")
    # 山丘
    hh = max(4, h // 4)
    cv.ell(x - w // 3, y + h - hh, w, hh * 2 + 2, hill[0])
    cv.ell(x + w // 3, y + h - hh + 2, w, hh * 2, hill[1])
    # 超出窗框的裁掉由呼叫的人處理（先畫景再蓋窗框）


def clip(cv, x, y, w, h):
    """只留 (x, y, w, h) 裡面的"""
    keep = cv.im.crop((x, y, x + w, y + h))
    cv.im.paste(CLEAR, (0, 0, cv.w, cv.h))
    cv.im.paste(keep, (x, y))
    cv.d = ImageDraw.Draw(cv.im)
    return cv


# ===== 房間 =====

class Room:
    def __init__(self, rid, wall_h=WALL_H):
        self.id = rid
        self.wall_h = wall_h
        self.items = []
        self.layers = {}
        self.variants = []  # (檔名, 圖)

    def layer(self, name, cv, y):
        self.layers[name] = (cv.im if isinstance(cv, Cv) else cv, y)

    def add(self, iid, name, cv, x, bottom=None, y=None, at=None, raw=False):
        """放一件家具：x 是左邊；bottom 是底部下一列（= y + h），或直接給 y。at=(x, y, w, h) 會檢查大小。
        raw=True：整張畫布都算（不裁空白邊），給有另一張圖要換的家具用。"""
        im = cv.im if raw else cv.crop()[0]
        w, h = im.size
        if y is None:
            y = bottom - h
        if at and (at[2], at[3]) != (w, h):
            print(f"  !! {self.id}/{iid}: 畫出來 {w}x{h}，預期 {at[2]}x{at[3]}")
        if x < 0 or y < 0 or x + w > ROOM_W or y + h > ROOM_H:
            print(f"  !! {self.id}/{iid}: 超出房間 x={x} y={y} w={w} h={h}")
        self.items.append({"id": iid, "name": name, "x": x, "y": y, "w": w, "h": h, "im": im})
        return self.items[-1]

    def variant(self, iid, suffix, cv):
        """同一件的另一張圖（晚上、有信）：要跟原本一樣大"""
        base = next(i for i in self.items if i["id"] == iid)
        im = cv.im if cv.im.size == base["im"].size else cv.crop()[0]
        if im.size != base["im"].size:
            print(f"  !! {self.id}/{iid}-{suffix}: {im.size} 跟原圖 {base['im'].size} 不一樣大")
        self.variants.append((f"{iid}-{suffix}", im))

    def save(self):
        out = os.path.join(ROOT, self.id)
        idir = os.path.join(out, "items")
        os.makedirs(idir, exist_ok=True)
        for f in os.listdir(idir):
            os.remove(os.path.join(idir, f))
        layout = {"size": [ROOM_W, ROOM_H], "layers": list(self.layers)}
        for name, (im, y) in self.layers.items():
            im.save(os.path.join(out, f"{name}.png"))
            layout[name] = {"x": 0, "y": y, "w": im.width, "h": im.height}
        layout["items"] = []
        for it in self.items:
            it["im"].save(os.path.join(idir, f"{it['id']}.png"))
            layout["items"].append({k: it[k] for k in ("id", "name", "x", "y", "w", "h")})
        for name, im in self.variants:
            im.save(os.path.join(idir, f"{name}.png"))
        with open(os.path.join(out, "layout.json"), "w", encoding="utf-8") as f:
            f.write("{\n")
            keys = [k for k in layout if k != "items"]
            for k in keys:
                f.write(f' "{k}": {json.dumps(layout[k], ensure_ascii=False)},\n')
            f.write(' "items": [\n')
            f.write(",\n".join("  " + json.dumps(i, ensure_ascii=False) for i in layout["items"]))
            f.write("\n ]\n}\n")

    def compose(self, empty=False, night=False):
        """整間疊起來（預覽用；前後順序是簡化的：照清單順序）"""
        im = Image.new("RGBA", (ROOM_W, ROOM_H), (255, 255, 255, 255))
        for name, (lim, y) in self.layers.items():
            im.alpha_composite(lim, (0, y))
        if not empty:
            var = dict(self.variants)
            for it in self.items:
                src = var.get(it["id"] + "-night") if night else None
                im.alpha_composite(src or it["im"], (it["x"], it["y"]))
        return im


# ===== 空房間的牆和地板 =====

def striped_wall(h, base="cream", stripe="cream2", period=8, top_shade=None):
    cv = Cv(ROOM_W, h)
    cv.rect(0, 0, ROOM_W, h, base)
    for x in range(period - 1, ROOM_W, period):
        cv.v_(x, 0, h, stripe)
    return cv


def wood_wainscot(h=FLOOR_Y - WALL_H):
    """護牆板：上面一條腰線，中間直條木板，下面踢腳板"""
    cv = Cv(ROOM_W, h)
    cv.rect(0, 0, ROOM_W, h, "w3")
    for x in range(9, ROOM_W, 10):
        cv.v_(x, 3, h - 9, "w1")
        cv.v_(x + 1, 3, h - 9, "w5")
    cv.h_(0, 0, ROOM_W, "ol").h_(0, 1, ROOM_W, "w5").h_(0, 2, ROOM_W, "w1").h_(0, 3, ROOM_W, "w2")
    cv.h_(0, h - 7, ROOM_W, "ol").rect(0, h - 6, ROOM_W, 5, "w1").h_(0, h - 6, ROOM_W, "w3").h_(0, h - 1, ROOM_W, "ol")
    return cv


def wood_floor(h=ROOM_H - FLOOR_Y, plank=12):
    """木地板：一條一條，接縫錯開"""
    cv = Cv(ROOM_W, h)
    cv.rect(0, 0, ROOM_W, h, "w1")
    tones = ["w1", "#d09662", "#c2864f", "w1", "#cf9560", "#c68b56"]
    r = 0
    for y in range(0, h, plank):
        off = [0, 26, 13, 39, 7, 33][r % 6]
        # 每塊板子一個色調
        x = off - 52
        k = r
        while x < ROOM_W:
            cv.rect(max(x, 0), y, min(52, ROOM_W - max(x, 0)) if x >= 0 else 52 + x, plank, tones[k % len(tones)])
            x += 52
            k += 1
        cv.h_(0, y, ROOM_W, "w3")
        cv.h_(0, y + plank - 1, ROOM_W, "w2")
        x = off - 52
        while x < ROOM_W:
            if x > 0:
                cv.v_(x, y, plank - 1, "w2")
            x += 52
        r += 1
    cv.h_(0, 0, ROOM_W, "w2")
    return cv
