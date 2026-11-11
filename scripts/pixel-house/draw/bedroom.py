"""臥室"""
import common as C
from kit import Cv, Room, striped_wall, wood_floor, wood_wainscot
from living import rug


def bed():
    """側面的床：左邊高床頭、枕頭，綠格子被子，下面兩個抽屜"""
    cv = Cv(62, 40)
    # 床架
    cv.rect(4, 27, 54, 10, "w1").h_(4, 27, 54, "w3").h_(4, 36, 54, "w2")
    for x in (8, 33):
        cv.rect(x, 29, 22, 6, "w3").h_(x, 29, 22, "w5").h_(x, 34, 22, "w1")
        cv.rect(x + 9, 31, 4, 1, "w4")
        cv.h_(x - 1, 28, 24, "w4").h_(x - 1, 35, 24, "w4").v_(x - 1, 29, 6, "w4").v_(x + 22, 29, 6, "w4")
    # 床墊
    cv.rect(5, 20, 52, 7, "wh").h_(5, 26, 52, "wh3").h_(5, 25, 52, "wh2")
    # 被子（格子），蓋到床墊一半
    cv.rrect(19, 13, 38, 13, "g1", 1)
    for x in range(19, 57, 6):
        cv.rect(x, 14, 3, 11, "g3")
    for y in (17, 21):
        cv.h_(20, y, 36, "g2")
    cv.h_(20, 13, 36, "#c4dcb0").h_(20, 25, 36, "g4")
    cv.rect(16, 13, 4, 5, "wh").h_(16, 17, 4, "wh3")
    # 枕頭
    cv.rrect(6, 12, 12, 8, "wh", 2).h_(8, 19, 8, "wh3").h_(8, 12, 8, "#ffffff")
    # 床頭、床尾
    cv.rrect(1, 1, 5, 36, "w1", 1).v_(1, 2, 34, "w3").v_(5, 2, 35, "w2").h_(2, 1, 3, "w5")
    cv.rrect(57, 15, 4, 22, "w1", 1).v_(57, 16, 20, "w3").v_(60, 16, 21, "w2")
    cv.rect(2, 37, 3, 2, "w4").rect(57, 37, 3, 2, "w4")
    out = cv.outline()
    out.h_(19, 12, 38, "ol").v_(18, 13, 5, "ol")
    return out


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
    cv = Cv(26, 20)
    cv.rrect(1, 8, 24, 11, "g1", 3)
    cv.rrect(5, 2, 16, 10, "g1", 3)
    cv.rect(3, 6, 20, 4, "g1")
    cv.h_(8, 2, 10, "g3").h_(6, 3, 5, "g3")
    cv.h_(4, 18, 18, "g2").h_(2, 16, 3, "g2").h_(21, 16, 3, "g2")
    cv.line(7, 12, 12, 15, "g2").line(18, 12, 14, 15, "g2")
    return cv.outline()


def cat(c="#f0a45a", c2="#d98840"):
    """趴著睡的橘貓"""
    cv = Cv(15, 9)
    rows = [
        ".O...O.......",
        "OOO.OOO......",
        "OOOOOOOOOOOO.",
        "OkOOOkOOOoOOO",
        "OOOpOOOOOOOoO",
        "OWWWWWOOOOOoO",
        ".OOOOOOOOOOO.",
    ]
    cv.art(1, 1, rows, {"O": c, "o": c2, "k": "ol", "p": "pk2", "W": "wh"})
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
    r.add("phone", "他的手機", phone(), 48, bottom=224)
    r.add("floor-box", "地上的小箱子", toolbox(), 3, bottom=250)
    r.add("tv-cabinet", "電視櫃", low_cabinet(), 80, bottom=243, at=(80, 228, 43, 15))
    r.add("tv", "電視", C.tv(28, 20, on=True), 89, bottom=228, at=(89, 208, 28, 20))
    r.add("tv-plant", "電視櫃上的盆栽", C.small_plant("small", "wh", "wh2", 5, 4), 80, bottom=229)
    r.add("beanbag", "懶骨頭", beanbag(), 98, bottom=270)
    r.add("cat", "貓", cat(), 104, bottom=254)
    return r


def toolbox_like_box():
    """書櫃上的小盒子"""
    cv = Cv(10, 8)
    cv.rect(1, 2, 8, 5, "pk1").h_(1, 2, 8, "pk3").h_(1, 4, 8, "pk2").px(4, 4, "wh").px(5, 4, "wh")
    cv.rect(1, 1, 8, 1, "pk2")
    return cv.outline()
