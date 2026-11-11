"""
家具的款式（換色、換花樣）：在擺件商店的「換款式」買，換上之後那件家具換成這張圖。

- 每個款式跟原本的家具一樣大，換了不會影響擺放、前後、他站哪
- 換色：拿已經畫好的圖（public/pixel-house/<房間>/items/<id>.png，或擺件 decor/<id>.png）把某一組顏色換掉
  （例如沙發的綠色那組整組換成粉紅），其他顏色（抱枕、木頭、外框）不動
- 原本有其他狀態的圖（床睡覺時的 -sleep、信箱有信的 -full）也一起換，換了款式狀態圖還是對的
- 換花樣：重新畫（床的被子：條紋、點點），再換色

輸出 public/pixel-house/skins/<房間>/<家具 id>/<款式 id>[-sleep|-full|-night].png 和 skins/skins.json
"""
import colorsys
import json
import os

from PIL import Image

from kit import PAL, ROOT, hx

# ===== 顏色組：一件家具裡「要換的那些顏色」 =====

def _c(*names):
    return [PAL[n][:3] if n in PAL else hx(n)[:3] for n in names]


GREEN = _c("g4", "g2", "g1", "g3", "#c4dcb0", "#bcd6a8", "#d6e8c6")
RED = _c("r2", "r1", "r3")
MINT = _c("m4", "m2", "m1", "m3")
PINK = _c("pk2", "pk1", "pk3", "#8a7570")
BLUE = _c("b2", "b1", "b3", "#5e89aa", "#4f86ad")
WHITE = _c("wh3", "wh2", "wh")
CREAM_RUG = _c("#b08a63", "#d9b98f", "#e3cfae", "#f5e9d3")
MINT_RUG = _c("#b08a63", "#b4c8a2", "#cfdcbf", "#eef3e4")
SHADE = _c("#fbeecb", "#f3dfb0", "y1", "y3")
STAR = _c("y2", "y1", "glow")

# ===== 換成什麼顏色：(色相°, 飽和度乘幾倍, 飽和度加多少, 亮度乘幾倍) =====
# 換的時候每個顏色保留自己的亮度，所以原本的亮面、暗面、外框深淺都還在
TONES = {
    "pink": (350, 0.95, 0.0, 1.03),
    "rose": (340, 1.1, 0.05, 0.97),
    "blue": (205, 1.0, 0.0, 1.0),
    "navy": (222, 1.2, 0.1, 0.85),
    "yellow": (44, 1.15, 0.05, 1.04),
    "orange": (24, 1.15, 0.05, 1.0),
    "purple": (265, 0.85, 0.0, 1.0),
    "mint": (160, 0.9, 0.0, 1.02),
    "green": (100, 1.0, 0.0, 1.0),
    "red": (4, 1.0, 0.0, 1.0),
    "grey": (30, 0.12, 0.0, 1.0),
    "white": (40, 0.15, 0.0, 1.08),
    "brown": (25, 0.9, 0.0, 0.8),
}
# 白色、米色這種幾乎沒有顏色的，換成彩色時要加飽和度
TINT = {k: (h, 1.0, 0.14, 0.99) for k, (h, *_rest) in TONES.items()}

# 每組顏色換過去要再調一下：(飽和度乘幾倍, 亮度乘幾倍)
# 綠色那組是灰灰的鼠尾草綠，直接換色相會變髒，要亮一點、鮮一點；紅色那組本來就很鮮豔，換成別的顏色要收一點
def adjusted(spec, adj):
    h, sm, sa, vm = spec
    return (h, sm * adj[0], sa, min(1.25, vm * adj[1]))


def tone(c, spec):
    h, sm, sa, vm = spec
    r, g, b = (x / 255 for x in c)
    _, s, v = colorsys.rgb_to_hsv(r, g, b)
    s = min(1.0, max(0.0, s * sm + sa))
    v = min(1.0, max(0.0, v * vm))
    r, g, b = colorsys.hsv_to_rgb(h / 360, s, v)
    return (round(r * 255), round(g * 255), round(b * 255))


def recolor(im, family, spec):
    """只換 family 裡的顏色"""
    table = {c: tone(c, spec) for c in family}
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            if p[3] and p[:3] in table:
                px[x, y] = table[p[:3]] + (p[3],)
    return out


# ===== 款式清單 =====
# (房間, 家具 id, 款式 id, 名字, 價錢, 顏色組, 色調名, 白色系要加飽和度)
RECOLORS = []


