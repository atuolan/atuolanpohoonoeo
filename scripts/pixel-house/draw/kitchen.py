"""廚房"""
import common as C
from kit import Cv, Room, flip, striped_wall, wood_floor, wood_wainscot


def tiles(w=96, h=37):
    """流理台後面的磁磚牆（不能移）"""
    cv = Cv(w, h)
    cv.rect(0, 0, w, h, "#f6faf5")
    for x in range(5, w, 6):
        cv.v_(x, 0, h, "#d5e9e0")
    for y in range(5, h, 6):
        cv.h_(0, y, w, "#d5e9e0")
    cv.h_(0, 0, w, "t4").v_(w - 1, 0, h, "t4")
    return cv


def counter(w=96, h=27):
    cv = Cv(w, h)
    # 檯面
    cv.rect(0, 1, w - 1, 3, "wh").h_(0, 1, w - 1, "#ffffff").h_(0, 3, w - 1, "wh3")
    # 水槽
    cv.rect(18, 1, 20, 2, "s1").h_(18, 1, 20, "s2").h_(19, 2, 18, "s3")
    cv.h_(0, 4, w - 1, "ol")
    # 櫃子
    cv.rect(0, 5, 64, h - 8, "w1")
    for x in (2, 23, 44):
        ww = 19
        cv.rect(x, 7, ww, h - 12, "w3").h_(x, 7, ww, "w5").h_(x, h - 6, ww, "w2").v_(x + ww - 1, 8, h - 13, "w2")
        cv.h_(x - 1, 6, ww + 2, "w4").h_(x - 1, h - 5, ww + 2, "w4").v_(x - 1, 7, h - 12, "w4").v_(x + ww, 7, h - 12, "w4")
    # 左邊兩扇門、右邊三個抽屜
    cv.rect(18, 13, 1, 4, "w4").rect(25, 13, 1, 4, "w4")
    for y in (12, 18):
        cv.h_(44, y, 19, "w4").h_(44, y + 1, 19, "w5")
    for y in (9, 15, 20):
        cv.rect(51, y, 5, 1, "w4")
    # 烤箱
    cv.rect(64, 5, w - 65, h - 8, "s1").v_(64, 5, h - 8, "ol")
    cv.rect(66, 6, w - 69, 3, "s2")
    for x in (68, 73, 82, 87):
        cv.px(x, 7, "k2")
    cv.rect(67, 11, w - 71, h - 16, "k2").rect(69, 13, w - 75, h - 20, "#4b505c").h_(69, 13, w - 75, "#687080")
    cv.rect(69, 10, w - 75, 1, "s4")
    # 踢腳
    cv.rect(0, h - 3, w - 1, 2, "w4")
    return cv.outline()


def faucet():
    cv = Cv(10, 12)
    cv.rect(5, 2, 2, 9, "s1").v_(5, 2, 9, "s3")
    cv.rect(2, 1, 5, 2, "s1").h_(2, 1, 5, "s3").rect(1, 2, 2, 3, "s1")
    cv.rect(7, 7, 2, 1, "s2")
    return cv.outline("s4")


def stove(w=28):
    cv = Cv(w, 5)
    cv.rect(1, 2, w - 2, 2, "k2").h_(1, 2, w - 2, "k3")
    for x in (4, w - 11):
        cv.rect(x, 1, 7, 1, "k1")
    return cv.outline("#2a2a30")


def pot():
    cv = Cv(20, 14)
    cv.rect(9, 1, 2, 2, "k2")
    cv.rect(3, 3, 14, 3, "r1").h_(4, 3, 12, "r3").h_(3, 5, 14, "r2")
    cv.rect(4, 6, 12, 7, "r1").v_(4, 6, 7, "r3").v_(15, 6, 7, "r2").h_(5, 12, 10, "r2")
    cv.rect(1, 7, 3, 2, "r2").rect(16, 7, 3, 2, "r2")
    return cv.outline()


