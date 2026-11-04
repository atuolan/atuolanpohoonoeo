"""
客廳細拆（在 split_room.py 之後跑）：
- 牆再拆成壁紙、護牆板
- 窗戶拆成窗框（含玻璃、窗外、窗台）、窗簾（含窗簾桿）、窗台盆栽、花瓶，被擋住的地方補畫
- 電視拆成電視、電視櫃

用法：python3 -I refine_living.py <split 輸出資料夾>
"""
import json
import sys

from PIL import Image

out = sys.argv[1]
meta = json.load(open(f"{out}/layout.json", encoding="utf-8"))
W, H = meta["size"]


def hexc(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


def load_item(item_id):
    it = next(i for i in meta["items"] if i["id"] == item_id)
    sp = Image.open(f"{out}/items/{item_id}.png").convert("RGBA")
    # 換成整張房間座標的畫布，好用絕對座標操作
    full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    full.alpha_composite(sp, (it["x"], it["y"]))
    return it, full


def save_item(item_id, name, full, base=None):
    bbox = full.getbbox()
    sp = full.crop(bbox)
    sp.save(f"{out}/items/{item_id}.png")
    entry = {"id": item_id, "name": name, "x": bbox[0], "y": bbox[1], "w": bbox[2] - bbox[0], "h": bbox[3] - bbox[1]}
    if base:
        entry.update({k: v for k, v in base.items() if k in ("layer",)})
    return entry


def take(full, pred):
    """把符合條件的像素從 full 搬到新的一層"""
    part = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fp, pp = full.load(), part.load()
    for y in range(H):
        for x in range(W):
            c = fp[x, y]
            if c[3] and pred(x, y, c):
                pp[x, y] = c
                fp[x, y] = (0, 0, 0, 0)
    return part


def paint(full, x0, y0, x1, y1, color, only_empty=False):
    fp = full.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if only_empty and fp[x, y][3]:
                continue
            fp[x, y] = color


def rgb(c):
    return "%02x%02x%02x" % c[:3]


# ===== 牆拆成壁紙、護牆板 =====
wall = Image.open(f"{out}/wall.png").convert("RGBA")
wm = meta["wall"]
full_wall = Image.new("RGBA", (W, H), (0, 0, 0, 0))
full_wall.alpha_composite(wall, (wm["x"], wm["y"]))
WAINSCOT_TOP = 127
wainscot = take(full_wall, lambda x, y, c: y >= WAINSCOT_TOP)
for name, layer in (("wall", full_wall), ("wainscot", wainscot)):
    bbox = layer.getbbox()
    layer.crop(bbox).save(f"{out}/{name}.png")
    meta[name] = {"x": bbox[0], "y": bbox[1], "w": bbox[2] - bbox[0], "h": bbox[3] - bbox[1]}

new_items = []
names = {i["id"]: i["name"] for i in meta["items"]}

# ===== 窗戶 =====
_, win = load_item("window")
VIEW_TREE = hexc("a9b799")
SILL_TOP = hexc("744b33")  # 窗台上緣
SILL_BODY = hexc("9a6546")
SILL_EDGE = hexc("6a452f")
FRAME_SIDE = hexc("ce9b77")

# 窗簾：窗簾桿（38～40 列整排）＋左右兩片
curtains = take(
    win,
    lambda x, y, c: (y <= 40) or (10 <= x <= 21 and 41 <= y <= 91) or (54 <= x <= 61 and 39 <= y <= 91),
)
# 窗台被窗簾蓋住的部分補回去：91 列是窗台邊線
paint(win, 13, 91, 22, 92, SILL_EDGE, only_empty=True)
paint(win, 54, 91, 59, 92, SILL_EDGE, only_empty=True)

# 窗台盆栽：22～30 欄、79～90 列裡不是窗外景色的像素
VIEW = {"cce4f0", "a9b799", "fdeede"}
plant = take(
    win,
    lambda x, y, c: 23 <= x <= 30 and 79 <= y <= 90 and rgb(c) not in VIEW and rgb(c) not in ("9a6546", "744b33"),
)
# 窗框左側被擋住的一段補回去
paint(win, 22, 79, 23, 88, FRAME_SIDE)
# 盆栽後面的窗外是樹叢
paint(win, 23, 79, 31, 88, VIEW_TREE, only_empty=True)
# 窗台
paint(win, 23, 88, 31, 90, SILL_BODY, only_empty=True)
paint(win, 23, 90, 31, 91, SILL_TOP, only_empty=True)

# 花瓶：45～51 欄、76～90 列
def is_vase(x, y, c):
    if not (45 <= x <= 51 and 76 <= y <= 90):
        return False
    # 瓶身下半只有 47～51 欄，左下角那塊是窗台
    if y >= 86 and x < 47:
        return False
    h = rgb(c)
    if y >= 83 and 47 <= x <= 51:
        return h not in ("9a6546", "744b33")
    return h not in VIEW or h == "fdeede" and y >= 76

vase = take(win, is_vase)
paint(win, 45, 76, 52, 88, VIEW_TREE, only_empty=True)
paint(win, 45, 88, 52, 90, SILL_BODY, only_empty=True)
paint(win, 45, 90, 52, 91, SILL_TOP, only_empty=True)

new_items += [
    (win, "window", "窗戶"),
    (curtains, "curtains", "窗簾"),
    (plant, "sill-plant", "窗台小盆栽"),
    (vase, "vase", "花瓶"),
]

# ===== 電視、電視櫃 =====
_, tvfull = load_item("tv")
tv_only = take(tvfull, lambda x, y, c: y <= 133)
new_items += [(tv_only, "tv", "電視"), (tvfull, "tv-cabinet", "電視櫃")]

# ===== 寫回 =====
replaced = {"window", "tv"}
items = []
for it in meta["items"]:
    if it["id"] in replaced:
        for full, iid, name in [n for n in new_items if n[1] in ({"window", "curtains", "sill-plant", "vase"} if it["id"] == "window" else {"tv", "tv-cabinet"})]:
            items.append(save_item(iid, name, full))
    else:
        items.append(it)
meta["items"] = items
json.dump(meta, open(f"{out}/layout.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n".join(f"{i['id']} {i['x']},{i['y']} {i['w']}x{i['h']}" for i in items))
