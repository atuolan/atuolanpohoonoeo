"""
把一間房間的像素圖拆成：牆、護牆板（等橫條）、地板、每件家具（透明背景）

用法：python3 -I split_room.py <原圖> <設定 json> <輸出資料夾>

設定：
{
  "tolerance": 0,                 # 跟背景差多少以內算背景（RGB 各通道最大差；壁紙有雜點時調大）
  "wall": [0, 127],               # 牆：每一欄同一個顏色，從 wallCleanRows 取
  "wallCleanRows": [0, 23],
  "bands": [                      # 牆下面的橫條（護牆板、踢腳板…）
    {"rows": [127, 158], "mode": "periodic", "cleanCols": [16, 45]},  # 每列找水平週期，從乾淨的欄取樣
    {"rows": [127, 130], "mode": "rowMode"}                           # 每列取家具框外最常見的顏色
  ],
  "floors": [[158, 282, 12]],     # 地板：[起, 迄, 每幾列重複]；同欄同相位取眾數。週期 0 = 每列取眾數
  "layers": {"wall": [0, 127], "wainscot": [127, 158], "floor": [158, 282]},  # 輸出成哪幾張背景圖
  "items": [
    {"id": "sofa", "name": "沙發", "box": [x0, y0, x1, y1]},   # 或 "boxes": [[...], ...]
    {"id": "desk", "name": "書桌", "box": [...], "holes": [[...]]}  # holes：框裡其實是背景的地方
  ]
}
  另外：
  "toleranceByRows": [[0, 127, 12]],   # 某些列用不同的容差（壁紙有漸層、雜點時）
  band 的 "mode": "fixed" + "colors": ["#e7c2a2", ...]   # 每列直接指定顏色（原圖亂掉的地方重畫成乾淨的橫條）
  floors 可以寫成 {"rows": [a, b], "period": 13, "mode": "row"}  # row：同相位的列取全寬（家具框外）最常見的顏色
  "fillHoles": true   # 家具中間被當成背景的小洞（顏色剛好跟背景很像）補回原圖的顏色
  家具另外可以設：
    "excludeColors": ["#f6d8b9", ...]   # 這些顏色不算這件（光暈、雜點）
    "includeColors": [...]              # 只算這些顏色
  "repairs": [                          # 家具被別的東西擋住的地方補畫（座標是整張房間的）
    {"item": "bed", "rect": [x0, y0, x1, y1], "copy": [-4, 0]},     # 從旁邊照抄
    {"item": "window", "rect": [...], "fill": "#a9b799", "onlyEmpty": true}  # 填一個顏色（只填空的地方）
  ]
舊格式（"bands": [[127,158]] + "bandCleanCols"、"floor" + "floorPeriod"）也還能用。
框外跟背景不一樣的像素當成雜點丟掉，露出重建的背景。
"""
import json
import os
import sys
from collections import Counter

from PIL import Image

src, cfg_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.load(open(cfg_path, encoding="utf-8"))
im = Image.open(src).convert("RGB")
W, H = im.size
px = im.load()
bg = [[None] * W for _ in range(H)]
tol = cfg.get("tolerance", 0)
items = cfg["items"]


def boxes_of(it):
    return it.get("boxes") or [it["box"]]


def in_boxes(x, y, boxes):
    return any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in boxes)


all_boxes = [b for it in items for b in boxes_of(it)]

# ===== 牆：每欄一色 =====
w0, w1 = cfg["wall"]
c0, c1 = cfg["wallCleanRows"]
for x in range(W):
    col = Counter(px[x, y] for y in range(c0, c1)).most_common(1)[0][0]
    for y in range(w0, w1):
        bg[y][x] = col

# ===== 橫條 =====
bands = cfg.get("bands", [])
if bands and isinstance(bands[0], list):
    bands = [{"rows": b, "mode": "periodic", "cleanCols": cfg["bandCleanCols"]} for b in bands]