def cutting_board():
    """靠牆立著的砧板，旁邊一筒木湯匙"""
    cv = Cv(18, 16)
    cv.rrect(1, 3, 8, 12, "w3", 1).v_(1, 5, 9, "w5").v_(8, 4, 10, "w1")
    cv.rect(4, 1, 2, 2, "w3").px(4, 5, "w4")
    # 筒子和湯匙
    cv.rect(11, 9, 6, 6, "wh").v_(16, 9, 6, "wh3").h_(11, 9, 6, "wh2")
    cv.rect(12, 3, 2, 6, "w1").rect(12, 2, 2, 3, "w3").rect(15, 4, 1, 5, "w2").rect(14, 2, 3, 3, "w1")
    return cv.outline()


def dish_rack():
    cv = Cv(18, 11)
    for i, x in enumerate((3, 6, 9, 12)):
        cv.ell(x, 1, 5, 9, "wh")
        cv.v_(x, 3, 5, "wh3")
    cv.rect(1, 7, 16, 3, "w3").h_(1, 7, 16, "w5").h_(1, 9, 16, "w1")
    for x in (3, 7, 11, 15):
        cv.px(x, 8, "w4")
    return cv.outline()


def bottle(c="g1", c2="g2", cap="wh"):
    cv = Cv(7, 12)
    cv.rect(1, 5, 5, 6, c).v_(5, 6, 5, c2).px(1, 5, cap)
    cv.rect(2, 3, 3, 2, cap).rect(3, 1, 1, 2, "s2").rect(3, 1, 3, 1, "s2")
    return cv.outline()


def utensil_rack(w=36):
    """牆上的掛桿：隔熱手套、平底鍋、鍋鏟、湯勺"""
    cv = Cv(w, 22)
    cv.rect(1, 1, w - 2, 2, "w1").h_(1, 1, w - 2, "w3")
    cv.outline()
    # 手套
    g = Cv(10, 13)
    g.rrect(1, 3, 6, 9, "y1", 1).rect(6, 5, 3, 3, "y1").h_(2, 10, 4, "y2").h_(2, 3, 4, "y3").px(3, 6, "y3").px(4, 8, "y2")
    g.rect(3, 1, 1, 2, "ol2")
    cv.paste(g.outline(), 2, 3)
    # 平底鍋
    p = Cv(12, 17)
    p.rect(5, 1, 2, 6, "k1")
    p.ell(1, 6, 10, 10, "k1").ell(3, 8, 6, 6, "k3")
    cv.paste(p.outline("#2a2a30"), 11, 3)
    # 鍋鏟
    s = Cv(7, 16)
    s.rect(3, 1, 1, 8, "w1").rect(1, 9, 5, 5, "s1").v_(2, 10, 3, "s4").v_(4, 10, 3, "s4").h_(1, 9, 5, "s3")
    cv.paste(s.outline(), 22, 3)
    # 湯勺
    l = Cv(7, 15)
    l.rect(3, 1, 1, 8, "w1").ell(1, 8, 5, 5, "s1").px(2, 9, "s3")
    cv.paste(l.outline(), 28, 3)
    return cv


def hood(w=26, h=36):
    cv = Cv(w, h)
    cv.rect(8, 1, w - 16, h - 14, "s1").v_(8, 1, h - 14, "s3").v_(w - 9, 1, h - 14, "s2")
    cv.poly([(8, h - 14), (w - 9, h - 14), (w - 2, h - 5), (1, h - 5)], "s1")
    cv.line(8, h - 14, 2, h - 6, "s3")
    cv.rect(1, h - 5, w - 2, 4, "s2").h_(1, h - 5, w - 2, "s3").h_(1, h - 2, w - 2, "s4")
    cv.px(w - 5, h - 4, "r1").px(w - 7, h - 4, "g1")
    return cv.outline("s4")


