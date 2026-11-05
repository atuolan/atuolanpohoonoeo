"""
把 Aseprite「匯出 Sprite Sheet → 分割圖層」的長條（直排或橫排都可以）切成一層一張，寫進紙娃娃清單。

用法：python3 -I scripts/pixel-house/split_doll.py <長條圖> <角色> <動作> <圖層名,…（由底往上）> [款式]
例：  python3 -I scripts/pixel-house/split_doll.py scripts/pixel-house/source/boy-front-layers.png boy front body,eyes,blush,brows,hair,underwear,shoes,pants,shirt,jacket 01

輸出：public/pixel-house/chars/<角色>/doll/<動作>/<圖層>_<款式>.png、public/pixel-house/chars/<角色>/doll.json
- 1 px＝房間 1 格，照原尺寸顯示；腳底在畫布最底下、左右置中
- 幾乎不透明的像素（透明度 ≥ 128）補成全不透明，其他清成全透明
"""
import json
import os
import sys

from PIL import Image

src, who, pose, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(",")
style = sys.argv[5] if len(sys.argv) > 5 else "01"
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "pixel-house", "chars", who)
root = os.path.normpath(root)

sheet = Image.open(src).convert("RGBA")
SW, SH = sheet.size
# 比較寬就是橫排（一層一格往右排），否則是直排（往下排）
horizontal = SW > SH
W, H = (SW // len(names), SH) if horizontal else (SW, SH // len(names))
assert (W * len(names) == SW) if horizontal else (H * len(names) == SH), f"{SW}×{SH} 不能平均分成 {len(names)} 層"

os.makedirs(os.path.join(root, "doll", pose), exist_ok=True)
manifest_path = os.path.join(root, "doll.json")
manifest = json.load(open(manifest_path, encoding="utf-8")) if os.path.exists(manifest_path) else {"poses": {}}
layers = []
for i, name in enumerate(names):
    part = sheet.crop((i * W, 0, (i + 1) * W, H)) if horizontal else sheet.crop((0, i * H, W, (i + 1) * H))
    px = part.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    file = f"doll/{pose}/{name}_{style}.png"
    part.save(os.path.join(root, file))
    layers.append({"slot": name, "styles": {style: file}})

# 同一個動作重跑時保留其他款式
old = {l["slot"]: l for l in manifest["poses"].get(pose, {}).get("layers", [])}
for l in layers:
    if l["slot"] in old:
        l["styles"] = {**old[l["slot"]]["styles"], **l["styles"]}
manifest["poses"][pose] = {"w": W, "h": H, "layers": layers}
json.dump(manifest, open(manifest_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{who}/{pose}: {len(names)} 層，{W}×{H}")
