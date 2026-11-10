"""把走路圖表切成 24 張透明背景的圖：女生／男生 × 向左／向右 × 6 格
用法：python3 -I scripts/pixel-house/extract_walk.py scripts/pixel-house/source/walk-sheet.webp public/pixel-house/chars
輸出：<輸出>/girl/walk-left-1.png … <輸出>/boy/walk-right-6.png、<輸出>/walk.json
每組 6 格用同一張畫布大小，腳下的影子中心對齊在畫布底部中央（保留走路時身體上下起伏）。
底色和腳下的淡紫影子挖掉（影子之後在程式裡畫，才配得上各房間的地板）。
女生的頭髮在原圖裡和隔壁格黏在一起，切開的地方描一道深色輪廓線。
"""
import json
import os
import sys
from collections import deque

from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
p = im.load()
OUTLINE = (48, 36, 48)  # 頭髮輪廓線的顏色
PANELS = {
    'girl-left': (40, 1000, 160, 520),
    'girl-right': (1003, 1965, 160, 520),
    'boy-left': (40, 1000, 665, 1015),
    'boy-right': (1003, 1965, 665, 1015),
}


def lum(c):
    return sum(c) / 3


def is_card(c):
    """卡片底色，含淡灰的雲紋（偏藍或中性、很亮、幾乎沒彩度）"""
    r, g, b = c
    return b - r >= 0 and b - g >= 0 and lum(c) >= 205 and max(c) - min(c) <= 24


def is_card_strict(c):
    r, g, b = c
    return b - r >= 5 and b - g >= 5 and lum(c) >= 225


def is_shadow(c):
    r, g, b = c
    return b - r >= 14 and b - g >= 16 and lum(c) > 150 and not is_card(c)


def flood(x0, x1, y0, y1):
    W, H = x1 - x0, y1 - y0
    bg = [[False] * W for _ in range(H)]
    dq = deque((x, y) for x in range(W) for y in (0, H - 1))
    dq.extend((x, y) for y in range(H) for x in (0, W - 1))
    while dq:
        x, y = dq.popleft()
        if bg[y][x]:
            continue
        c = p[x0 + x, y0 + y]
        if not (is_card(c) or is_shadow(c)):
            continue
        bg[y][x] = True
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not bg[ny][nx]:
                dq.append((nx, ny))
    return bg


def seam(fg, lo, hi, H):
    """在 lo～hi 欄之間找一條由上到下、穿過最少前景的縫，回傳每列的分界 x"""
    INF = 10 ** 9
    w = hi - lo
    cost = [[INF] * w for _ in range(H)]
    back = [[0] * w for _ in range(H)]
    for x in range(w):
        cost[0][x] = fg[0][lo + x]
    for y in range(1, H):
        for x in range(w):
            best, bx = INF, x
            for dx in (-1, 0, 1):
                px_ = x + dx
                if 0 <= px_ < w and cost[y - 1][px_] + (dx != 0) * 0.01 < best:
                    best, bx = cost[y - 1][px_] + (dx != 0) * 0.01, px_
            cost[y][x] = best + fg[y][lo + x]
            back[y][x] = bx
    x = min(range(w), key=lambda i: cost[H - 1][i])
    path = [0] * H
    for y in range(H - 1, -1, -1):
        path[y] = lo + x
        x = back[y][x]
    return path


