"""幾間房都會用到的家具：窗戶、窗簾、掛鐘、門、電視、盆栽、小東西。"""
from kit import Cv, clip, plant_leaves, pot, window_view


def window(w, h, night=False, moon=False, seed=1, sill=True, frame="w1", frame_hi="w3", frame_sh="w2"):
    """木框窗戶，四格玻璃；下面一條比較寬的窗台。畫出來剛好 w×h。"""
    cv = Cv(w, h)
    sh = 4 if sill else 0
    fx, fy, fw, fh = (3 if sill else 1), 1, w - (6 if sill else 2), h - 2 - sh + (1 if sill else 0)
    # 窗外
    window_view(cv, fx + 2, fy + 2, fw - 4, fh - 4, night=night, moon=moon, seed=seed)
    clip(cv, fx + 2, fy + 2, fw - 4, fh - 4)
    # 玻璃反光
    if not night:
        cv.line(fx + 5, fy + 9, fx + 9, fy + 5, "cloud")
    # 框
    for x, y, ww, hh in ((fx, fy, fw, 2), (fx, fy + fh - 2, fw, 2), (fx, fy, 2, fh), (fx + fw - 2, fy, 2, fh)):
        cv.rect(x, y, ww, hh, frame)
    cv.h_(fx, fy, fw, frame_hi).v_(fx, fy, fh, frame_hi)
    mx, my = fx + fw // 2 - 1, fy + fh // 2 - 1
    cv.rect(mx, fy + 2, 2, fh - 4, frame).rect(fx + 2, my, fw - 4, 2, frame)
    cv.v_(mx, fy + 2, fh - 4, frame_hi).h_(fx + 2, my, fw - 4, frame_hi)
    # 玻璃四周一圈深色，像有厚度
    for x0, x1 in ((fx + 2, mx - 1), (mx + 2, fx + fw - 3)):
        for y0, y1 in ((fy + 2, my - 1), (my + 2, fy + fh - 3)):
            cv.h_(x0, y0, x1 - x0 + 1, "ol").v_(x0, y0, y1 - y0 + 1, "ol")
    if sill:
        cv.rect(1, h - 1 - sh, w - 2, sh, frame)
        cv.h_(1, h - 1 - sh, w - 2, frame_hi).h_(1, h - 2, w - 2, frame_sh)
    return cv.outline()


def curtains(w, h, c="wh", c2="wh2", c3="wh3", tie="pk1", rod="w2"):
    """窗簾：上面一根桿子，左右各一片，中間是空的"""
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, 2, rod).h_(1, 1, w - 2, "w3")
    dw = max(8, w // 5)
    for side in (0, 1):
        x = 2 if side == 0 else w - 2 - dw
        cv.rect(x, 3, dw, h - 5, c)
        # 摺痕
        for i in range(2, dw, 3):
            cv.v_(x + i, 4, h - 7, c2)
        cv.h_(x, 3, dw, c3)
        # 綁帶：下面收窄
        ty = 3 + (h - 5) * 3 // 5
        cv.rect(x, ty, dw, 2, tie)
        inner = x + dw - 2 if side == 0 else x
        cv.clear(inner, ty + 2, 2, h - 5 - (ty - 3) - 2)
        cv.h_(x, h - 3, dw, c3)
    return cv.outline()


def clock(rim="w2", rim_hi="w3"):
    """圓掛鐘 17×17"""
    cv = Cv(17, 17)
    cv.ell(1, 1, 15, 15, rim)
    cv.ell(3, 3, 11, 11, "wh")
    cv.pts([(4, 2), (5, 2), (3, 3), (2, 4), (2, 5)], rim_hi)
    # 刻度
    cv.pts([(8, 4), (8, 12), (4, 8), (12, 8)], "wh3")
    # 指針
    cv.v_(8, 5, 4, "ol").h_(8, 8, 3, "ol")
    return cv.outline()


def door(w=32, h=73, c="w3", panel="w1", frame="w2", knob="y2"):
    """門：門框、兩塊嵌板、門把"""
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, h - 1, frame)
    cv.h_(1, 1, w - 2, "w3").v_(1, 1, h - 1, "w1")
    cv.rect(4, 4, w - 8, h - 4, c)
    cv.rect(3, 3, w - 6, 1, "ol").rect(3, 3, 1, h - 3, "ol").rect(w - 4, 3, 1, h - 3, "ol")
    pw = w - 14
    for py, ph in ((8, 24), (38, h - 44)):
        cv.rect(7, py, pw, ph, panel)
        cv.h_(7, py, pw, "w2").v_(7, py, ph, "w2")
        cv.h_(8, py + ph - 1, pw - 1, "w5").v_(7 + pw - 1, py + 1, ph - 1, "w5")
    # 門把
    cv.rect(w - 9, 34, 3, 3, knob).px(w - 9, 34, "y3")
    cv.h_(w - 10, 37, 5, "w2")
    out = cv.outline()
    # 底下貼著地板，不描底線
    return out