def jar(lid="r1", body="wh", fill=None, h=8, w=5):
    cv = Cv(w + 2, h + 2)
    cv.rect(1, 3, w, h - 2, body)
    if fill:
        cv.rect(1, 5, w, h - 4, fill)
    cv.v_(1, 3, h - 2, "#ffffff")
    cv.rect(1, 1, w, 2, lid)
    return cv.outline()


def shelf_with(things, w=22, gap=1, start=2):
    """一塊層板，上面排一排小東西"""
    hmax = max(t.crop()[0].height for t in things)
    cv = Cv(w, hmax + 5)
    x = start
    for t in things:
        im, _ = t.crop()
        cv.im.alpha_composite(im, (x, hmax - im.height + 1))
        x += im.width + gap
    sh = Cv(w, 6)
    sh.rect(1, 1, w - 2, 2, "w1").h_(1, 1, w - 2, "w3").rect(3, 3, 2, 1, "w2").rect(w - 5, 3, 2, 1, "w2")
    sh.outline()
    out = Cv(w, hmax + 5)
    out.paste(sh, 0, hmax - 1)
    out.paste(cv, 0, 0)
    return out


def bowls():
    cv = Cv(10, 8)
    cv.rect(1, 1, 8, 2, "wh").rect(2, 3, 6, 1, "wh2")
    cv.rect(1, 4, 8, 2, "b3").rect(2, 6, 6, 1, "b1")
    return cv.outline()


def valance(w=38):
    """窗戶上面的粉紅遮簷"""
    cv = Cv(w, 9)
    cv.rect(1, 1, w - 2, 5, "pk1").h_(1, 1, w - 2, "pk3").h_(1, 4, w - 2, "pk2")
    for x in range(1, w - 3, 6):
        cv.rect(x, 6, 5, 1, "pk1").rect(x + 1, 7, 3, 1, "pk1")
    return cv.outline()


def fridge(w=30, h=85):
    cv = Cv(w, h)
    cv.rrect(1, 1, w - 2, h - 3, "m1", 2)
    cv.v_(1, 3, h - 7, "m3").h_(3, 1, w - 6, "m3").v_(w - 2, 3, h - 7, "m2").v_(w - 3, 3, h - 7, "m2")
    split = 30
    cv.h_(1, split, w - 2, "ol").h_(2, split + 1, w - 4, "m3").h_(2, split - 1, w - 4, "m2")
    # 把手
    cv.rect(4, 16, 2, 11, "k1").rect(4, split + 5, 2, 13, "k1")
    # 磁鐵和便條
    cv.rect(13, 9, 5, 5, "pk1").h_(13, 9, 5, "pk3")
    cv.rect(21, 12, 4, 4, "y1").h_(21, 12, 4, "y3")
    cv.rect(16, split + 12, 9, 11, "wh").h_(18, split + 15, 5, "wh3").h_(18, split + 17, 5, "wh3").h_(18, split + 19, 3, "wh3")
    cv.rect(19, split + 11, 3, 2, "y2")
    cv.rect(3, h - 2, 4, 1, "m4").rect(w - 7, h - 2, 4, 1, "m4")
    out = cv.outline()
    for x0, y0, ww, hh in ((12, 8, 7, 7), (20, 11, 6, 6), (15, split + 11, 11, 13)):
        out.h_(x0 + 1, y0, ww - 2, "m4").h_(x0 + 1, y0 + hh - 1, ww - 2, "m4").v_(x0, y0 + 1, hh - 2, "m4").v_(x0 + ww - 1, y0 + 1, hh - 2, "m4")
    out.rect(19, split + 11, 3, 2, "y2")
    return out


def table(w=92, h=27):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, 4, "w3").h_(1, 1, w - 2, "w5").h_(1, 4, w - 2, "w1")
    cv.rect(6, 5, w - 12, 4, "w1").h_(6, 8, w - 12, "w2")
    for x in (7, w - 12):
        cv.rect(x, 9, 5, h - 10, "w1").v_(x, 9, h - 10, "w3").v_(x + 4, 9, h - 10, "w2")
    cv.h_(5, 5, w - 10, "ol")
    return cv.outline()