os.makedirs(out, exist_ok=True)
meta = {}
for name, (x0, x1, y0, y1) in PANELS.items():
    W, H = x1 - x0, y1 - y0
    bg = flood(x0, x1, y0, y1)
    # 被頭髮圍住、灌水灌不到的底色小塊
    seen = [[False] * W for _ in range(H)]
    for sy in range(H):
        for sx in range(W):
            if bg[sy][sx] or seen[sy][sx] or not is_card_strict(p[x0 + sx, y0 + sy]):
                continue
            comp = []
            dq = deque([(sx, sy)])
            seen[sy][sx] = True
            while dq:
                cx, cy = dq.popleft()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not bg[ny][nx] and not seen[ny][nx] and is_card(p[x0 + nx, y0 + ny]):
                        seen[ny][nx] = True
                        dq.append((nx, ny))
            if len(comp) >= 20:
                for cx, cy in comp:
                    bg[cy][cx] = True
    fg = [[0 if bg[y][x] else 1 for x in range(W)] for y in range(H)]
    occ = [sum(fg[y][x] for y in range(H)) for x in range(W)]
    # 每格的中心：腳下影子的位置（影子之間一定分得開）
    shadow_cols = [sum(1 for y in range(H) if bg[y][x] and is_shadow(p[x0 + x, y0 + y])) for x in range(W)]
    runs, on = [], False
    for x, v in enumerate(shadow_cols + [0]):
        if v > 0 and not on:
            on, s0 = True, x
        elif v == 0 and on:
            on = False
            if x - s0 > 20:
                runs.append((s0, x))
    assert len(runs) == 6, (name, runs)
    centers = [(a + b) / 2 for a, b in runs]
    # 各格之間找縫：兩個影子中心之間（各留兩成），穿過最少前景的路
    cuts = []
    for k in range(1, 6):
        d = centers[k] - centers[k - 1]
        lo, hi = int(centers[k - 1] + d * 0.2), int(centers[k] - d * 0.2)
        path = seam(fg, lo, hi, H)
        crossed = sum(fg[y][path[y]] for y in range(H))
        print(f'  {name} 第{k}/{k + 1}格之間的縫穿過 {crossed} 個前景像素')
        cuts.append(path)
    frames = []
    for k in range(6):
        sp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        spp = sp.load()
        sh_x = []
        sh_y = []
        for y in range(H):
            a = cuts[k - 1][y] if k > 0 else 0
            b = cuts[k][y] if k < 5 else W
            for x in range(a, b):
                c = p[x0 + x, y0 + y]
                if fg[y][x]:
                    spp[x, y] = (*c, 255)
                elif is_shadow(c):
                    sh_x.append(x)
                    sh_y.append(y)
        # 跟隔壁格黏在一起被切開的頭髮：切口描 2 格深色邊，看起來像原本的輪廓線
        for side, cut in ((0, cuts[k - 1] if k > 0 else None), (1, cuts[k] if k < 5 else None)):
            if cut is None:
                continue
            for y in range(H):
                cx = cut[y] if side == 0 else cut[y] - 1
                other = cx - 1 if side == 0 else cx + 1
                if 0 <= other < W and fg[y][cx] and fg[y][other]:
                    for d in range(2):
                        xx = cx + d if side == 0 else cx - d
                        if spp[xx, y][3]:
                            spp[xx, y] = (*OUTLINE, 255)
        # 去掉零碎小點：只留最大的連通塊和夠大的塊
        alpha = sp.split()[3]
        A = alpha.load()
        seen = set()
        comps = []
        for y in range(H):
            for x in range(W):
                if A[x, y] and (x, y) not in seen:
                    comp = []
                    dq = deque([(x, y)])
                    seen.add((x, y))
                    while dq:
                        cx, cy = dq.popleft()
                        comp.append((cx, cy))
                        for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                            if 0 <= nx < W and 0 <= ny < H and A[nx, ny] and (nx, ny) not in seen:
                                seen.add((nx, ny))
                                dq.append((nx, ny))
                    comps.append(comp)
        comps.sort(key=len, reverse=True)
        for comp in comps[1:]:
            if len(comp) < 60:
                for cx, cy in comp:
                    spp[cx, cy] = (0, 0, 0, 0)
        gx = sum(sh_x) / len(sh_x)
        gy = sum(sh_y) / len(sh_y)
        frames.append((sp, gx, gy))
    # 同一組用同一個地面高度（影子中心的平均），每格以自己的影子中心 x 對齊
    ground = sum(f[2] for f in frames) / 6
    boxes = [f[0].getbbox() for f in frames]
    half = max(max(f[1] - b[0], b[2] - f[1]) for f, b in zip(frames, boxes))
    top = min(b[1] for b in boxes)
    half = int(half + 2)
    CW, CH = half * 2, int(ground) - top + 1
    meta[name] = {'w': CW, 'h': CH, 'frames': 6, 'anchor': 'bottom-center'}
    for k, (sp, gx, gy) in enumerate(frames):
        canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        crop = sp.crop((int(round(gx)) - half, top, int(round(gx)) + half, int(ground) + 1))
        canvas.alpha_composite(crop)
        who, direction = name.split('-')
        os.makedirs(f'{out}/{who}', exist_ok=True)
        canvas.save(f'{out}/{who}/walk-{direction}-{k + 1}.png')
    print(name, 'canvas', CW, CH, 'ground', round(ground, 1), 'shadow x', [round(f[1]) for f in frames])
json.dump(meta, open(f'{out}/walk.json', 'w'), indent=1)

