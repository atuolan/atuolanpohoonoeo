"""
擺件：不是房間原本就有的，要在擺件商店買了才會出現（public/pixel-house/decor/）。

每件：id、名字、價錢、預設放在哪間的哪裡、是不是掛在牆上的。
decor.json 是程式讀的清單（HouseDecorShop、PixelHouseHome）。
"""
import json
import os

import common as C
from bedroom import cat as _cat_pillow  # noqa: F401  （同一個資料夾，確認 import 路徑沒壞）
from kit import ROOT, Cv, plant_leaves, pot


def bed_shelf():
    """床頭書櫃：放在床後面，露出上面一排書和一盞小夜燈"""
    w, h = 64, 34
    cv = Cv(w, h)
    y0 = 9  # 上面留給小夜燈和盆栽
    cv.rect(1, y0, w - 2, 3, "w3").h_(1, y0, w - 2, "w5").h_(1, y0 + 2, w - 2, "w1")
    cv.rect(2, y0 + 3, w - 4, h - y0 - 4, "w1").v_(2, y0 + 3, h - y0 - 4, "w3").v_(w - 3, y0 + 3, h - y0 - 4, "w2")
    cv.h_(2, y0 + 3, w - 4, "ol")
    # 一排開放的格子
    cv.rect(4, y0 + 5, w - 8, 11, "w4")
    cv.rect(31, y0 + 5, 2, 11, "w1")
    cols = [("b2", "b1"), ("r2", "r1"), ("y2", "y1"), ("g4", "g1"), ("pu2", "pu1"), ("wh3", "wh")]
    base = y0 + 15
    x = 5
    for i in range(8):
        d, l = cols[(i * 2 + 1) % len(cols)]
        bh = 9 - (i % 3)
        bw = 2 + (i % 2)
        cv.rect(x, base - bh + 1, bw, bh, d).v_(x, base - bh + 1, bh, l)
        x += bw
    # 右邊：橫放的書和小盒子
    for i, (d, l) in enumerate((cols[0], cols[2], cols[1])):
        cv.rect(35, base - 1 - i * 2, 12 - i * 2, 2, d).h_(35, base - 1 - i * 2, 12 - i * 2, l)
    cv.rect(50, base - 5, 8, 6, "g1").h_(50, base - 5, 8, "g3").h_(50, base - 3, 8, "g2")
    cv.rect(2, y0 + 17, w - 4, 2, "w1").h_(2, y0 + 17, w - 4, "w3")
    # 上面：盆栽（左）、小夜燈（中）
    pot(cv, 9, y0 - 4, 7, 4, "terra", "terra2")
    plant_leaves(cv, 9, y0 - 5, "small")
    cv.outline()
    lamp = Cv(11, 10)
    lamp.ell(2, 1, 7, 7, "glow").px(4, 2, "#ffffff").px(4, 3, "#ffffff")
    lamp.rect(3, 7, 5, 2, "w2").h_(3, 7, 5, "w1")
    lamp.outline("y2")
    lamp.rect(3, 7, 5, 2, "w2").h_(3, 7, 5, "w1").h_(2, 9, 7, "ol")
    cv.paste(lamp, 26, y0 - 9)
    return cv


def shelf_cat():
    """牆上的層板，上面趴著一隻睡覺的橘貓"""
    cv = Cv(30, 16)
    c, c2 = "#f0a45a", "#d98840"
    rows = [
        "...............O...O..",
        "......oOOOOOOOOOOOOOO.",
        "....oOOOoOOOoOOOOOOOOO",
        "...oOOOOoOOOoOOOkOOOkO",
        "..OOOOOOOOOOOOOOOOpOOO",
        ".OOWWOOOOOOOOOOWWWWWWO",
        "OOO.WWWWWWWWWWWWWWWWW.",
    ]
    cv.art(5, 2, rows, {"O": c, "o": c2, "k": "ol", "p": "pk2", "W": "wh"})
    cv.outline()
    sh = Cv(30, 6)
    sh.rect(1, 1, 28, 2, "w1").h_(1, 1, 28, "w3").rect(4, 3, 2, 2, "w2").rect(24, 3, 2, 2, "w2")
    out = Cv(30, 16)
    out.paste(sh.outline(), 0, 10).paste(cv, 0, 1)
    return out


def star_lamp():
    """星星燈"""
    cv = Cv(13, 15)
    rows = [
        ".....#.....",
        "....###....",
        "....###....",
        "###########",
        ".#########.",
        "..#######..",
        "..#######..",
        ".####.####.",
        ".##.....##.",
    ]
    cv.art(1, 1, rows, {"#": "y1"})
    cv.art(1, 1, ["", "....#", "....#", ".####", "..###", "...##"], {"#": "glow"})
    cv.outline("y2")
    cv.rect(4, 11, 5, 2, "w2").h_(4, 11, 5, "w1")
    cv.h_(3, 13, 7, "ol").v_(3, 11, 2, "ol").v_(9, 11, 2, "ol")
    return cv


def headphones():
    """掛在牆上的耳機"""
    cv = Cv(13, 17)
    cv.rect(5, 1, 3, 3, "w2").px(6, 1, "w3")
    hp = Cv(13, 17)
    hp.rect(3, 4, 7, 2, "k1").rect(2, 5, 2, 5, "k1").rect(9, 5, 2, 5, "k1").h_(4, 4, 5, "k3")
    hp.rrect(1, 9, 4, 6, "k1", 1).rrect(8, 9, 4, 6, "k1", 1)
    hp.v_(2, 10, 4, "k3").v_(9, 10, 4, "k3").px(3, 12, "r1").px(10, 12, "r1")
    cv.outline()
    cv.paste(hp.outline("#2a2a30"), 0, 0)
    return cv


