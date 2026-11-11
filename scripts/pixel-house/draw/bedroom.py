"""臥室"""
import common as C
from kit import Cv, Room, striped_wall, wood_floor, wood_wainscot
from living import rug


CAT_FACE = [
    ".W.........W.",
    "WWW.......WWW",
    "WWWWWWWWWWWWW",
    "WWWWWWWWWWWWW",
    "WWkWWWWWWWkWW",
    "WpWWWkWkWWWpW",
    "WWWWWWkWWWWWW",
    "sWWWWWWWWWWWs",
    ".sssssssssss.",
]
CAT_PAL = {"W": "wh", "k": "ol", "p": "pk1", "s": "wh3"}


def bed():
    """床（從床尾看過去）：床頭板、兩顆枕頭（貓貓枕頭和恐龍娃娃）、白床單、綠格子被、兩個抽屜"""
    cv = Cv(62, 58)
    # 床頭板
    cv.rrect(3, 2, 56, 20, "w1", 2)
    cv.h_(5, 2, 52, "w5").h_(4, 3, 54, "w3")
    for x in (7, 32):
        cv.rect(x, 6, 23, 10, "w3").h_(x, 6, 23, "w2").v_(x, 6, 10, "w2").h_(x + 1, 15, 22, "w5")
    # 兩根床柱
    for x in (1, 57):
        cv.rect(x, 14, 4, 42, "w1").v_(x, 14, 42, "w3").v_(x + 3, 15, 41, "w2")
    # 枕頭
    cv.rrect(5, 13, 25, 13, "wh", 2).h_(7, 25, 21, "wh3").h_(7, 13, 21, "#ffffff")
    cv.rrect(32, 13, 25, 13, "wh", 2).h_(34, 25, 21, "wh3").h_(34, 13, 21, "#ffffff")
    cv.v_(30, 15, 10, "ol2").v_(31, 15, 10, "ol2")
    # 白床單的反摺
    cv.rect(5, 26, 52, 5, "wh").h_(5, 26, 52, "#ffffff").h_(5, 30, 52, "wh3")
    # 綠格子被
    cv.rect(5, 31, 52, 15, "g1")
    for j, y in enumerate(range(31, 46, 5)):
        for i, x in enumerate(range(5, 57, 4)):
            if (i + j) % 2 == 0:
                cv.rect(x, y, 4, 5, "g3")
            elif j % 2 == 1 and i % 2 == 0:
                cv.rect(x, y, 4, 5, "g2")
    cv.h_(5, 45, 52, "g4").h_(5, 31, 52, "#c4dcb0")
    # 床架和抽屜
    cv.rect(5, 46, 52, 9, "w1").h_(5, 46, 52, "w4").h_(5, 54, 52, "w2")
    for x in (7, 32):
        cv.rect(x, 48, 23, 5, "w3").h_(x, 48, 23, "w5").h_(x, 52, 23, "w1")
        cv.rect(x + 9, 50, 5, 1, "w4")
        cv.h_(x, 47, 23, "w4").h_(x, 53, 23, "w4").v_(x - 1, 48, 5, "w4").v_(x + 23, 48, 5, "w4")
    cv.rect(2, 56, 3, 1, "w4").rect(57, 56, 3, 1, "w4")
    cv.outline()
    # 貓貓枕頭（左）和恐龍娃娃（右）畫在枕頭上
    cat = Cv(15, 11)
    cat.art(1, 1, CAT_FACE, CAT_PAL)
    cv.paste(cat.outline(), 10, 12)
    cv.paste(dino(), 38, 11)
    return cv


def dino():
    """綠色的恐龍娃娃"""
    cv = Cv(15, 14)
    rows = [
        "..GGGG.......",
        ".GGkGGG......",
        ".GGGGGGd.....",
        ".GGGGGGGd....",
        "...GGGGGGd...",
        "..LGGGGGGGd..",
        ".LLGGGGGGGG..",
        ".LLGGGGGGGGGd",
        "..LGGGGGGGGGG",
        "..GG.GG..GGG.",
        "..GG.GG......",
    ]
    cv.art(1, 1, rows, {"G": "leaf1", "L": "leaf3", "d": "leaf2", "k": "ol"})
    return cv.outline()