def add(room, item, family, price, tones, tint=False):
    for vid, name in tones:
        RECOLORS.append((room, item, vid, name, price, family, vid, tint))


def family_adjust(family):
    if family is GREEN:
        return (1.25, 1.1)
    if family is RED:
        return (0.72, 1.06)
    return (1.0, 1.0)


# 客廳
add("living", "sofa", GREEN, 1600, [("pink", "粉紅"), ("blue", "天藍"), ("yellow", "芥末黃"), ("grey", "灰色"), ("navy", "深藍")])
add("living", "rug", CREAM_RUG, 1200, [("mint", "薄荷綠"), ("pink", "粉紅"), ("blue", "天藍")], tint=True)
add("living", "curtains", WHITE, 1000, [("pink", "粉紅"), ("green", "淺綠"), ("blue", "天藍"), ("yellow", "奶黃")], tint=True)
add("living", "lamp", SHADE, 900, [("pink", "粉紅"), ("mint", "薄荷綠"), ("blue", "天藍")])
add("living", "mailbox", RED, 900, [("blue", "藍色"), ("green", "綠色"), ("yellow", "黃色"), ("pink", "粉紅")])
# 臥室
add("bedroom", "bed", GREEN, 1600, [("blue", "藍格子"), ("pink", "粉格子"), ("yellow", "黃格子"), ("purple", "紫格子")])
add("bedroom", "beanbag", GREEN, 1200, [("pink", "粉紅"), ("blue", "天藍"), ("yellow", "芥末黃"), ("purple", "薰衣草"), ("grey", "灰色")])
add("bedroom", "rug", MINT_RUG, 1200, [("pink", "粉紅"), ("blue", "天藍"), ("yellow", "奶黃")], tint=True)
add("bedroom", "curtains", WHITE, 1000, [("pink", "粉紅"), ("green", "淺綠"), ("blue", "天藍")], tint=True)
add("bedroom", "desk-lamp", GREEN, 800, [("pink", "粉紅"), ("blue", "天藍"), ("yellow", "黃色")])
# 廚房
add("kitchen", "fridge", MINT, 1600, [("pink", "粉紅"), ("yellow", "奶黃"), ("blue", "天藍"), ("white", "白色"), ("red", "珊瑚紅")])
add("kitchen", "pot", RED, 800, [("blue", "藍色"), ("green", "綠色"), ("yellow", "黃色"), ("orange", "橘色")])
add("kitchen", "valance", PINK, 900, [("green", "綠色"), ("blue", "藍色"), ("yellow", "黃色"), ("orange", "橘色")])
# 浴室
add("bath", "curtain", PINK, 1000, [("blue", "藍色"), ("green", "綠色"), ("yellow", "黃色"), ("purple", "紫色")])
add("bath", "bath-mat", BLUE, 900, [("pink", "粉紅"), ("green", "綠色"), ("yellow", "黃色")])
add("bath", "towels", BLUE, 800, [("pink", "粉紅"), ("yellow", "黃色"), ("green", "綠色")])
# 擺件
add("bedroom", "floor-cushion", GREEN, 800, [("pink", "粉紅"), ("blue", "天藍"), ("yellow", "芥末黃")])
add("bedroom", "star-lamp", STAR, 900, [("pink", "粉紅"), ("blue", "天藍"), ("mint", "薄荷綠")])

# 換花樣（重新畫）：(房間, 家具 id, 款式 id, 名字, 價錢, 畫的函式(sleep) → 圖, 再換色)
PATTERNS = []


def _bed_pattern(quilt, tone_name=None):
    def draw(sleep):
        import bedroom

        im = bedroom.bed(sleep=sleep, quilt=quilt).im
        return recolor(im, GREEN, adjusted(TONES[tone_name], family_adjust(GREEN))) if tone_name else im

    return draw


PATTERNS += [
    ("bedroom", "bed", "stripe", "綠條紋", 2000, _bed_pattern("stripe")),
    ("bedroom", "bed", "stripe-pink", "粉條紋", 2000, _bed_pattern("stripe", "pink")),
    ("bedroom", "bed", "dot", "綠點點", 2000, _bed_pattern("dot")),
    ("bedroom", "bed", "dot-blue", "藍點點", 2000, _bed_pattern("dot", "blue")),
    ("bedroom", "bed", "dot-yellow", "黃點點", 2000, _bed_pattern("dot", "yellow")),
]

