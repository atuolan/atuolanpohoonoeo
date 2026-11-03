"""把生圖模型做的「像素風」圖清洗成真正對齊格子的像素圖。

做法：去背景 → 整張先縮成少量顏色 → 依目標高度切格子，每格取出現最多的顏色 → 半數以上是背景的格子變透明。
"""
import sys
import numpy as np
from PIL import Image

SHEETS = {
    "actions": {
        "file": "in/actions.png",
        "boxes": {
            "girl_walk": (30, 80, 340, 500), "girl_phone": (340, 80, 615, 500), "girl_sleep": (600, 80, 910, 500),
            "girl_happy": (905, 80, 1195, 500), "girl_sad": (1195, 80, 1530, 500),
            "boy_walk": (30, 515, 330, 975), "boy_phone": (340, 515, 616, 975), "boy_sleep": (616, 515, 900, 975),
            "boy_happy": (895, 515, 1195, 975), "boy_sad": (1205, 515, 1530, 975),
        },
    },
    "turnaround": {
        "file": "in/turnaround.png",
        "boxes": {
            "girl_front": (110, 50, 420, 460), "girl_right": (420, 50, 690, 460),
            "boy_front": (850, 40, 1125, 465), "boy_right": (1155, 40, 1420, 465),
            "girl_back": (110, 540, 420, 950), "girl_left": (430, 540, 700, 950),
            "boy_back": (860, 530, 1125, 955), "boy_left": (1155, 530, 1430, 955),
        },
    },
}


def background(im):
    return np.median(np.concatenate([im[:12, :12].reshape(-1, 3), im[-12:, -12:].reshape(-1, 3)]), axis=0)


def clean(sheet_im, box, block, bg, colors=24):
    crop = sheet_im.crop(box)
    a = np.asarray(crop.convert("RGB")).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    lum = a.mean(2)
    # 背景是淡紫色、腳下影子是深一點的紫：藍明顯比綠高、又不暗的就是背景
    near_bg = np.abs(a - bg).sum(2) < 45
    # 影子和毛邊：偏紫、亮度中等；很亮的米白衣服要留下
    lavender = ((b - g) > 18) & ((b - r) > 8) & (lum > 135) & (lum < 205)
    is_bg = near_bg | lavender
    # 只用人物的像素建立調色盤
    q = crop.convert("RGB").quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[: colors * 3]).reshape(-1, 3)
    idx = np.asarray(q)
    h, w = idx.shape
    th, tw = int(h / block), int(w / block)
    out = np.zeros((th, tw, 4), dtype=np.uint8)
    for j in range(th):
        for i in range(tw):
            y0, y1 = int(j * block), int((j + 1) * block)
            x0, x1 = int(i * block), int((i + 1) * block)
            # 每格取中間 70%，避開模糊的邊
            my, mx = max(1, int((y1 - y0) * 0.15)), max(1, int((x1 - x0) * 0.15))
            cell_bg = is_bg[y0 + my:y1 - my, x0 + mx:x1 - mx]
            cell = idx[y0 + my:y1 - my, x0 + mx:x1 - mx]
            if cell.size == 0 or cell_bg.mean() > 0.45:
                continue
            vals = cell[~cell_bg]
            c = np.bincount(vals.ravel()).argmax()
            out[j, i, :3] = pal[c]
            out[j, i, 3] = 255
    out = drop_specks(out)
    out = warm_balance(out)
    # 裁掉多餘的透明邊
    ys, xs = np.where(out[:, :, 3] > 0)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(out, "RGBA")


def drop_specks(out, keep_ratio=0.08):
    """拿掉跟身體沒連在一起的小碎片（星星、汗滴、動作線）"""
    from collections import deque
    alpha = out[:, :, 3] > 0
    h, w = alpha.shape
    lab = np.zeros((h, w), int)
    sizes = [0]
    for y in range(h):
        for x in range(w):
            if alpha[y, x] and not lab[y, x]:
                n = len(sizes); sizes.append(0)
                q = deque([(y, x)]); lab[y, x] = n
                while q:
                    a, b = q.popleft(); sizes[n] += 1
                    for da in (-1, 0, 1):
                        for db in (-1, 0, 1):
                            c, d = a + da, b + db
                            if 0 <= c < h and 0 <= d < w and alpha[c, d] and not lab[c, d]:
                                lab[c, d] = n; q.append((c, d))
    big = max(sizes)
    for n, sz in enumerate(sizes):
        if n and sz < big * keep_ratio:
            out[lab == n] = 0
    return out


def warm_balance(out):
    """原圖整體偏紫：降一點藍、補一點紅綠，再把暗部壓深一點讓外框清楚"""
    rgb = out[:, :, :3].astype(float)
    rgb *= np.array([1.04, 1.0, 0.9])
    lum = rgb.mean(2, keepdims=True)
    rgb = np.where(lum < 70, rgb * 0.8, rgb)
    out[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def preview(sprites, scale, path, bgc=(222, 214, 240)):
    pad = 6
    W = sum(s.width for s in sprites) * scale + pad * (len(sprites) + 1)
    H = max(s.height for s in sprites) * scale + pad * 2
    c = Image.new("RGBA", (W, H), bgc + (255,))
    x = pad
    for s in sprites:
        big = s.resize((s.width * scale, s.height * scale), Image.NEAREST)
        c.alpha_composite(big, (x, H - pad - big.height))
        x += big.width + pad
    c.save(path)


if __name__ == "__main__":
    target_h = int(sys.argv[1])  # 站姿人物要變成幾格高
    names = sys.argv[2].split(",") if len(sys.argv) > 2 else None
    results = {}
    for sheet, cfg in SHEETS.items():
        im = Image.open(cfg["file"]).convert("RGB")
        bg = background(np.asarray(im).astype(int))
        # 以男生正面站姿的實際高度決定格子大小，整張圖共用
        for name, box in cfg["boxes"].items():
            if names and name not in names:
                continue
            results[name] = (im, box, bg)
    ref_im = Image.open(SHEETS["turnaround"]["file"]).convert("RGB")
    ref_bg = background(np.asarray(ref_im).astype(int))
    ref = np.asarray(ref_im.crop(SHEETS["turnaround"]["boxes"]["boy_front"])).astype(int)
    rows = np.where((np.abs(ref - ref_bg).sum(2) > 38).sum(1) > 2)[0]
    src_h = rows.max() - rows.min() + 1
    block = src_h / target_h
    print("boy_front 原圖高", src_h, "→ 每格", round(block, 2), "像素")
    out = []
    for name, (im, box, bg) in results.items():
        s = clean(im, box, block, bg)
        s.save(f"out/{name}_{target_h}.png")
        out.append(s)
        print(name, s.size)
    preview(out, 4, f"out/preview_{target_h}.png")
