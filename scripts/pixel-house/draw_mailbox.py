"""
客廳的信箱（點了打開訊息）：原圖裡沒有，另外畫。
- public/pixel-house/living/items/mailbox.png：平常
- public/pixel-house/living/items/mailbox-full.png：有未讀訊息時，投信口露出一封信（兩張一樣大，換圖不會跳）
- 把信箱加進 living/layout.json（已經有就更新位置和大小）

重新跑 split_room.py 拆客廳之後，要再跑一次這支：
python3 -I scripts/pixel-house/draw_mailbox.py
"""
import json
import os

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "pixel-house", "living"))

# 配色跟著客廳：外框用電視櫃的深棕，信箱是暖紅色，名牌用黃銅色
P = {
    "O": (90, 58, 42),
    "R": (204, 108, 90),
    "D": (168, 80, 66),
    "L": (228, 146, 122),
    "S": (72, 53, 47),
    "Y": (226, 186, 112),
    "y": (180, 140, 80),
    "W": (251, 247, 238),
    "E": (214, 196, 176),
}

BASE = [
    "..............",
    "..............",
    "....OOOOOO....",
    "..OOLLLLRROO..",
    ".OLLRRRRRRRDO.",
    ".OLRRRRRRRRDO.",
    "OLRRRRRRRRRRDO",
    "OLRRRRRRRRRRDO",
    "OLRROOOOOORRDO",
    "OLRROSSSSORRDO",
    "OLRROOOOOORRDO",
    "OLRRRRRRRRRRDO",
    "OLRRRRYYRRRRDO",
    "OLRRRRyyRRRRDO",
    "ORRRRRRRRRRRDO",
    "ODDDDDDDDDDDDO",
    "OOOOOOOOOOOOOO",
]

# 有信：投信口插著一封信，從信箱上緣冒出來
FULL = list(BASE)
FULL[3] = "..OOLOOOOOOO.."
FULL[4] = ".OLLOWWWWORDO."
FULL[5] = ".OLROWEEWORDO."
FULL[6] = "OLRROWWEWORRDO"
FULL[7] = "OLRROWWWWORRDO"
FULL[8] = "OLRROWWWWORRDO"
FULL[9] = "OLRROWWWWORRDO"

# 掛在電視右上方、大門左邊的牆上（房間格子）
X, Y = 83, 90


def draw(rows):
    assert all(len(r) == len(rows[0]) for r in rows)
    im = Image.new("RGBA", (len(rows[0]), len(rows)))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in P:
                im.putpixel((x, y), P[ch] + (255,))
    return im


base = draw(BASE)
full = draw(FULL)
base.save(os.path.join(ROOT, "items", "mailbox.png"))
full.save(os.path.join(ROOT, "items", "mailbox-full.png"))

path = os.path.join(ROOT, "layout.json")
layout = json.load(open(path, encoding="utf-8"))
entry = {"id": "mailbox", "name": "信箱", "x": X, "y": Y, "w": base.width, "h": base.height}
items = [it for it in layout["items"] if it["id"] != "mailbox"]
items.append(entry)
layout["items"] = items
with open(path, "w", encoding="utf-8") as f:
    json.dump(layout, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"mailbox {base.size} at ({X}, {Y})")
