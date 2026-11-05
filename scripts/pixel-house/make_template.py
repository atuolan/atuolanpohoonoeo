"""
做給用戶畫衣服用的人胚：
- chars/<身體>/template.png：原尺寸，一格一格往右排：正面｜背面｜走路 1｜走路 2｜走路 3｜走路 4
  （身體＋內褲；正面和走路有眼睛、眉毛，方便對頭髮的位置）
- chars/<身體>/template-guide.png：放大 8 倍、畫上格線和說明的圖

用法：python3 -I scripts/pixel-house/make_template.py boy
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

who = sys.argv[1] if len(sys.argv) > 1 else "boy"
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "pixel-house", "chars", who))
manifest = json.load(open(os.path.join(ROOT, "doll.json"), encoding="utf-8"))
poses = manifest["poses"]
KEEP = {"front": ["body", "underwear", "eyes", "brows"], "back": ["body", "underwear"], "walk": ["body", "eyes"]}


def cell(pose, frame=0):
    p = poses[pose]
    out = Image.new("RGBA", (p["w"], p["h"]))
    for layer in p["layers"]:
        if layer["slot"] not in KEEP[pose]:
            continue
        f = list(layer["styles"].values())[0]
        if isinstance(f, list):
            f = f[min(frame, len(f) - 1)]
        out.alpha_composite(Image.open(os.path.join(ROOT, f)).convert("RGBA"))
    return out


W, H = poses["front"]["w"], poses["front"]["h"]
cells = [cell("front"), cell("back")] + [cell("walk", i) for i in range(poses["walk"].get("frames", 1))]
while len(cells) < 6:
    cells.append(cells[2])
sheet = Image.new("RGBA", (W * 6, H))
for i, c in enumerate(cells):
    sheet.alpha_composite(c, (i * W, 0))
sheet.save(os.path.join(ROOT, "template.png"))

# ===== 說明圖 =====
Z = 8
font_paths = ["/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc"]
font_path = next((p for p in font_paths if os.path.exists(p)), None)
font = ImageFont.truetype(font_path, 22) if font_path else ImageFont.load_default()
small = ImageFont.truetype(font_path, 18) if font_path else ImageFont.load_default()
INK = (59, 42, 38, 255)
PAPER = (251, 247, 238, 255)
TOP = 46
NOTES = [
    f"1 格 {W}×{H}，1 像素＝1 格；腳底貼齊最下面，不要移動身體的位置",
    "只畫衣服或頭髮那一層，不要把身體一起匯出；透明背景的 PNG",
    f"一格一格往右排：正面｜背面｜走路 1（{W * 3}×{H}），完整走路再加 2～4（{W * 6}×{H}）",
    "沒畫走路 2～4 的話，會用走路 1 跟著身體上下動；褲子和袖子最好 4 格都畫",
]
GW = W * 6 * Z
GH = TOP + H * Z + 16 + len(NOTES) * 28 + 12
guide = Image.new("RGBA", (GW, GH), PAPER)
d = ImageDraw.Draw(guide)
labels = ["正面", "背面", "走路 1", "走路 2", "走路 3", "走路 4"]
for i, label in enumerate(labels):
    x0 = i * W * Z
    tw = d.textlength(label, font=font)
    d.text((x0 + (W * Z - tw) / 2, 10), label, fill=INK, font=font)
    # 淡淡的棋盤格當背景
    for gy in range(H):
        for gx in range(W):
            if (gx + gy) % 2:
                d.rectangle([x0 + gx * Z, TOP + gy * Z, x0 + gx * Z + Z - 1, TOP + gy * Z + Z - 1], fill=(239, 230, 212, 255))
big = sheet.resize((W * 6 * Z, H * Z), Image.NEAREST)
guide.alpha_composite(big, (0, TOP))
# 格線：每 5 格一條淡線，每格之間粗線
for gx in range(0, W * 6 + 1):
    x = gx * Z
    if gx % W == 0:
        d.line([(x, TOP), (x, TOP + H * Z)], fill=INK, width=3)
    elif gx % 5 == 0:
        d.line([(x, TOP), (x, TOP + H * Z)], fill=(59, 42, 38, 60), width=1)
for gy in range(0, H + 1, 5):
    y = TOP + gy * Z
    d.line([(0, y), (GW, y)], fill=(59, 42, 38, 60), width=1)
d.line([(0, TOP), (GW, TOP)], fill=INK, width=3)
d.line([(0, TOP + H * Z), (GW, TOP + H * Z)], fill=INK, width=3)
y = TOP + H * Z + 14
for n in NOTES:
    d.text((12, y), "・" + n, fill=INK, font=small)
    y += 28
guide.save(os.path.join(ROOT, "template-guide.png"))
print(f"{who}: template.png {sheet.size}，template-guide.png {guide.size}")
