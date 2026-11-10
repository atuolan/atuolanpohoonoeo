"""
把 Aseprite「匯出 Sprite Sheet → 分割圖層」的圖切成一層一張，寫進紙娃娃清單。

一格的動作（站著、背面）：長條直排或橫排都可以，一層一格。
好幾格的動作（走路）：加 --frames N，圖是「一列一層、一欄一格」的格子（Aseprite 照圖層分列匯出）。

用法：python3 -I scripts/pixel-house/split_doll.py <圖> <角色> <動作> <圖層名,…（由底往上）> [款式]
                 [--frames N] [--ms 每格毫秒] [--faces left|right]
例：  python3 -I scripts/pixel-house/split_doll.py scripts/pixel-house/source/boy-front-layers-fixed.png boy front body,eyes,blush,brows,hair,underwear,shoes,pants,shirt,jacket 01
      python3 -I scripts/pixel-house/split_doll.py scripts/pixel-house/source/boy-walk-layers.png boy walk body,eyes,hair,pants,shirt,jacket 01 --frames 4 --ms 150 --faces left

輸出：public/pixel-house/chars/<角色>/doll/<動作>/<圖層>_<款式>[_<格>].png、public/pixel-house/chars/<角色>/doll.json
- 1 px＝房間 1 格，照原尺寸顯示；腳底在畫布最底下、左右置中
- 幾乎不透明的像素（透明度 ≥ 128）補成全不透明，其他清成全透明
- --faces：畫的是往哪邊走；另一邊程式左右翻過來
"""
import json
import os
import sys

from PIL import Image

args = sys.argv[1:]
opts = {}
for flag in ("--frames", "--ms", "--faces"):
    if flag in args:
        i = args.index(flag)
        opts[flag] = args[i + 1]
        del args[i : i + 2]
src, who, pose, names = args[0], args[1], args[2], args[3].split(",")
style = args[4] if len(args) > 4 else "01"
frames = int(opts.get("--frames", "1"))
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "pixel-house", "chars", who)
root = os.path.normpath(root)

sheet = Image.open(src).convert("RGBA")
SW, SH = sheet.size
if frames > 1:
    # 格子：一欄一格、一列一層
    W, H = SW // frames, SH // len(names)
    assert W * frames == SW and H * len(names) == SH, f"{SW}×{SH} 不能分成 {frames} 格 × {len(names)} 層"
    cell = lambda layer, f: (f * W, layer * H, (f + 1) * W, (layer + 1) * H)
else:
    # 比較寬就是橫排（一層一格往右排），否則是直排（往下排）
    horizontal = SW > SH
    W, H = (SW // len(names), SH) if horizontal else (SW, SH // len(names))
    assert (W * len(names) == SW) if horizontal else (H * len(names) == SH), f"{SW}×{SH} 不能平均分成 {len(names)} 層"
    cell = lambda layer, f: (layer * W, 0, (layer + 1) * W, H) if horizontal else (0, layer * H, W, (layer + 1) * H)

os.makedirs(os.path.join(root, "doll", pose), exist_ok=True)
manifest_path = os.path.join(root, "doll.json")
manifest = json.load(open(manifest_path, encoding="utf-8")) if os.path.exists(manifest_path) else {"poses": {}}


def clean(part):
    px = part.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return part


layers = []
for i, name in enumerate(names):
    files = []
    for f in range(frames):
        file = f"doll/{pose}/{name}_{style}.png" if frames == 1 else f"doll/{pose}/{name}_{style}_{f}.png"
        clean(sheet.crop(cell(i, f))).save(os.path.join(root, file))
        files.append(file)
    layers.append({"slot": name, "styles": {style: files[0] if frames == 1 else files}})

# 同一個動作重跑時保留其他款式
old = {l["slot"]: l for l in manifest["poses"].get(pose, {}).get("layers", [])}
for l in layers:
    if l["slot"] in old:
        l["styles"] = {**old[l["slot"]]["styles"], **l["styles"]}
# 這次沒拆到的層（例如另外加的走路鞋子）也留著，放回原本前一層的後面
prev = None
for slot, l in old.items():
    names_now = [x["slot"] for x in layers]
    if slot not in names_now:
        at = names_now.index(prev) + 1 if prev in names_now else 0
        layers.insert(at, l)
    prev = slot
entry = {"w": W, "h": H}
if frames > 1:
    entry["frames"] = frames
    entry["ms"] = int(opts.get("--ms", "150"))
if "--faces" in opts:
    entry["faces"] = opts["--faces"]
entry["layers"] = layers
manifest["poses"][pose] = entry
json.dump(manifest, open(manifest_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{who}/{pose}: {len(names)} 層" + (f" × {frames} 格" if frames > 1 else "") + f"，{W}×{H}")
