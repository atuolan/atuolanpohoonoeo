"""
把每間房的窗戶（items/window.png）做一張晚上的版本（items/window-night.png）：
天空換成夜空、雲變暗、樹變成剪影，再點幾顆星星；客廳和臥室的大窗加一個月亮。

用法：python3 -I scripts/pixel-house/night_windows.py
"""
import os
import random

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "pixel-house"))


def hx(s):
    return tuple(int(s[i : i + 2], 16) for i in (1, 3, 5)) + (255,)


STAR = hx("#fff4c8")
MOON = hx("#fbf0c6")

# 每間：天空色 → 夜空色；其他要換的顏色（雲、樹、玻璃反光）；幾顆星星；要不要月亮
ROOMS = {
    "living": {"sky": {"#cce4f0": "#2e3866"}, "other": {"#fdeede": "#4b5687", "#a9b799": "#26323f"}, "cloud": "#fdeede", "stars": 7, "moon": True},
    "bedroom": {"sky": {"#cce4f0": "#2e3866"}, "other": {"#fdeede": "#4b5687", "#a9b799": "#26323f"}, "cloud": "#fdeede", "stars": 7, "moon": True},
    "kitchen": {"sky": {"#afd6ee": "#2e3866"}, "other": {"#8fb580": "#28363c", "#9fc48f": "#2f3f44"}, "stars": 4, "moon": False},
    "bath": {"sky": {"#bfe3f2": "#34416c"}, "other": {"#e2f3fa": "#56658f"}, "stars": 2, "moon": False},
}


def main():
    for room, cfg in ROOMS.items():
        src = os.path.join(ROOT, room, "items", "window.png")
        im = Image.open(src).convert("RGBA")
        W, H = im.size
        px = im.load()
        sky_src = {hx(k) for k in cfg["sky"]}
        sky_map = {hx(k): hx(v) for k, v in cfg["sky"].items()}
        other = {hx(k): hx(v) for k, v in cfg["other"].items()}
        orig = {(x, y): px[x, y] for y in range(H) for x in range(W)}
        is_sky = lambda x, y: 0 <= x < W and 0 <= y < H and orig[(x, y)] in sky_src

        # 雲的顏色也出現在窗台反光：只換跟天空連在一起的那幾塊
        cloud = hx(cfg["cloud"]) if "cloud" in cfg else None
        cloud_ok = set()
        if cloud:
            seen = set()
            for start, c in orig.items():
                if c != cloud or start in seen:
                    continue
                comp, stack, touches = [], [start], False
                seen.add(start)
                while stack:
                    x, y = stack.pop()
                    comp.append((x, y))
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if is_sky(nx, ny):
                            touches = True
                        if (nx, ny) in orig and (nx, ny) not in seen and orig[(nx, ny)] == cloud:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
                if touches:
                    cloud_ok.update(comp)

        for (x, y), c in orig.items():
            if c in sky_map:
                px[x, y] = sky_map[c]
            elif c == cloud:
                if (x, y) in cloud_ok:
                    px[x, y] = other[c]
            elif c in other:
                px[x, y] = other[c]

        # 星星：四周都是天空的格子，彼此隔開
        rng = random.Random(f"night-{room}")
        inner = [(x, y) for (x, y) in orig if all(is_sky(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1))]
        rng.shuffle(inner)
        stars = []
        moon_box = None
        if cfg["moon"]:
            # 右上那一格裡放 4×4 的彎月（找一塊 6×6 都是天空、最靠右上的地方）
            cands = [
                (x, y)
                for (x, y) in orig
                if all(is_sky(x + dx, y + dy) for dx in range(-1, 5) for dy in range(-1, 5))
            ]
            cands.sort(key=lambda p: (p[1] - p[0]))
            if cands:
                mx, my = cands[0]
                moon_box = (mx - 2, my - 2, mx + 6, my + 6)
                shape = [".##.", "#...", "#...", ".##."]
                for dy, row in enumerate(shape):
                    for dx, ch in enumerate(row):
                        if ch == "#":
                            px[mx + dx, my + dy] = MOON
        for x, y in inner:
            if len(stars) >= cfg["stars"]:
                break
            if moon_box and moon_box[0] <= x <= moon_box[2] and moon_box[1] <= y <= moon_box[3]:
                continue
            if all(abs(x - sx) + abs(y - sy) >= 6 for sx, sy in stars):
                stars.append((x, y))
                px[x, y] = STAR

        out = os.path.join(ROOT, room, "items", "window-night.png")
        im.save(out)
        print(f"{room}: 星星 {len(stars)}，月亮 {'有' if moon_box else '沒有'}")


if __name__ == "__main__":
    main()