def bookshelf(w=30, h=71):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, h - 2, "w1")
    cv.h_(1, 1, w - 2, "w3").v_(1, 1, h - 2, "w3").v_(w - 2, 2, h - 3, "w2")
    rows = 5
    sh = (h - 6) // rows
    cols = [("b2", "b1"), ("r2", "r1"), ("y2", "y1"), ("g4", "g1"), ("pu2", "pu1"), ("w4", "w3"), ("wh3", "wh")]
    for r in range(rows):
        y = 3 + r * sh
        cv.rect(3, y, w - 6, sh - 2, "w4")
        cv.h_(3, y, w - 6, "ol").v_(3, y, sh - 2, "ol")
        base = y + sh - 3
        x = 4
        if r in (0, 1, 3):
            n = 0
            while x < w - 12:
                d, l = cols[(n * 2 + r * 3) % len(cols)]
                bh = sh - 4 - ((n + r) % 3)
                bw = 2 + ((n + r) % 2)
                cv.rect(x, base - bh + 1, bw, bh, d).v_(x, base - bh + 1, bh, l)
                x += bw
                n += 1
            if r == 0:
                cv.rect(x + 1, base - 5, 6, 6, "wh2").h_(x + 1, base - 5, 6, "wh").h_(x + 2, base - 2, 4, "pk1")
            elif r == 1:
                cv.rect(x + 2, base - 2, 4, 3, "terra").pts([(x + 3, base - 4), (x + 4, base - 5), (x + 5, base - 4), (x + 3, base - 3), (x + 4, base - 3)], "leaf1")
            else:
                cv.rect(x + 1, base - 4, 6, 5, "b1").h_(x + 1, base - 4, 6, "b3").px(x + 3, base - 2, "wh")
        elif r == 2:
            # 橫放的書和一個盒子
            for i, (d, l) in enumerate((cols[1], cols[5], cols[0])):
                cv.rect(5, base - 1 - i * 2, 10 - i, 2, d).h_(5, base - 1 - i * 2, 10 - i, l)
            cv.rect(17, base - 6, 8, 7, "pk1").h_(17, base - 6, 8, "pk3").h_(17, base - 3, 8, "pk2").px(20, base - 3, "wh")
        else:
            cv.rect(5, base - 6, 10, 7, "g1").h_(5, base - 6, 10, "g3").h_(5, base - 4, 10, "g2").rect(9, base - 3, 2, 1, "wh2")
            cv.rect(17, base - 5, 8, 6, "y1").h_(17, base - 5, 8, "y3").h_(17, base - 3, 8, "y2")
        cv.rect(2, y + sh - 2, w - 4, 2, "w1").h_(2, y + sh - 2, w - 4, "w3")
    cv.rect(2, h - 3, w - 4, 2, "w2")
    return cv.outline()


def desk(w=54, h=28):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, 3, "w3").h_(1, 1, w - 2, "w5").h_(1, 3, w - 2, "w1")
    cv.h_(2, 4, w - 4, "ol")
    # 左邊桌腳
    cv.rect(3, 5, 3, h - 6, "w1").v_(5, 5, h - 6, "w2")
    # 右邊抽屜櫃
    dx, dw = w - 20, 17
    cv.rect(dx, 5, dw, h - 6, "w1").v_(dx, 5, h - 6, "w3")
    for i in range(2):
        y = 7 + i * 10
        cv.rect(dx + 2, y, dw - 4, 8, "w3").h_(dx + 2, y, dw - 4, "w5").h_(dx + 2, y + 7, dw - 4, "w2")
        cv.rect(dx + dw // 2 - 2, y + 3, 4, 1, "w4")
        cv.h_(dx + 1, y - 1, dw - 2, "w4")
    cv.h_(dx, h - 2, dw, "w4")
    # 橫桿
    cv.rect(6, 9, dx - 6, 1, "w2")
    return cv.outline()


def chair():
    """電腦椅（背面）：椅背矮一點，他坐著打電腦時看得到上半身"""
    cv = Cv(16, 17)
    cv.rrect(2, 1, 12, 9, "k1", 2)
    cv.h_(4, 1, 8, "k3").v_(2, 3, 5, "k3").v_(13, 3, 6, "k2").h_(4, 9, 8, "k2")
    # 貓臉
    cv.art(5, 3, ["#....#", "######", "#.##.#", ".####."], {"#": "wh3"})
    cv.rect(1, 10, 14, 2, "k2").h_(1, 10, 14, "k3")
    cv.rect(7, 12, 2, 2, "s2")
    cv.rect(3, 14, 10, 1, "k2").rect(2, 15, 2, 1, "k2").rect(7, 15, 2, 1, "k2").rect(12, 15, 2, 1, "k2")
    return cv.outline("#2a2a30")


def monitor(w=21, h=15):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, h - 5, "k2")
    cv.rect(2, 2, w - 4, h - 7, "b1")
    cv.rect(2, h - 8, w - 4, 3, "hill").rect(2, h - 6, w - 4, 1, "hill2")
    cv.rect(4, 3, 4, 2, "cloud").rect(11, 4, 3, 1, "cloud")
    cv.rect(w - 6, h - 9, 2, 2, "r1")
    cv.rect(w // 2 - 1, h - 4, 3, 2, "k2").rect(w // 2 - 4, h - 2, 9, 1, "k1")
    return cv.outline("#2a2a30")


def desk_lamp():
    cv = Cv(16, 18)
    cv.rect(3, 15, 8, 2, "g2").h_(3, 15, 8, "g1")
    cv.line(6, 14, 4, 8, "s2").line(4, 8, 9, 4, "s2")
    cv.poly([(8, 2), (13, 2), (14, 6), (8, 6)], "g1")
    cv.h_(8, 2, 6, "g3").h_(9, 7, 5, "glow").h_(10, 8, 3, "glow")
    return cv.outline()


def board(w=30, h=19):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, h - 2, "w2")
    cv.rect(3, 3, w - 6, h - 6, "#e3bd8b")
    for x, y in ((6, 6), (13, 12), (22, 5), (9, 13), (20, 11)):
        cv.px(x, y, "#d2a871")
    cv.h_(1, 1, w - 2, "w3")
    cv.rect(5, 5, 7, 6, "y3").px(8, 5, "r1")
    cv.rect(14, 4, 7, 5, "wh").px(17, 4, "b2").h_(15, 6, 5, "wh3")
    cv.rect(21, 9, 5, 5, "pk3").px(23, 9, "g4")
    cv.rect(7, 12, 9, 3, "b3").px(11, 12, "r1")
    return cv.outline()


