"""
把一間房間的像素圖拆成：牆（含護牆板、踢腳板）、地板、每件家具（透明背景）

用法：python3 -I split_room.py <原圖> <設定 json> <輸出資料夾>
設定：
{
  "wall": [0, 127],            # 牆：每一欄同一個顏色，從 cleanRows 取
  "wallCleanRows": [0, 23],
  "bands": [[127, 158]],       # 護牆板：每一列找水平週期，從 cleanCols 取樣補滿
  "bandCleanCols": [16, 45],
  "floor": [158, 282],         # 地板：每 floorPeriod 列重複，同欄同相位取最多的顏色
  "floorPeriod": 12,
  "items": [ {"id": "sofa", "name": "沙發", "box": [x0, y0, x1, y1]}, ... ]  # 先列的優先
}
"""
import json
import sys
from collections import Counter

from PIL import Image

src, cfg_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.load(open(cfg_path, encoding="utf-8"))
im = Image.open(src).convert("RGB")
W, H = im.size
px = im.load()
bg = [[None] * W for _ in range(H)]

# ===== 牆：每欄一色 =====
w0, w1 = cfg["wall"]
c0, c1 = cfg["wallCleanRows"]
for x in range(W):
    col = Counter(px[x, y] for y in range(c0, c1)).most_common(1)[0][0]
    for y in range(w0, w1):
        bg[y][x] = col

# ===== 護牆板：每列找水平週期 =====
k0, k1 = cfg["bandCleanCols"]
for b0, b1 in cfg["bands"]:
    for y in range(b0, b1):
        sample = [px[x, y] for x in range(k0, k1)]
        n = len(sample)
        period = None
        for p in range(1, n // 2 + 1):
            if all(sample[i] == sample[i + p] for i in range(n - p)):
                period = p
                break
        if period is None:
            period = n
        for x in range(W):
            bg[y][x] = sample[(x - k0) % period]

# ===== 地板：週期列，同欄同相位取眾數 =====
f0, f1 = cfg["floor"]
fp = cfg["floorPeriod"]
for x in range(W):
    for r in range(fp):
        votes = Counter(px[x, y] for y in range(f0 + r, f1, fp))
        best = votes.most_common(1)[0][0]
        for y in range(f0 + r, f1, fp):
            bg[y][x] = best

# ===== 家具：跟背景不一樣的像素，照框分給各件 =====
items = cfg["items"]
assigned = {it["id"]: [] for it in items}
unassigned = []
for y in range(H):
    for x in range(W):
        if bg[y][x] is None or px[x, y] == bg[y][x]:
            continue
        owner = None
        for it in items:
            for x0, y0, x1, y1 in it.get("boxes") or [it["box"]]:
                if x0 <= x < x1 and y0 <= y < y1:
                    owner = it["id"]
                    break
            if owner:
                break
        if owner:
            assigned[owner].append((x, y))
        else:
            unassigned.append((x, y))

import os

os.makedirs(out + "/items", exist_ok=True)

def save_layer(name, rows):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lp = layer.load()
    for y in range(*rows):
        for x in range(W):
            c = bg[y][x]
            lp[x, y] = (*c, 255)
    bbox = layer.getbbox()
    layer.crop(bbox).save(f"{out}/{name}.png")
    return {"x": bbox[0], "y": bbox[1], "w": bbox[2] - bbox[0], "h": bbox[3] - bbox[1]}

meta = {"size": [W, H], "wall": save_layer("wall", (cfg["wall"][0], cfg["bands"][-1][1])), "floor": save_layer("floor", tuple(cfg["floor"])), "items": []}

for it in items:
    pts = assigned[it["id"]]
    if not pts:
        meta["items"].append({**it, "empty": True})
        continue
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    sprite = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    sp = sprite.load()
    for x, y in pts:
        sp[x - x0, y - y0] = (*px[x, y], 255)
    sprite.save(f"{out}/items/{it['id']}.png")
    meta["items"].append({"id": it["id"], "name": it["name"], "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "pixels": len(pts)})

# ===== 拼回去，跟原圖比對 =====
recon = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for name in ("wall", "floor"):
    L = meta[name]
    recon.alpha_composite(Image.open(f"{out}/{name}.png"), (L["x"], L["y"]))
for it in meta["items"]:
    if it.get("empty"):
        continue
    recon.alpha_composite(Image.open(f"{out}/items/{it['id']}.png"), (it["x"], it["y"]))
rp = recon.load()
unassigned_set = set(unassigned)
mismatch = sum(1 for y in range(H) for x in range(W) if rp[x, y][:3] != px[x, y] and (x, y) not in unassigned_set)
meta["unassigned"] = len(unassigned)
meta["unassignedBox"] = (
    [min(p[0] for p in unassigned), min(p[1] for p in unassigned), max(p[0] for p in unassigned) + 1, max(p[1] for p in unassigned) + 1]
    if unassigned
    else None
)
meta["recomposeMismatch"] = mismatch
json.dump(meta, open(f"{out}/layout.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
recon.save(f"{out}/_recomposed.png")
print(json.dumps({k: meta[k] for k in ("unassigned", "unassignedBox", "recomposeMismatch")}, ensure_ascii=False))
for it in meta["items"]:
    print(it["id"], it.get("pixels", "EMPTY"), it.get("x"), it.get("y"), it.get("w"), it.get("h"))
