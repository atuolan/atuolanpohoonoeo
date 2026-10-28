"""把 sheet.png 切成 240×240 的貼圖 WebP，並做商店用的 stickers-day/night 預覽圖

用法：python slice-stickers.py sheet.png <系列圖片資料夾> [預覽要用的貼圖編號，逗號分隔]
例如：python slice-stickers.py sheet.png ../../public/chat-skins/greenbubble 1,9,15,22,24,17
"""
import os
import sys

from PIL import Image

sheet_path, out_dir = sys.argv[1], sys.argv[2]
picks = [int(x) for x in (sys.argv[3] if len(sys.argv) > 3 else "1,9,15,22,24,17").split(",")]

sheet = Image.open(sheet_path).convert("RGBA")
cols, size = 6, 240
rows = sheet.height // size
os.makedirs(os.path.join(out_dir, "stickers"), exist_ok=True)

count = 0
for i in range(rows * cols):
    r, c = divmod(i, cols)
    cell = sheet.crop((c * size, r * size, c * size + size, r * size + size))
    if cell.getbbox() is None:  # 空格（最後一列沒排滿）
        continue
    # 圖碰到格子邊緣代表被切到了（陰影的淡色可以忽略）
    alpha = cell.split()[3]
    edges = [alpha.crop(b).getextrema()[1] for b in ((0, 0, size, 1), (0, size - 1, size, size), (0, 0, 1, size), (size - 1, 0, size, size))]
    if max(edges) > 40:
        print(f"注意：第 {i + 1} 張碰到邊緣，可能被切到", edges)
    cell.save(os.path.join(out_dir, "stickers", f"{i + 1:02d}.webp"), "WEBP", quality=90, method=6)
    count += 1

for name, color in (("day", (237, 237, 237, 255)), ("night", (17, 17, 17, 255))):
    bg = Image.new("RGBA", (780, 520), color)
    for k, n in enumerate(picks[:6]):
        rr, cc = divmod(k, 3)
        st = Image.open(os.path.join(out_dir, "stickers", f"{n:02d}.webp")).convert("RGBA")
        bg.alpha_composite(st, (30 + cc * 250, 20 + rr * 250))
    bg.convert("RGB").save(os.path.join(out_dir, f"stickers-{name}.webp"), "WEBP", quality=85, method=6)

print(f"切好 {count} 張，預覽圖用 {picks[:6]}")