def calendar(w=18, h=20):
    cv = Cv(w, h)
    cv.rect(1, 2, w - 2, h - 3, "wh")
    cv.rect(1, 2, w - 2, 5, "r1").h_(1, 2, w - 2, "r3")
    cv.rect(4, 1, 2, 2, "s2").rect(w - 6, 1, 2, 2, "s2")
    for j in range(4):
        for i in range(5):
            cv.px(3 + i * 3, 9 + j * 3, "wh3")
    cv.rect(8, 11, 2, 2, "pk2")
    cv.h_(1, h - 2, w - 2, "wh2")
    return cv.outline()


def toolbox():
    """地上的小箱子（點了打開設定）：有提把的工具箱"""
    cv = Cv(12, 11)
    cv.rect(4, 1, 4, 1, "s2").px(4, 2, "s2").px(7, 2, "s2")
    cv.rect(1, 3, 10, 7, "b2").h_(1, 3, 10, "b1").h_(1, 6, 10, "#4f86ad").h_(1, 9, 10, "#4f86ad")
    cv.rect(5, 5, 2, 3, "y1")
    return cv.outline()


def phone():
    cv = Cv(7, 11)
    cv.rrect(1, 1, 5, 9, "k2", 1)
    cv.rect(2, 2, 3, 6, "b1").px(2, 2, "b3").px(3, 8, "k3")
    return cv.outline("#2a2a30")


def low_cabinet(w=43, h=15):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, 3, "w3").h_(1, 1, w - 2, "w5").h_(1, 3, w - 2, "w1")
    cv.rect(2, 4, w - 4, h - 7, "w1").h_(2, 4, w - 4, "ol")
    cv.rect(4, 6, 14, h - 11, "w4")
    cv.rect(6, h - 8, 9, 2, "wh2").px(13, h - 8, "b2")
    cv.rect(20, 6, 9, h - 11, "w3").rect(31, 6, 9, h - 11, "w3")
    cv.h_(20, 6, 9, "w5").h_(31, 6, 9, "w5")
    cv.v_(19, 5, h - 9, "ol").v_(30, 5, h - 9, "ol")
    cv.px(24, 8, "w4").px(35, 8, "w4")
    cv.rect(3, h - 3, 3, 2, "w4").rect(w - 6, h - 3, 3, 2, "w4")
    return cv.outline()