def pendant_lamp(cord=20):
    """吊燈：從天花板垂下來"""
    cv = Cv(17, cord + 16)
    cv.rect(8, 0, 1, cord, "k1")
    y = cord
    cv.rect(7, y, 3, 2, "k1")
    cv.poly([(6, y + 2), (10, y + 2), (15, y + 8), (1, y + 8)], "k1")
    cv.line(6, y + 2, 2, y + 7, "k3")
    cv.rect(1, y + 8, 15, 1, "k2")
    out = cv.outline("#2a2a30")
    out.rect(8, 0, 1, cord - 1, "k1")
    out.clear(7, 0, 1, cord - 1).clear(9, 0, 1, cord - 1)
    # 燈泡和光
    out.rect(6, y + 10, 5, 3, "glow").rect(7, y + 13, 3, 1, "y1").px(7, y + 10, "#ffffff")
    out.pts([(5, y + 11), (11, y + 11), (6, y + 13), (10, y + 13), (7, y + 14), (9, y + 14), (8, y + 14)], "y2")
    return out


def floor_cushion():
    """圓坐墊"""
    cv = Cv(24, 11)
    cv.ell(1, 1, 22, 8, "g1")
    cv.ell(1, 3, 22, 7, "g2")
    cv.ell(1, 1, 22, 7, "g1")
    cv.ell(5, 2, 14, 4, "g3")
    cv.px(11, 4, "g2").px(12, 4, "g2")
    cv.line(4, 5, 7, 6, "g2").line(19, 5, 16, 6, "g2")
    return cv.outline()


def yarn_ball():
    """毛線球（貓叼回來的）"""
    cv = Cv(14, 10)
    cv.ell(1, 1, 9, 8, "pk1")
    cv.line(2, 3, 8, 7, "pk2").line(3, 1, 9, 5, "pk2").line(1, 6, 5, 8, "pk3")
    cv.px(4, 2, "pk3").px(5, 2, "pk3")
    cv.outline()
    # 拖出來的一段線
    cv.line(10, 7, 12, 8, "pk2").px(13, 7, "pk2")
    return cv


def feather():
    """羽毛（貓叼回來的）"""
    cv = Cv(14, 8)
    rows = [
        "........bbb.",
        ".....bbbBBbb",
        "..bbbBBBBbb.",
        "bbbBBBbbb...",
        ".bbbbb......",
    ]
    cv.art(1, 1, rows, {"b": "b3", "B": "b1"})
    cv.outline("b2")
    cv.line(0, 6, 9, 2, "wh3")
    return cv


def little_flower():
    """插在小玻璃杯裡的一朵花（貓叼回來的）"""
    cv = Cv(11, 16)
    cv.art(1, 1, ["..p.p..", ".ppppp.", "ppPyPpp", ".ppppp.", "..p.p.."], {"p": "pk1", "P": "pk3", "y": "y1"})
    cv.v_(4, 6, 4, "leaf2").px(5, 7, "leaf1").px(6, 7, "leaf1")
    cv.rect(1, 9, 7, 5, "b3").v_(1, 9, 5, "b1").h_(1, 13, 7, "b1").v_(4, 9, 4, "leaf2")
    cv.outline()
    return cv


# 貓叼回來的：商店不賣，只能等貓帶回家（價錢 0、cat_only）
CAT_FINDS = [
    ("cat-yarn", "毛線球", yarn_ball, 0, "living", 70, {"bottom": 200}, False),
    ("cat-feather", "羽毛", feather, 0, "bedroom", 70, {"bottom": 214}, False),
    ("cat-flower", "小花", little_flower, 0, "kitchen", 97, {"bottom": 221}, False),
]

# id、名字、圖、價錢、預設放哪間、x、底部那列（或 y）、是不是掛在牆上
DECOR = [
    ("bed-shelf", "床頭書櫃和小夜燈", bed_shelf, 3800, "bedroom", 4, {"bottom": 192}, False),
    ("shelf-cat", "牆上睡覺的橘貓", shelf_cat, 3200, "bedroom", 98, {"y": 63}, True),
    ("star-lamp", "星星燈", star_lamp, 1800, "bedroom", 61, {"bottom": 87}, False),
    ("headphones", "耳機", headphones, 1500, "bedroom", 37, {"y": 99}, True),
    ("pendant-lamp", "吊燈", pendant_lamp, 2600, "bedroom", 13, {"y": 0}, True),
    ("floor-cushion", "圓坐墊", floor_cushion, 1200, "bedroom", 1, {"bottom": 268}, False),
]


def build():
    """回傳 [(定義, 圖)]"""
    out = []
    for cat_only, items in ((False, DECOR), (True, CAT_FINDS)):
        for iid, name, fn, price, room, x, pos, wall in items:
            im, _ = fn().crop()
            y = pos["y"] if "y" in pos else pos["bottom"] - im.height
            meta = {"id": iid, "name": name, "price": price, "room": room, "x": x, "y": y, "w": im.width, "h": im.height, "wall": wall}
            if cat_only:
                meta["catOnly"] = True
            out.append((meta, im))
    return out


def save():
    d = os.path.join(ROOT, "decor")
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        os.remove(os.path.join(d, f))
    items = build()
    for meta, im in items:
        im.save(os.path.join(d, f"{meta['id']}.png"))
    with open(os.path.join(d, "decor.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(" " + json.dumps(m, ensure_ascii=False) for m, _ in items) + "\n]\n")
    return items
