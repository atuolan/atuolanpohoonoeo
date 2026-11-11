"""浴室"""
import common as C
from kit import ROOM_H, ROOM_W, Cv, Room, striped_wall
from kitchen import bottle

WALL_H = 84
FLOOR_Y = 158


def tile_wall(h=FLOOR_Y - WALL_H):
    """下半的磁磚牆：錯開的長磚，上面一條收邊，下面一條踢腳"""
    cv = Cv(ROOM_W, h)
    cv.rect(0, 0, ROOM_W, h, "t1")
    bh = 9
    r = 0
    for y in range(3, h - 7, bh):
        cv.h_(0, y + bh - 1, ROOM_W, "t2")
        cv.h_(0, y, ROOM_W, "t3")
        for x in range(-9 if r % 2 else 0, ROOM_W, 18):
            if x > 0:
                cv.v_(x, y, bh - 1, "t2")
        r += 1
    cv.rect(0, 0, ROOM_W, 3, "m1").h_(0, 0, ROOM_W, "m4").h_(0, 1, ROOM_W, "m3").h_(0, 2, ROOM_W, "m2")
    cv.rect(0, h - 7, ROOM_W, 7, "m1").h_(0, h - 7, ROOM_W, "m4").h_(0, h - 6, ROOM_W, "m3").h_(0, h - 1, ROOM_W, "m4")
    return cv


def checker_floor(h=ROOM_H - FLOOR_Y, s=13):
    cv = Cv(ROOM_W, h)
    cv.rect(0, 0, ROOM_W, h, "#f7f9f3")
    for j, y in enumerate(range(0, h, s)):
        for i, x in enumerate(range(0, ROOM_W, s)):
            if (i + j) % 2:
                cv.rect(x, y, s, s, "#d3e6dc")
    return cv


def vent():
    cv = Cv(11, 11)
    cv.rrect(1, 1, 9, 9, "wh2", 1).h_(2, 1, 7, "wh")
    cv.ell(3, 3, 5, 5, "s1").px(5, 5, "s4").pts([(4, 4), (6, 4), (4, 6), (6, 6)], "s3")
    return cv.outline("s2")


def curtain(w=62, h=66):
    """浴簾：一根桿子，簾子收在左邊"""
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, 2, "s1").h_(1, 1, w - 2, "s3")
    cw = 13
    cv.rect(2, 3, cw, h - 4, "pk1")
    for x in range(4, 2 + cw, 3):
        cv.v_(x, 4, h - 6, "pk3")
    cv.v_(2 + cw - 1, 4, h - 6, "pk2")
    for x in range(3, 2 + cw, 4):
        cv.px(x, 3, "s4")
    cv.h_(2, h - 2, cw, "pk2")
    return cv.outline("#8a7570")


def shower_head():
    cv = Cv(12, 32)
    cv.rect(7, 1, 2, 30, "s1").v_(7, 1, 30, "s3")
    cv.rect(3, 2, 5, 2, "s1").h_(3, 2, 5, "s3")
    cv.rect(1, 4, 6, 2, "s2").rect(2, 6, 4, 1, "s4")
    cv.rect(6, 22, 4, 3, "s2").px(10, 23, "s2")
    return cv.outline("s4")


def skincare_shelf(w=24):
    cv = Cv(w, 15)
    # 瓶瓶罐罐
    cv.rect(3, 3, 4, 7, "b1").v_(6, 4, 6, "b2").rect(4, 1, 2, 2, "wh")
    cv.rect(9, 4, 4, 6, "pk1").v_(12, 5, 5, "pk2").rect(10, 2, 2, 2, "wh")
    cv.rect(15, 6, 5, 4, "y1").h_(15, 5, 5, "wh").v_(19, 6, 4, "y2")
    cv.outline()
    sh = Cv(w, 6)
    sh.rect(1, 1, w - 2, 2, "w1").h_(1, 1, w - 2, "w3").rect(3, 3, 2, 1, "w2").rect(w - 5, 3, 2, 1, "w2")
    out = Cv(w, 15)
    out.paste(sh.outline(), 0, 9).paste(cv, 0, 0)
    return out


