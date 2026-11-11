"""客廳"""
import common as C
from kit import Cv, Room, striped_wall, wood_floor, wood_wainscot


def sofa():
    cv = Cv(78, 33)
    # 椅背
    cv.rrect(6, 1, 66, 17, "g1", 2)
    cv.h_(8, 1, 62, "g3").h_(7, 2, 64, "g3")
    cv.v_(38, 3, 13, "g2").v_(39, 3, 13, "g3")
    # 坐墊
    cv.rect(9, 15, 60, 9, "g3")
    cv.h_(9, 15, 60, "#bcd6a8").h_(9, 23, 60, "g1")
    cv.v_(38, 16, 8, "g2")
    # 底座
    cv.rect(8, 24, 62, 5, "g2").h_(8, 24, 62, "g4")
    # 扶手
    for x in (1, 67):
        cv.rrect(x, 9, 10, 20, "g1", 2)
        cv.h_(x + 2, 9, 6, "g3").h_(x + 1, 10, 8, "g3")
        cv.h_(x + 1, 28, 8, "g2")
    cv.v_(10, 12, 16, "g2").v_(67, 12, 16, "g2")
    # 抱枕
    cv.rrect(12, 7, 11, 9, "pk1", 1).h_(13, 7, 9, "pk3").h_(13, 15, 9, "pk2").v_(22, 8, 7, "pk2")
    cv.rrect(55, 7, 11, 9, "y1", 1).h_(56, 7, 9, "y3").h_(56, 15, 9, "y2").v_(65, 8, 7, "y2")
    for x0, c in ((11, "ol"), (54, "ol")):
        cv.h_(x0 + 2, 6, 9, c).v_(x0, 8, 7, c).v_(x0 + 12, 8, 7, c)
    # 腳
    cv.rect(5, 29, 3, 3, "w4").rect(70, 29, 3, 3, "w4")
    return cv.outline()


def rug(w=96, h=28, c="#f5e9d3", c2="#e3cfae", c3="#d9b98f"):
    cv = Cv(w, h)
    cv.rrect(1, 1, w - 2, h - 2, c, 2)
    for i, cc in ((3, c3), (5, c2)):
        cv.h_(i + 2, i, w - 2 * i - 4, cc).h_(i + 2, h - 1 - i, w - 2 * i - 4, cc)
        cv.v_(i, i + 2, h - 2 * i - 4, cc).v_(w - 1 - i, i + 2, h - 2 * i - 4, cc)
        cv.pts([(i + 1, i + 1), (w - 2 - i, i + 1), (i + 1, h - 2 - i), (w - 2 - i, h - 2 - i)], cc)
    return cv.outline("#b08a63")


def lamp():
    cv = Cv(15, 48)
    # 燈罩
    cv.poly([(4, 1), (10, 1), (13, 12), (1, 12)], "#fbeecb")
    cv.h_(4, 1, 7, "wh").h_(2, 11, 11, "y3").h_(1, 12, 13, "y1")
    cv.v_(5, 3, 7, "#f3dfb0").v_(9, 3, 7, "#f3dfb0")
    # 桿子、底座
    cv.rect(7, 13, 1, 30, "w4")
    cv.rect(11, 14, 1, 5, "w4").px(11, 19, "y2")
    cv.rect(3, 43, 9, 2, "w2").rect(2, 45, 11, 2, "w4").h_(3, 43, 9, "w1")
    return cv.outline()


def dumbbell():
    cv = Cv(20, 8)
    for x in (1, 14):
        cv.rect(x, 1, 2, 6, "k1").rect(x + 2, 2, 3, 4, "k3").px(x, 1, "k3")
    cv.rect(6, 3, 8, 2, "s1").h_(6, 3, 8, "s3")
    return cv.outline("#2a2a30")


