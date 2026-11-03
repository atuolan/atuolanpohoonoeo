"""把生圖模型畫的房間清洗成 130 格寬的像素圖，補滿手機比例，加上白天／黃昏／晚上的光線，再放上人物。"""
import sys
import numpy as np
from PIL import Image

SRC = "in/room.png"
W = 130
H = 282
TOP_PAD = 18  # 上面補的牆（手機狀態列會蓋住最上面）
MID_AT = 146  # 在這一排（原圖 y≈1150，電視上緣）前面插入地板
MID_PAD = 44
SPRITES = sys.argv[1] if len(sys.argv) > 1 else None


def hx(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def pixelate(src, w):
    """每格取中間區域出現最多的顏色（先縮成 48 色，邊緣才不會糊）"""
    q = src.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[:48 * 3]).reshape(-1, 3)
    idx = np.asarray(q)
    block = src.width / w
    h = int(round(src.height / block))
    out = np.zeros((h, w, 3))
    for j in range(h):
        for i in range(w):
            y0, y1 = int(j * block), int((j + 1) * block)
            x0, x1 = int(i * block), int((i + 1) * block)
            my, mx = max(1, (y1 - y0) // 5), max(1, (x1 - x0) // 5)
            cell = idx[y0 + my:y1 - my, x0 + mx:x1 - mx]
            out[j, i] = pal[np.bincount(cell.ravel()).argmax()]
    return out, block


def to_cells(v, block):
    return int(round(v / block))


def sy(v, block):
    """原圖 y 座標 → 格子 y（含上方補的牆、中間插入的地板）"""
    c = to_cells(v, block)
    return c + TOP_PAD + (MID_PAD if c >= MID_AT else 0)


def build_base():
    src = Image.open(SRC).convert("RGB")
    room, block = pixelate(src, W)
    rh = room.shape[0]
    canvas = np.zeros((H, W, 3))
    # 上面：重複牆的那一排（燈串上方）
    canvas[:TOP_PAD] = room[1:2]
    canvas[TOP_PAD:TOP_PAD + MID_AT] = room[:MID_AT]
    # 中間：重複後排地板的磚紋，把床、電視、地毯往下推
    tile = room[140:146]  # 只有地板磚紋的 6 排
    for k in range(MID_PAD):
        canvas[TOP_PAD + MID_AT + k] = tile[k % len(tile)]
    # 交錯的接縫，看起來才像一塊一塊的地板
    seam = room[140].mean(0) * 0.92
    for k in range(MID_PAD):
        band = k // len(tile)
        if k % len(tile) == 0:
            continue
        for x in range((band % 2) * 21 + 6, W, 42):
            canvas[TOP_PAD + MID_AT + k, x] = seam
    rest = room[MID_AT:]
    y0 = TOP_PAD + MID_AT + MID_PAD
    canvas[y0:y0 + len(rest)] = rest[:H - y0]
    # 下面：地毯下方的乾淨木地板
    floor_tile = room[rh - 7:rh]
    for y in range(y0 + len(rest), H):
        canvas[y] = floor_tile[(y - y0 - len(rest)) % len(floor_tile)]
    return canvas, block


def src_box(block, x0, y0, x1, y1):
    """原圖座標 → 格子座標（含上方補的牆）"""
    return (to_cells(x0, block), sy(y0, block), to_cells(x1, block), sy(y1, block))


def paste(img, mask, path, x, bottom):
    sp = np.asarray(Image.open(path).convert("RGBA")).astype(float)
    h, w = sp.shape[:2]
    y = bottom - h
    for j in range(h):
        for i in range(w):
            if sp[j, i, 3] > 127 and 0 <= y + j < H and 0 <= x + i < W:
                img[y + j, x + i] = sp[j, i, :3]
                mask[y + j, x + i] = True


def floor_shadow(img, cx, y, rx):
    for i in range(-rx, rx + 1):
        for j in range(2):
            if abs(i) <= rx - j * 2 and 0 <= y + j < H:
                img[y + j, cx + i] *= 0.8


def render(scene, out):
    img, block = BASE.copy(), BLOCK
    char = np.zeros((H, W), bool)
    emit = np.zeros((H, W), bool)
    yy, xx = np.mgrid[0:H, 0:W]

    win = src_box(block, 418, 175, 645, 545)
    lamp = src_box(block, 630, 760, 690, 800)
    screen = src_box(block, 425, 795, 572, 880)
    tv = src_box(block, 712, 1155, 928, 1278)
    bulbs_y = sy(70, block)

    def rect_mask(b):
        return (xx >= b[0]) & (xx < b[2]) & (yy >= b[1]) & (yy < b[3])

    win_m = rect_mask(win)
    # 窗框和窗格不算玻璃：只取偏藍或偏綠的亮像素
    glass = win_m & ((img[:, :, 2] > img[:, :, 0] + 10) | (img[:, :, 1] > img[:, :, 0] + 5))

    # ---- 床上的手機（原圖沒有，補一支）----
    px_, py_ = to_cells(410, block), sy(1232, block)
    img[py_:py_ + 7, px_:px_ + 4] = hx("#3B2A26")
    img[py_ + 1:py_ + 6, px_ + 1:px_ + 3] = hx("#8FD8FF")
    img[py_ + 1, px_ + 2] = hx("#D47F58")
    emit[py_ + 1:py_ + 6, px_ + 1:px_ + 3] = True

    # ---- 人物 ----
    rug_y = sy(1440, block)
    if SPRITES:
        if scene == "day":
            floor_shadow(img, 74, rug_y + 4, 9)
            paste(img, char, f"{SPRITES}/boy_front_42.png", 62, rug_y + 5)
        elif scene == "dusk":
            floor_shadow(img, 74, rug_y + 4, 9)
            paste(img, char, f"{SPRITES}/boy_phone_42.png", 61, rug_y + 5)
        else:
            bed_top = sy(1300, block)
            paste(img, char, f"{SPRITES}/boy_sleep_42.png", to_cells(150, block), bed_top)

    if scene == "dusk":
        m = ~glass & ~char & ~emit
        img[m] = img[m] * 0.8 + hx("#E0895E") * 0.2
        img[glass] = img[glass] * 0.55 + hx("#F2A26B") * 0.45
        img[char] = img[char] * 0.9 + hx("#E0895E") * 0.1
        d = np.hypot(xx - (lamp[0] + 2), (yy - lamp[3]) * 1.1)
        g = np.clip(1 - d / 34, 0, 1) ** 1.6
        img += (hx("#FFD08A") * 0.4)[None, None, :] * g[:, :, None] * (~glass)[:, :, None]
    elif scene == "night":
        m = ~glass & ~char & ~emit
        img[m] = img[m] * np.array([0.42, 0.42, 0.62])
        img[char] = img[char] * np.array([0.78, 0.76, 0.92]) + hx("#3A3F6A") * 0.08
        # 窗外變成夜空：保留明暗（樹的形狀），換成深藍
        lum = img[glass].mean(1, keepdims=True) / 255
        img[glass] = hx("#1E2846") * (0.6 + lum * 0.6)
        rng = np.random.default_rng(3)
        gy, gx = np.where(glass & (yy < win[1] + (win[3] - win[1]) * 0.55))
        for k in rng.choice(len(gy), size=min(9, len(gy)), replace=False):
            img[gy[k], gx[k]] = hx("#FFF3C4")
        # 檯燈
        d = np.hypot(xx - (lamp[0] + 2), (yy - lamp[3]) * 1.1)
        g = np.clip(1 - d / 44, 0, 1) ** 1.5
        img += (hx("#FFD08A") * 0.6)[None, None, :] * g[:, :, None] * (~glass)[:, :, None]
        # 燈串：每顆燈泡周圍亮一點
        for x in range(4, W - 4, 9):
            dd = np.hypot(xx - x, yy - bulbs_y)
            gg = np.clip(1 - dd / 6, 0, 1) ** 2
            img += (hx("#FFD08A") * 0.4)[None, None, :] * gg[:, :, None]
        # 螢幕發光
        sm = rect_mask((screen[0] + 1, screen[1] + 1, screen[2] - 1, screen[3] - 1))
        img[sm] = hx("#5FA6C4")
    np.clip(img, 0, 255, out=img)
    im = Image.fromarray(img.astype(np.uint8), "RGB")
    im.save(out)
    im.resize((W * 3, H * 3), Image.NEAREST).save(out.replace(".png", "@3x.png"))


BASE, BLOCK = build_base()
if __name__ == "__main__":
    print("每格", round(BLOCK, 2), "原圖像素，房間", BASE.shape[1], "x", BASE.shape[0])
    for sc in ("day", "dusk", "night"):
        render(sc, f"out/room-{sc}.png")
    a = [Image.open(f"out/room-{n}@3x.png") for n in ("day", "dusk", "night")]
    c = Image.new("RGB", (sum(i.width for i in a) + 40, a[0].height), (40, 40, 40))
    x = 0
    for i in a:
        c.paste(i, (x, 0))
        x += i.width + 20
    c.save("out/compare.png")