def bathtub(w=66, h=33):
    """貓腳浴缸"""
    cv = Cv(w, h)
    # 缸身
    cv.poly([(3, 6), (w - 4, 6), (w - 7, h - 6), (6, h - 6)], "wh")
    cv.rect(8, h - 8, w - 16, 2, "wh2").h_(10, h - 6, w - 20, "wh3")
    cv.line(w - 6, 8, w - 9, h - 8, "wh2").line(w - 7, 8, w - 10, h - 8, "wh2")
    cv.rect(6, 9, 2, 10, "#ffffff")
    # 缸緣
    cv.rrect(1, 2, w - 2, 5, "wh", 2).h_(3, 2, w - 6, "#ffffff").h_(3, 6, w - 6, "wh3")
    # 腳
    for x in (8, w - 13):
        cv.rect(x, h - 6, 5, 2, "s1").rect(x + 1, h - 4, 3, 3, "s1").h_(x, h - 2, 5, "s2")
    return cv.outline("#8a7c72")


def tub_tap():
    """浴缸的水龍頭（在牆上）"""
    cv = Cv(14, 9)
    cv.rect(1, 2, 12, 2, "s1").h_(1, 2, 12, "s3")
    cv.rect(2, 1, 2, 4, "s2").rect(10, 1, 2, 4, "s2")
    cv.rect(6, 4, 2, 4, "s1")
    return cv.outline("s4")


def duck():
    cv = Cv(10, 8)
    cv.rect(2, 1, 4, 4, "y1").px(3, 2, "ol").px(2, 1, "y3")
    cv.rect(1, 3, 1, 1, "o1")
    cv.rect(2, 4, 7, 3, "y1").h_(3, 6, 5, "y2").px(8, 3, "y1").px(6, 5, "y2")
    return cv.outline()