def tv(w=30, h=23, on=False):
    """電視：黑框螢幕和底座"""
    cv = Cv(w, h)
    sh = h - 5
    cv.rect(1, 1, w - 2, sh, "k2")
    scr = "#3f4a6b" if not on else "#5b79b8"
    cv.rect(3, 3, w - 6, sh - 4, scr)
    cv.h_(3, 3, w - 6, "#55618a")
    cv.line(5, 8, 9, 4, "#7c89b3").line(8, 9, 11, 6, "#55618a")
    cv.px(w - 4, sh - 1, "r3")
    cv.rect(w // 2 - 2, sh + 1, 4, 2, "k2")
    cv.rect(w // 2 - 6, sh + 3, 12, 1, "k1")
    return cv.outline("#2a2a30")


def tree(w=15, h=35, pot_c="wh", pot_c2="wh2", pot_h=8):
    """落地的大盆栽：一層一層的葉子"""
    cv = Cv(w, h)
    cx = w // 2
    pot(cv, cx, h - 1 - pot_h, 9, pot_h, pot_c, pot_c2)
    top = 1
    trunk_y = h - 1 - pot_h - 3
    cv.rect(cx, trunk_y, 1, 3, "w4")
    fol_h = trunk_y - top
    # 由上往下越來越寬的三層
    tiers = 3 if fol_h >= 16 else 2
    th = fol_h // tiers + 2
    for t in range(tiers):
        ty = top + t * (fol_h - th) // max(1, tiers - 1)
        half = 3 + t * 2 if tiers == 3 else 4 + t * 2
        half = min(half, cx - 1)
        for j in range(th):
            k = min(half, 1 + j * half // max(1, th - 3))
            cv.h_(cx - k, ty + j, 2 * k + 1, "leaf1")
        cv.h_(cx - half + 1, ty + th - 1, 2 * half - 1, "leaf2")
        # 亮點
        for j in range(1, th - 1, 2):
            k = min(half, 1 + j * half // max(1, th - 3))
            cv.px(cx - k // 2, ty + j, "leaf3").px(cx + (k + 1) // 2, ty + j + 1, "leaf2")
    return cv.outline()


def small_plant(kind="bush", pot_c="terra", pot_c2="terra2", pw=7, ph=5):
    cv = Cv(13, 20)
    pot(cv, 6, 19 - ph, pw, ph, pot_c, pot_c2)
    plant_leaves(cv, 6, 19 - ph - 1, kind)
    return cv.outline()


def hanging_plant():
    """垂下來的盆栽"""
    cv = Cv(16, 24)
    pot(cv, 8, 6, 9, 5, "terra", "terra2")
    plant_leaves(cv, 8, 5, "small")
    vines = {3: 9, 5: 14, 12: 12, 10: 7, 13: 16}
    for x, n in vines.items():
        for j in range(n):
            cv.px(x + (1 if j % 4 == 3 else 0), 9 + j, "leaf1" if j % 3 else "leaf3")
        cv.px(x - 1, 9 + n // 2, "leaf2").px(x + 1, 9 + n - 2, "leaf2")
    return cv.outline()


def vase(flower="wh", c="b1", c2="b2"):
    """花瓶 6×15"""
    cv = Cv(8, 16)
    cv.rect(2, 9, 4, 6, c).v_(5, 10, 5, c2).px(2, 9, "b3")
    cv.rect(3, 8, 2, 1, c)
    cv.v_(3, 4, 4, "leaf2").v_(5, 5, 3, "leaf1")
    cv.rect(2, 2, 3, 2, flower).px(3, 1, flower).px(3, 3, "y1")
    cv.rect(5, 3, 2, 2, flower)
    return cv.outline()


def mug(c="g1", c2="g2", steam=False):
    """馬克杯 8×7"""
    cv = Cv(10, 10)
    cv.rect(1, 3, 6, 6, c).v_(6, 4, 5, c2).h_(1, 3, 6, "wh2")
    cv.rect(7, 4, 2, 1, c).rect(8, 5, 1, 2, c).rect(7, 7, 2, 1, c)
    return cv.outline()


def books(n=5, h=9, seed=0, lean=False):
    """一排書（直的）"""
    cols = [("b2", "b1"), ("r2", "r1"), ("y2", "y1"), ("g4", "g1"), ("pu2", "pu1"), ("w4", "w1"), ("o1", "y3")]
    cv = Cv(n * 3 + 4, h + 2)
    x = 1
    for i in range(n):
        d, l = cols[(i * 3 + seed) % len(cols)]
        bh = h - ((i + seed) % 3)
        bw = 2 + ((i + seed) % 2)
        cv.rect(x, 1 + h - bh, bw, bh, d)
        cv.v_(x, 1 + h - bh, bh, l)
        if bh > 5:
            cv.h_(x, 1 + h - bh + 2, bw, "wh2")
        x += bw
    return cv.outline()


def frame_pic(w=10, h=9, kind="hill", frame="w2"):
    """相框"""
    cv = Cv(w, h)
    cv.rect(1, 1, w - 2, h - 2, frame)
    cv.rect(2, 2, w - 4, h - 4, "sky")
    if kind == "hill":
        cv.rect(2, h - 4, w - 4, 2, "hill").px(3, h - 5, "hill").px(4, h - 5, "hill2")
        cv.px(w - 4, 3, "y1")
    elif kind == "heart":
        cv.rect(2, 2, w - 4, h - 4, "wh")
        cv.art(w // 2 - 2, 3, [".#.#.", "#####", ".###.", "..#.."][: h - 5], {"#": "pk2"})
    elif kind == "flower":
        cv.rect(2, 2, w - 4, h - 4, "wh")
        cx = w // 2
        cv.v_(cx, 5, h - 8, "leaf1").pts([(cx - 1, 4), (cx + 1, 4), (cx, 3), (cx, 5)], "pk1").px(cx, 4, "y1")
    return cv.outline()


def garland(w=124, colors=("o1", "g1", "wh", "y1", "pk1")):
    """燈串：一條垂下來的線，掛一排小燈"""
    cv = Cv(w, 12)
    n = 4
    seg = (w - 2) // n
    for s in range(n):
        x0 = 1 + s * seg
        for i in range(seg + 1):
            t = i / seg
            y = 1 + round(4 * 4 * t * (1 - t))
            cv.px(x0 + i, y, "ol2")
            if i % 8 == 4:
                c = colors[(s * 3 + i // 8) % len(colors)]
                cv.rect(x0 + i - 1, y + 1, 3, 3, c).px(x0 + i - 1, y + 1, "glow")
                cv.px(x0 + i, y + 1, "ol")
    return cv


def wall_shelf(w=28):
    """牆上的層板和兩個托架"""
    cv = Cv(w, 6)
    cv.rect(1, 1, w - 2, 2, "w1").h_(1, 1, w - 2, "w3")
    cv.rect(4, 3, 2, 2, "w2").rect(w - 6, 3, 2, 2, "w2")
    return cv.outline()