def chair():
    """餐椅（側面，椅背在左）"""
    cv = Cv(14, 36)
    cv.rect(1, 1, 3, 34, "w1").v_(1, 1, 34, "w3")
    for y in (4, 10, 16):
        cv.rect(4, y, 2, 3, "w2")
    cv.rect(2, 20, 11, 3, "g1").h_(2, 20, 11, "g3").h_(2, 22, 11, "g2")
    cv.rect(2, 23, 11, 2, "w1").h_(2, 24, 11, "w2")
    cv.rect(10, 25, 3, 10, "w1").v_(12, 25, 10, "w2")
    cv.rect(4, 29, 6, 1, "w2")
    return cv.outline()


def fruit_plate():
    cv = Cv(18, 13)
    cv.ell(3, 2, 6, 6, "r1").px(5, 3, "r3")
    cv.ell(8, 1, 6, 6, "y1").px(10, 2, "y3")
    cv.ell(6, 4, 6, 5, "g1").px(8, 5, "g3")
    cv.ell(11, 4, 5, 5, "pu1")
    cv.px(6, 1, "leaf2").px(11, 0, "leaf2")
    cv.rect(1, 7, 16, 2, "w3").rect(2, 9, 14, 2, "w1").rect(4, 11, 10, 1, "w2").h_(1, 7, 16, "w5")
    return cv.outline()


def build():
    r = Room("kitchen")
    r.layer("wall", striped_wall(127), 0)
    r.layer("wainscot", wood_wainscot(), 127)
    r.layer("floor", wood_floor(), 158)

    r.add("tiles", "磁磚牆面", tiles(), 0, y=90, at=(0, 90, 96, 37), raw=True)
    # 牆上
    r.add("window", "窗戶", C.window(34, 31, seed=7), 6, y=51)
    r.variant("window", "night", C.window(34, 31, night=True, seed=7))
    r.add("valance", "窗簾盒", valance(38), 4, y=45)
    r.add("spice-rack", "調味料架", shelf_with([jar("r1", "wh", "y3"), jar("b2", "wh", "pk3"), jar("g2", "wh", "o1")], 26), 43, bottom=69)
    r.add("canister-shelf", "罐子架", shelf_with([bowls(), C.mug("y1", "y2")], 26), 43, bottom=86)
    r.add("hood", "抽油煙機", hood(), 68, y=46)
    r.add("clock", "掛鐘", C.clock(), 105, y=44)
    r.add("utensil-rack", "掛桿和鍋鏟", utensil_rack(), 3, y=92)

    # 靠牆一排
    r.add("fridge", "冰箱", fridge(), 98, bottom=156)
    r.add("counter", "流理台", counter(), 0, bottom=154, at=(0, 127, 96, 27), raw=True)
    r.add("dish-rack", "碗盤架", dish_rack(), 2, bottom=128)
    r.add("faucet", "水龍頭", faucet(), 23, bottom=128)
    r.add("soap", "洗碗精", bottle(), 34, bottom=128)
    r.add("cutting-board", "砧板", cutting_board(), 43, bottom=128)
    r.add("stove", "爐子", stove(), 66, bottom=128)
    r.add("pot", "鍋子", pot(), 70, bottom=125)

    # 餐桌
    r.add("table", "餐桌", table(), 20, bottom=247, at=(20, 220, 92, 27))
    r.add("chair-left", "椅子（左）", chair(), 11, bottom=246, at=(11, 210, 14, 36))
    r.add("chair-right", "椅子（右）", flip(chair()), 105, bottom=246)
    r.add("fruit-plate", "水果盤", fruit_plate(), 56, bottom=221)
    r.add("mug-blue", "藍杯子", C.mug("b1", "b2"), 37, bottom=221)
    r.add("mug-pink", "粉杯子", C.mug("pk1", "pk2"), 85, bottom=221)
    return r