def mirror(w=26, h=34):
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, h - 2, "w2").h_(1, 1, w - 2, "w3")
    cv.rect(3, 3, w - 6, h - 6, "b3")
    cv.rect(3, h // 2, w - 6, h // 2 - 3, "#d6ecf8")
    cv.line(6, 12, 12, 6, "#ffffff").line(7, 16, 16, 7, "#ffffff").line(w - 9, h - 7, w - 6, h - 10, "#ffffff")
    return cv.outline()


def sink(w=32, h=47):
    cv = Cv(w, h)
    # 水龍頭
    cv.rect(15, 1, 2, 6, "s1").rect(11, 1, 5, 2, "s1").h_(11, 1, 6, "s3").px(11, 3, "s1")
    cv.rect(18, 4, 2, 2, "s2")
    # 洗手盆
    cv.rrect(1, 6, w - 2, 8, "wh", 1).h_(2, 6, w - 4, "#ffffff").h_(2, 13, w - 4, "wh3").v_(w - 2, 7, 6, "wh2")
    # 櫃子
    cv.rect(3, 14, w - 6, h - 16, "w1").v_(3, 14, h - 16, "w3").v_(w - 4, 14, h - 16, "w2")
    for x in (5, w // 2 + 1):
        ww = w // 2 - 6
        cv.rect(x, 17, ww, h - 23, "w3").h_(x, 17, ww, "w5").h_(x, h - 7, ww, "w2")
        cv.h_(x - 1, 16, ww + 2, "w4").h_(x - 1, h - 6, ww + 2, "w4").v_(x - 1, 17, h - 23, "w4").v_(x + ww, 17, h - 23, "w4")
    cv.rect(w // 2 - 3, 27, 1, 5, "w4").rect(w // 2 + 2, 27, 1, 5, "w4")
    cv.rect(3, h - 3, w - 6, 2, "w4")
    return cv.outline()


def toothbrush_cup():
    cv = Cv(7, 12)
    cv.rect(1, 6, 5, 5, "y3").v_(5, 6, 5, "y2")
    cv.rect(2, 2, 1, 4, "pk2").rect(2, 1, 2, 1, "wh")
    cv.rect(4, 3, 1, 3, "b2").rect(4, 2, 2, 1, "wh")
    return cv.outline()


def towels(w=22):
    """毛巾桿和一條藍毛巾"""
    cv = Cv(w, 23)
    cv.rect(1, 2, w - 2, 2, "s1").h_(1, 2, w - 2, "s3")
    cv.rect(1, 1, 2, 4, "s2").rect(w - 3, 1, 2, 4, "s2")
    cv.outline("s4")
    t = Cv(w, 23)
    t.rect(5, 3, 12, 18, "b1").h_(5, 3, 12, "b3").v_(5, 4, 17, "b3").v_(16, 4, 17, "b2")
    t.h_(5, 17, 12, "b3").h_(5, 18, 12, "b2").h_(5, 20, 12, "b2")
    cv.paste(t.outline("#5e89aa"), 0, 0)
    return cv


def laundry_basket(w=24, h=26):
    cv = Cv(w, h)
    # 冒出來的衣服
    cv.rrect(5, 1, 13, 7, "wh", 2).h_(7, 4, 9, "wh3").rect(12, 2, 5, 3, "b3")
    cv.poly([(1, 7), (w - 2, 7), (w - 4, h - 2), (3, h - 2)], "#e2bf8f")
    for y in range(10, h - 2, 4):
        cv.h_(2, y, w - 4, "#c79d68")
    for x in range(4, w - 3, 4):
        cv.v_(x, 8, h - 10, "#d3ad79")
    cv.rect(1, 6, w - 2, 2, "#eccf9f").h_(1, 7, w - 2, "#c79d68")
    return cv.outline()


def bath_mat(w=48, h=20):
    cv = Cv(w, h)
    cv.rrect(1, 1, w - 2, h - 2, "b1", 2)
    cv.rrect(4, 4, w - 8, h - 8, "wh", 1)
    # 腳印
    cx, cy = w // 2, h // 2
    cv.rect(cx - 2, cy, 5, 3, "b1").rect(cx - 1, cy + 3, 3, 1, "b1")
    cv.pts([(cx - 4, cy - 1), (cx - 4, cy), (cx - 2, cy - 3), (cx - 2, cy - 2), (cx + 2, cy - 3), (cx + 2, cy - 2), (cx + 4, cy - 1), (cx + 4, cy)], "b1")
    return cv.outline("#5e89aa")


def towel_stand():
    """木架子，放摺好的毛巾"""
    cv = Cv(20, 27)
    cv.rect(1, 1, 18, 2, "w3").h_(1, 1, 18, "w5")
    cv.rect(2, 3, 2, 23, "w1").rect(16, 3, 2, 23, "w1")
    cv.rect(4, 13, 12, 2, "w1").rect(4, 22, 12, 2, "w1").h_(4, 13, 12, "w3").h_(4, 22, 12, "w3")
    for y, c, c2 in ((7, "wh", "wh3"), (10, "b3", "b1"), (16, "b1", "b2"), (19, "wh", "wh3")):
        cv.rect(5, y, 10, 3, c).h_(5, y + 2, 10, c2)
    return cv.outline()


def bin_():
    cv = Cv(12, 14)
    cv.poly([(2, 3), (9, 3), (8, 12), (3, 12)], "s3")
    cv.v_(8, 4, 8, "s1").rect(1, 1, 10, 2, "s1").h_(1, 1, 10, "s3")
    return cv.outline("s4")


def build():
    r = Room("bath", wall_h=WALL_H)
    r.layer("wall", striped_wall(WALL_H, "#f8faf3", "#e9efe4"), 0)
    r.layer("wainscot", tile_wall(), WALL_H)
    r.layer("floor", checker_floor(), FLOOR_Y)

    # 牆上
    r.add("vent", "抽風機", vent(), 10, y=34)
    r.add("window", "小窗", C.window(24, 20, seed=3, sill=False, frame="m2", frame_hi="m3", frame_sh="m4"), 100, y=38, at=(100, 38, 24, 20))
    r.variant("window", "night", C.window(24, 20, night=True, seed=3, sill=False, frame="m2", frame_hi="m3", frame_sh="m4"))
    r.add("curtain", "浴簾", curtain(), 3, y=58, at=(3, 58, 62, 66))
    r.add("shower-head", "蓮蓬頭", shower_head(), 52, y=62)
    r.add("skincare-shelf", "保養品架", skincare_shelf(), 20, y=86)
    r.add("tub-tap", "浴缸的水龍頭", tub_tap(), 30, y=110)
    r.add("mirror", "鏡子", mirror(), 73, y=64)
    r.add("towels", "毛巾", towels(), 104, y=88)

    # 靠牆一排
    r.add("bathtub", "浴缸", bathtub(), 2, bottom=157)
    r.add("duck", "小鴨", duck(), 50, bottom=127)
    r.add("sink", "洗手台", sink(), 70, bottom=155, at=(70, 108, 32, 47))
    r.add("soap", "洗手乳", bottle("b1", "b2"), 72, bottom=115)
    r.add("toothbrush-cup", "牙刷杯", toothbrush_cup(), 94, bottom=115)
    r.add("plant", "盆栽", C.tree(15, 27), 108, bottom=155)

    # 地上
    r.add("bath-mat", "浴墊", bath_mat(), 26, bottom=252)
    r.add("towel-stand", "毛巾架", towel_stand(), 5, bottom=262)
    r.add("stand-plant", "毛巾架上的盆栽", C.small_plant("fern", "wh", "wh2", 5, 4), 8, bottom=236)
    r.add("laundry-basket", "洗衣籃", laundry_basket(), 96, bottom=247, at=(96, 221, 24, 26))
    r.add("bin", "垃圾桶", bin_(), 108, bottom=270)
    return r