STATES = ["sleep", "full", "night"]


def _base(room, item):
    """原本的圖在哪：房間的家具，或是擺件"""
    p = os.path.join(ROOT, room, "items", f"{item}.png")
    if os.path.exists(p):
        return p, f"{room}/items/{item}.png"
    return os.path.join(ROOT, "decor", f"{item}.png"), f"decor/{item}.png"


def _item_names():
    names = {}
    for room in ("living", "bedroom", "kitchen", "bath"):
        with open(os.path.join(ROOT, room, "layout.json"), encoding="utf-8") as f:
            for it in json.load(f)["items"]:
                names[(room, it["id"])] = it["name"]
    with open(os.path.join(ROOT, "decor", "decor.json"), encoding="utf-8") as f:
        for d in json.load(f):
            names[(d["room"], d["id"])] = d["name"]
    return names


def build():
    """回傳 [(定義, {狀態後綴: 圖})]；要先畫好房間和擺件"""
    names = _item_names()
    out = []
    for room, item, vid, name, price, family, tone_name, tint in RECOLORS:
        path, base_rel = _base(room, item)
        spec = TINT[tone_name] if tint else adjusted(TONES[tone_name], family_adjust(family))
        ims = {"": recolor(Image.open(path).convert("RGBA"), family, spec)}
        for st in STATES:
            sp = path[:-4] + f"-{st}.png"
            if os.path.exists(sp):
                ims[f"-{st}"] = recolor(Image.open(sp).convert("RGBA"), family, spec)
        out.append((room, item, vid, name, price, base_rel, ims))
    for room, item, vid, name, price, draw in PATTERNS:
        path, base_rel = _base(room, item)
        ims = {"": draw(False)}
        if os.path.exists(path[:-4] + "-sleep.png"):
            ims["-sleep"] = draw(True)
        out.append((room, item, vid, name, price, base_rel, ims))

    result = []
    for room, item, vid, name, price, base_rel, ims in out:
        base = Image.open(os.path.join(ROOT, base_rel))
        for suf, im in ims.items():
            if im.size != base.size:
                raise SystemExit(f"{room}/{item}/{vid}{suf}: {im.size} 跟原本的 {base.size} 不一樣大")
        meta = {
            "room": room,
            "item": item,
            "itemName": names.get((room, item), item),
            "id": vid,
            "name": name,
            "price": price,
            "base": base_rel,
            "w": base.width,
            "h": base.height,
        }
        result.append((meta, ims))
    return result


def save():
    d = os.path.join(ROOT, "skins")
    if os.path.isdir(d):
        for dirpath, _dirs, files in os.walk(d, topdown=False):
            for f in files:
                os.remove(os.path.join(dirpath, f))
            if dirpath != d:
                os.rmdir(dirpath)
    os.makedirs(d, exist_ok=True)
    items = build()
    for meta, ims in items:
        folder = os.path.join(d, meta["room"], meta["item"])
        os.makedirs(folder, exist_ok=True)
        for suf, im in ims.items():
            im.save(os.path.join(folder, f"{meta['id']}{suf}.png"))
    with open(os.path.join(d, "skins.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(" " + json.dumps(m, ensure_ascii=False) for m, _ in items) + "\n]\n")
    return items


def preview(path):
    """每件家具一列：原本的＋所有款式"""
    items = build()
    rows = {}
    for meta, ims in items:
        rows.setdefault((meta["room"], meta["item"]), [meta["base"]]).append(ims[""])
    pad = 3
    lines = []
    for (_room, _item), ims in rows.items():
        ims = [Image.open(os.path.join(ROOT, ims[0])).convert("RGBA")] + ims[1:]
        h = max(i.height for i in ims)
        w = sum(i.width for i in ims) + pad * (len(ims) + 1)
        line = Image.new("RGBA", (w, h + pad * 2), (247, 232, 207, 255))
        x = pad
        for i in ims:
            line.alpha_composite(i, (x, pad + h - i.height))
            x += i.width + pad
        lines.append(line)
    W = max(line.width for line in lines)
    H = sum(line.height for line in lines)
    sheet = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    y = 0
    for line in lines:
        sheet.alpha_composite(line, (0, y))
        y += line.height
    sheet.resize((W * 3, H * 3), Image.NEAREST).save(path)