def tv_cabinet(w=34, h=20):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, 3, "w3").h_(1, 1, w - 2, "w5").h_(1, 3, w - 2, "w1")
    cv.rect(2, 4, w - 4, h - 8, "w1")
    cv.h_(2, 4, w - 4, "ol")
    # 左邊開放格放遊戲機，右邊一扇門
    cv.rect(4, 6, 12, h - 12, "w4")
    cv.rect(6, h - 9, 8, 3, "wh2").h_(6, h - 9, 8, "wh").px(12, h - 8, "g2")
    cv.rect(18, 6, w - 22, h - 12, "w3").h_(18, 6, w - 22, "w5").h_(18, h - 7, w - 22, "w2")
    cv.rect(17, 5, 1, h - 10, "ol")
    cv.rect(20, h // 2 - 1, 3, 2, "w4")
    cv.h_(2, h - 5, w - 4, "w2")
    cv.rect(3, h - 4, 3, 3, "w4").rect(w - 6, h - 4, 3, 3, "w4")
    return cv.outline()


def mailbox(full=False):
    cv = Cv(14, 17)
    cv.rrect(1, 3, 12, 13, "r1", 2)
    cv.h_(3, 3, 8, "r3").v_(1, 5, 9, "r3").v_(12, 5, 10, "r2").h_(2, 15, 10, "r2")
    cv.rect(4, 8, 6, 2, "k2")
    cv.rect(6, 12, 2, 1, "y1").rect(6, 13, 2, 1, "y2")
    if full:
        cv.rect(4, 1, 6, 8, "wh").h_(4, 3, 6, "wh2").px(8, 2, "pk2").px(7, 5, "wh3").px(6, 5, "wh3")
    return cv.outline()


def coffee_table(w=44, h=17):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, 3, "w3").h_(1, 1, w - 2, "w5").h_(1, 3, w - 2, "w1")
    cv.rect(3, 4, 3, h - 5, "w1").rect(w - 6, 4, 3, h - 5, "w1")
    cv.v_(5, 4, h - 5, "w2").v_(w - 4, 4, h - 5, "w2")
    cv.rect(6, h - 7, w - 12, 2, "w2").h_(6, h - 7, w - 12, "w1")
    # 下層的書
    cv.rect(10, h - 10, 9, 3, "b1").h_(10, h - 9, 9, "wh").rect(22, h - 9, 7, 2, "r1")
    return cv.outline()


def book_flat(c="b1"):
    cv = Cv(11, 5)
    cv.rect(1, 1, 9, 3, c).h_(1, 2, 9, "wh").h_(1, 1, 9, "b3")
    return cv.outline()


def build():
    r = Room("living")
    r.layer("wall", striped_wall(127), 0)
    r.layer("wainscot", wood_wainscot(), 127)
    r.layer("floor", wood_floor(), 158)

    # 牆上
    r.add("garland", "燈串", C.garland(124), 3, y=22)
    r.add("window", "窗戶", C.window(50, 54, seed=1), 12, y=41, at=(12, 41, 50, 54))
    r.variant("window", "night", C.window(50, 54, night=True, moon=True, seed=1))
    r.add("curtains", "窗簾", C.curtains(54, 53), 10, y=38)
    r.add("sill-plant", "窗台小盆栽", C.small_plant("small", pw=5, ph=4), 21, bottom=91)
    r.add("vase", "花瓶", C.vase(), 46, bottom=91)
    r.add("wall-shelf", "牆上層板", C.wall_shelf(30), 66, y=70)
    r.add("shelf-plant", "層板上的盆栽", C.hanging_plant(), 62, bottom=71)
    r.add("shelf-books", "層板上的書", C.books(4, 9, seed=2), 80, bottom=71)
    r.add("wall-photo", "相框", C.frame_pic(13, 11, "hill"), 82, y=42)
    r.add("clock", "掛鐘", C.clock(), 106, y=42)
    r.add("mailbox", "信箱", mailbox(), 83, y=90, at=(83, 90, 14, 17), raw=True)
    r.variant("mailbox", "full", mailbox(True))
    r.add("door", "大門", C.door(32, 73), 98, bottom=158)

    # 靠牆一排
    r.add("plant-left", "盆栽（左）", C.tree(15, 37), 1, bottom=155)
    r.add("plant-mid", "盆栽（中）", C.tree(15, 29, pot_c="terra", pot_c2="terra2", pot_h=7), 46, bottom=155)
    r.add("tv-cabinet", "電視櫃", tv_cabinet(), 64, bottom=154, at=(64, 134, 34, 20))
    r.add("tv", "電視", C.tv(30, 23), 66, bottom=134, at=(66, 111, 30, 23))

    # 地上
    r.add("rug", "地毯", rug(), 14, bottom=278)
    r.add("sofa", "沙發", sofa(), 8, bottom=247, at=(8, 214, 78, 33))
    r.add("dumbbell", "啞鈴", dumbbell(), 85, bottom=246)
    r.add("lamp", "立燈", lamp(), 106, bottom=246, at=(106, 198, 15, 48))
    r.add("coffee-table", "茶几", coffee_table(), 26, bottom=273)
    r.add("coffee-mug", "茶几上的杯子", C.mug("g1", "g2"), 54, bottom=257)
    r.add("coffee-plant", "茶几上的盆栽", C.small_plant("small", "wh", "wh2", 5, 4), 31, bottom=257)
    return r