for band in bands:
    b0, b1 = band["rows"]
    for y in range(b0, b1):
        if band["mode"] == "fixed":
            color = tuple(int(band["colors"][y - b0].lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
            for x in range(W):
                bg[y][x] = color
            continue
        if band["mode"] == "rowMode":
            votes = Counter(px[x, y] for x in range(W) if not in_boxes(x, y, all_boxes))
            if not votes:
                votes = Counter(px[x, y] for x in range(W))
            color = votes.most_common(1)[0][0]
            for x in range(W):
                bg[y][x] = color
            continue
        k0, k1 = band["cleanCols"]
        sample = [px[x, y] for x in range(k0, k1)]
        n = len(sample)
        period = next((p for p in range(1, n // 2 + 1) if all(sample[i] == sample[i + p] for i in range(n - p))), n)
        for x in range(W):
            bg[y][x] = sample[(x - k0) % period]

# ===== 地板 =====
floors = cfg.get("floors") or [[cfg["floor"][0], cfg["floor"][1], cfg["floorPeriod"]]]
floors = [f if isinstance(f, dict) else {"rows": [f[0], f[1]], "period": f[2], "mode": "column"} for f in floors]
for fl in floors:
    (f0, f1), fp, fmode = fl["rows"], fl["period"], fl.get("mode", "column")
    if fmode == "row" and fp:
        for r in range(fp):
            ys = list(range(f0 + r, f1, fp))
            votes = Counter(px[x, y] for y in ys for x in range(W) if not in_boxes(x, y, all_boxes))
            if not votes:
                continue
            color = votes.most_common(1)[0][0]
            for y in ys:
                for x in range(W):
                    bg[y][x] = color
        continue
    if fp == 0:
        for y in range(f0, f1):
            votes = Counter(px[x, y] for x in range(W) if not in_boxes(x, y, all_boxes)) or Counter(px[x, y] for x in range(W))
            color = votes.most_common(1)[0][0]
            for x in range(W):
                bg[y][x] = color
        continue
    for x in range(W):
        for r in range(fp):
            ys = list(range(f0 + r, f1, fp))
            if not ys:
                continue
            votes = Counter(px[x, y] for y in ys)
            best = votes.most_common(1)[0][0]
            for y in ys:
                bg[y][x] = best


tol_rows = [tol] * H
for r0, r1, t in cfg.get("toleranceByRows", []):
    for y in range(r0, r1):
        tol_rows[y] = t


def differs(x, y):
    a, b = px[x, y], bg[y][x]
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2])) > tol_rows[y]


# ===== 家具：跟背景不一樣的像素，照框分給各件 =====
assigned = {it["id"]: [] for it in items}
unassigned = []
for y in range(H):
    for x in range(W):
        if bg[y][x] is None or not differs(x, y):
            continue
        owner = None
        hexcol = "#%02x%02x%02x" % px[x, y]
        for it in items:
            if not in_boxes(x, y, boxes_of(it)) or in_boxes(x, y, it.get("holes", [])):
                continue
            if hexcol in it.get("excludeColors", []):
                continue
            if it.get("includeColors") and hexcol not in it["includeColors"]:
                continue
            owner = it["id"]
            break
        if owner:
            assigned[owner].append((x, y))
        else:
            unassigned.append((x, y))

os.makedirs(out + "/items", exist_ok=True)

layers_cfg = cfg.get("layers") or {
    "wall": [cfg["wall"][0], bands[-1]["rows"][1] if bands else cfg["wall"][1]],
    "floor": [floors[0]["rows"][0], floors[-1]["rows"][1]],
}


def save_layer(name, rows):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lp = layer.load()
    for y in range(*rows):
        for x in range(W):
            lp[x, y] = (*bg[y][x], 255)
    bbox = layer.getbbox()
    layer.crop(bbox).save(f"{out}/{name}.png")
    return {"x": bbox[0], "y": bbox[1], "w": bbox[2] - bbox[0], "h": bbox[3] - bbox[1]}


meta = {"size": [W, H], "layers": list(layers_cfg.keys()), "items": []}
for name, rows in layers_cfg.items():
    meta[name] = save_layer(name, rows)

taken = {p for pts in assigned.values() for p in pts}


def fill_holes(pts):
    """家具框內被包住的透明小洞（不連到外框）補回原圖的像素"""
    if not pts:
        return pts
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    solid = set(pts)
    outside = set()
    stack = [(x, y) for x in range(x0, x1) for y in (y0, y1 - 1)] + [(x, y) for y in range(y0, y1) for x in (x0, x1 - 1)]
    stack = [p for p in stack if p not in solid]
    while stack:
        p = stack.pop()
        if p in outside or p in solid:
            continue
        outside.add(p)
        x, y = p
        for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if x0 <= q[0] < x1 and y0 <= q[1] < y1 and q not in outside and q not in solid:
                stack.append(q)
    holes = [
        (x, y) for x in range(x0, x1) for y in range(y0, y1)
        if (x, y) not in solid and (x, y) not in outside and (x, y) not in taken
    ]
    return pts + holes


colors_of = {}
for it in items:
    pts = assigned[it["id"]]
    if cfg.get("fillHoles") and not it.get("noFill"):
        pts = fill_holes(pts)
    colors_of[it["id"]] = {p: px[p[0], p[1]] for p in pts}


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


for rp_ in cfg.get("repairs", []):
    cmap = colors_of[rp_["item"]]
    x0, y0, x1, y1 = rp_["rect"]
    for y in range(y0, y1):
        for x in range(x0, x1):
            if rp_.get("onlyEmpty") and (x, y) in cmap:
                continue
            if "fill" in rp_:
                cmap[(x, y)] = hex_rgb(rp_["fill"])
            elif "copy" in rp_:
                sx, sy = x + rp_["copy"][0], y + rp_["copy"][1]
                src_c = cmap.get((sx, sy), px[sx, sy])
                cmap[(x, y)] = src_c

for it in items:
    pts = list(colors_of[it["id"]].keys())
    if not pts:
        meta["items"].append({"id": it["id"], "name": it["name"], "empty": True})
        continue
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    sprite = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    sp = sprite.load()
    for x, y in pts:
        sp[x - x0, y - y0] = (*colors_of[it["id"]][(x, y)], 255)
    sprite.save(f"{out}/items/{it['id']}.png")
    meta["items"].append({"id": it["id"], "name": it["name"], "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "pixels": len(pts)})

# 清單裡越前面的越在前面（先搶像素）；存檔和畫的時候由後往前
meta["items"].reverse()

# ===== 拼回去，跟原圖比對（雜點和容差內的不算） =====
recon = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for name in meta["layers"]:
    L = meta[name]
    recon.alpha_composite(Image.open(f"{out}/{name}.png"), (L["x"], L["y"]))
for it in meta["items"]:
    if not it.get("empty"):
        recon.alpha_composite(Image.open(f"{out}/items/{it['id']}.png"), (it["x"], it["y"]))
rp = recon.load()
unassigned_set = set(unassigned)
mismatch = 0
for y in range(H):
    for x in range(W):
        if (x, y) in unassigned_set:
            continue
        a, b = rp[x, y], px[x, y]
        if max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2])) > tol_rows[y]:
            mismatch += 1
meta["unassigned"] = len(unassigned)
meta["unassignedBox"] = (
    [min(p[0] for p in unassigned), min(p[1] for p in unassigned), max(p[0] for p in unassigned) + 1, max(p[1] for p in unassigned) + 1]
    if unassigned
    else None
)
meta["recomposeMismatch"] = mismatch
json.dump(meta, open(f"{out}/layout.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
recon.save(f"{out}/_recomposed.png")
# 丟掉的雜點畫成一張圖，好檢查有沒有丟錯
noise = Image.new("RGBA", (W, H), (0, 0, 0, 0))
npx = noise.load()
for x, y in unassigned:
    npx[x, y] = (*px[x, y], 255)
noise.save(f"{out}/_unassigned.png")
print(json.dumps({k: meta[k] for k in ("unassigned", "unassignedBox", "recomposeMismatch")}, ensure_ascii=False))
for it in meta["items"]:
    print(it["id"], it.get("pixels", "EMPTY"), it.get("x"), it.get("y"), it.get("w"), it.get("h"))