def beanbag():
    """綠色的懶骨頭：後面鼓起來，前面攤開"""
    cv = Cv(30, 25)
    cv.ell(1, 9, 28, 15, "g1")
    cv.ell(7, 1, 21, 20, "g1")
    cv.rect(4, 14, 22, 8, "g1")
    # 亮面和皺褶
    cv.ell(12, 2, 11, 5, "g3")
    cv.line(4, 13, 8, 11, "g3").line(9, 10, 12, 9, "g3")
    cv.line(24, 8, 26, 14, "g2").line(21, 5, 24, 9, "g2")
    cv.ell(3, 19, 24, 5, "g2")
    cv.rect(5, 18, 20, 3, "g1")
    cv.h_(6, 23, 18, "g4")
    return cv.outline()


def cat():
    """白色的貓貓抱枕"""
    cv = Cv(15, 11)
    cv.art(1, 1, CAT_FACE, CAT_PAL)
    return cv.outline()


def build():
    r = Room("bedroom")
    r.layer("wall", striped_wall(127), 0)
    r.layer("wainscot", wood_wainscot(), 127)
    r.layer("floor", wood_floor(), 158)

    # 牆上
    r.add("garland", "燈串", C.garland(124, ("y1", "pk1", "wh", "b1", "g1")), 3, y=22)
    r.add("window", "窗戶", C.window(50, 54, seed=4), 41, y=37)
    r.variant("window", "night", C.window(50, 54, night=True, moon=True, seed=4))
    r.add("curtains", "窗簾", C.curtains(54, 53, tie="g1"), 39, y=34)
    r.add("sill-plant", "窗台小盆栽", C.small_plant("small", pw=5, ph=4), 50, bottom=87)
    r.add("vase", "花瓶", C.vase("pk1"), 75, bottom=87)
    r.add("wall-shelf", "牆上層板", C.wall_shelf(28), 8, y=50)
    r.add("photo-landscape", "風景相框", C.frame_pic(10, 11, "hill"), 9, bottom=51)
    r.add("photo-heart", "愛心相框", C.frame_pic(9, 9, "heart"), 19, bottom=51)
    r.add("shelf-plant", "層板上的盆栽", C.small_plant("small", "wh", "wh2", 5, 4), 28, bottom=51)
    r.add("calendar", "月曆", calendar(), 13, y=58)
    r.add("board", "留言板", board(), 50, y=95)
    r.add("clock", "掛鐘", C.clock(), 101, y=43)
    r.add("door", "浴室的門", C.door(29, 73, c="wh", panel="wh2", frame="w1", knob="s2"), 101, bottom=158)

    # 靠牆一排
    r.add("bookshelf", "書櫃", bookshelf(), 6, bottom=157, at=(6, 86, 30, 71))
    r.add("bookshelf-box", "書櫃上的小盒子", toolbox_like_box(), 20, bottom=87)
    r.add("bookshelf-plant", "書櫃上的盆栽", C.hanging_plant(), 3, bottom=97)
    r.add("desk", "書桌", desk(), 40, bottom=158, at=(40, 130, 54, 28))
    r.add("monitor", "電腦", monitor(), 53, bottom=131)
    r.add("desk-plant", "桌上的盆栽", C.small_plant("small", pw=5, ph=4), 42, bottom=131)
    r.add("cup", "杯子", C.mug("pk1", "pk2"), 75, bottom=131)
    r.add("desk-lamp", "檯燈", desk_lamp(), 81, bottom=131)
    r.add("chair", "椅子", chair(), 55, bottom=156)

    # 地上
    r.add("rug", "地毯", rug(92, 26, "#eef3e4", "#cfdcbf", "#b4c8a2"), 18, bottom=272)
    r.add("bed", "床", bed(), 5, bottom=240)
    r.add("phone", "他的手機", phone(), 49, bottom=229)
    r.add("floor-box", "地上的小箱子", toolbox(), 3, bottom=250)
    r.add("tv-cabinet", "電視櫃", low_cabinet(), 80, bottom=243, at=(80, 228, 43, 15))
    r.add("tv", "電視", C.tv(28, 20, on=True), 89, bottom=228, at=(89, 208, 28, 20))
    r.add("tv-plant", "電視櫃上的盆栽", C.small_plant("small", "wh", "wh2", 5, 4), 80, bottom=229)
    r.add("beanbag", "懶骨頭", beanbag(), 97, bottom=272)
    r.add("cat", "貓貓抱枕", cat(), 103, bottom=268)
    return r


def toolbox_like_box():
    """書櫃上的小盒子"""
    cv = Cv(10, 8)
    cv.rect(1, 2, 8, 5, "pk1").h_(1, 2, 8, "pk3").h_(1, 4, 8, "pk2").px(4, 4, "wh").px(5, 4, "wh")
    cv.rect(1, 1, 8, 1, "pk2")
    return cv.outline()
