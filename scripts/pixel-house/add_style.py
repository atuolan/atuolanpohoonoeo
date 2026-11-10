"""
把一張「一個款式」的長條圖放進紙娃娃：正面｜背面｜走路 1～4，每格 25×41（跟用戶上傳的格式一樣）。
只畫到走路 1（3 格寬）也可以：走路 2～4 會用走路 1 跟著身體上下動。

用法：
  python3 -I scripts/pixel-house/add_style.py <長條圖> <身體> <部位> <款式> [--name 名字] [--price 金幣]
例：
  python3 -I scripts/pixel-house/add_style.py scripts/pixel-house/source/boy-styles/shirt_02.png boy shirt 02 --name 連帽衛衣 --price 2400

會寫：public/pixel-house/chars/<身體>/doll/<動作>/<部位>_<款式>[_格].png、doll.json；有 --name/--price 時也寫 wardrobe.json。
可以整數倍匯出（例如放大 4 倍），會自動縮回 1 倍；半透明的像素補成全有或全無。
"""
import json
import os
import sys

from PIL import Image

args = [a for a in sys.argv[1:]]
opts = {}
for key in ("--name", "--price"):
    if key in args:
        i = args.index(key)
        opts[key] = args[i + 1]
        del args[i : i + 2]
if len(args) != 4:
    sys.exit(__doc__)
# 部位也可以是「跟著別的部位的層」：hairBack = 長頭髮垂在身體後面那段（跟著 hair 的款式），那格空著就不畫
src, who, slot, style = args
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "pixel-house", "chars", who))
manifest_path = os.path.join(ROOT, "doll.json")
manifest = json.load(open(manifest_path, encoding="utf-8"))
poses = manifest["poses"]
W, H = poses["front"]["w"], poses["front"]["h"]
FRAMES = poses["walk"].get("frames", 1)

sheet = Image.open(src).convert("RGBA")
cells = None
for n in (2 + FRAMES, 3):
    for scale in range(1, 17):
        if sheet.size == (W * n * scale, H * scale):
            cells, sheet = n, sheet.resize((W * n, H), Image.NEAREST)
            break
    if cells:
        break
if not cells:
    sys.exit(f"尺寸要是 {W * (2 + FRAMES)}×{H}（全部）或 {W * 3}×{H}（只到走路 1），或它們的整數倍；這張是 {sheet.size[0]}×{sheet.size[1]}")


def cell(i: int) -> Image.Image:
    part = sheet.crop((i * W, 0, i * W + W, H))
    px = part.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return part


def walk_bob() -> list:
    """走路每格身體的上下位移（用身體那層的頭頂算），跟 app 裡一樣"""
    body = next(l for l in poses["walk"]["layers"] if l["slot"] == "body")
    files = list(body["styles"].values())[0]
    tops = []
    for f in files:
        im = Image.open(os.path.join(ROOT, f)).convert("RGBA")
        bbox = im.getchannel("A").getbbox()
        tops.append(bbox[1] if bbox else None)
    base = tops[0]
    return [0 if (t is None or base is None) else t - base for t in tops]


# 部位沒有這層時要插在哪：照這個順序找前一層
ORDER = {
    "front": ["hairBack", "body", "eyes", "blush", "brows", "hair", "underwear", "shoes", "pants", "shirt", "jacket"],
    "back": ["body", "underwear", "pants", "shoes", "shirt", "jacket", "hair"],
    "walk": ["hairBack", "body", "shoes", "eyes", "hair", "pants", "shirt", "jacket"],
}


def put(pose: str, value) -> None:
    p = poses[pose]
    layer = next((l for l in p["layers"] if l["slot"] == slot), None)
    if layer is None:
        layer = {"slot": slot, "styles": {}}
        order = ORDER.get(pose, [])
        before = order[: order.index(slot)] if slot in order else []
        at = 0
        for i, l in enumerate(p["layers"]):
            if l["slot"] in before:
                at = i + 1
        p["layers"].insert(at, layer)
    layer["styles"][style] = value


def empty(im: Image.Image) -> bool:
    return im.getchannel("A").getbbox() is None


written = []
for i, pose in enumerate(("front", "back")):
    if empty(cell(i)):
        continue  # 這個角度看不到（例如背面沒有「身體後面的頭髮」）
    rel = f"doll/{pose}/{slot}_{style}.png"
    cell(i).save(os.path.join(ROOT, rel))
    put(pose, rel)
    written.append(rel)
bob = walk_bob()
walk = []
if empty(cell(2)) and (cells == 3 or all(empty(cell(2 + f)) for f in range(FRAMES))):
    FRAMES = 0
for f in range(FRAMES):
    if cells > 3:
        im = cell(2 + f)
    else:
        im = Image.new("RGBA", (W, H))
        im.paste(cell(2), (0, bob[f] if f < len(bob) else 0))
    rel = f"doll/walk/{slot}_{style}_{f}.png"
    im.save(os.path.join(ROOT, rel))
    walk.append(rel)
if walk:
    put("walk", walk)
written += walk
json.dump(manifest, open(manifest_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if "--name" in opts or "--price" in opts:
    wpath = os.path.join(ROOT, "wardrobe.json")
    catalog = json.load(open(wpath, encoding="utf-8")) if os.path.exists(wpath) else {"uploadFee": 1500, "styles": {}}
    info = catalog.setdefault("styles", {}).setdefault(slot, {}).get(style, {})
    if "--name" in opts:
        info["name"] = opts["--name"]
    if "--price" in opts:
        info["price"] = int(opts["--price"])
    catalog["styles"][slot][style] = info
    lines = [f' "uploadFee": {catalog.get("uploadFee", 1500)},', ' "styles": {']
    slots = list(catalog["styles"].items())
    for si, (s, styles) in enumerate(slots):
        fmt = lambda v: "{ " + ", ".join(f'"{a}": {json.dumps(b, ensure_ascii=False)}' for a, b in v.items()) + " }"
        inner = ", ".join(f'"{k}": {fmt(v)}' for k, v in styles.items())
        lines.append(f'  "{s}": {{ {inner} }}' + ("," if si < len(slots) - 1 else ""))
    lines.append(" }")
    open(wpath, "w", encoding="utf-8").write("{\n" + "\n".join(lines) + "\n}\n")

print(f"{who}/{slot}/{style}：{len(written)} 張" + ("" if cells > 3 else "（走路 2～4 用走路 1）"))
