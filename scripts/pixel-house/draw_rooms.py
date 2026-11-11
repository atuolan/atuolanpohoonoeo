"""
像素小屋的四間房，全部用程式畫：先畫空房間（牆、護牆板、地板），家具再一件一件畫好放上去。

    python3 -I scripts/pixel-house/draw_rooms.py            # 畫好寫進 public/pixel-house/<房間>/
    python3 -I scripts/pixel-house/draw_rooms.py --preview <資料夾>   # 只出預覽圖，不動 public

每間都是 130×282；家具的 id 跟程式裡用的一樣（houseData.ts）。
畫法在 draw/kit.py，每間房一個檔：draw/living.py、bedroom.py、kitchen.py、bath.py。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "draw"))

from PIL import Image  # noqa: E402

import bath  # noqa: E402
import bedroom  # noqa: E402
import kitchen  # noqa: E402
import living  # noqa: E402

BUILDERS = [living.build, bedroom.build, kitchen.build, bath.build]


def main():
    preview = None
    if "--preview" in sys.argv:
        preview = sys.argv[sys.argv.index("--preview") + 1]
        os.makedirs(preview, exist_ok=True)
    only = [a for a in sys.argv[1:] if a in ("living", "bedroom", "kitchen", "bath")]
    rooms = [b() for b in BUILDERS]
    rooms = [r for r in rooms if not only or r.id in only]
    if preview:
        for kind, kw in (("empty", {"empty": True}), ("day", {}), ("night", {"night": True})):
            sheet = Image.new("RGBA", (len(rooms) * 136 - 6, 282), (255, 255, 255, 255))
            for i, r in enumerate(rooms):
                sheet.alpha_composite(r.compose(**kw), (i * 136, 0))
            sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(os.path.join(preview, f"{kind}.png"))
        for r in rooms:
            r.compose().resize((130 * 6, 282 * 6), Image.NEAREST).save(os.path.join(preview, f"{r.id}.png"))
    else:
        for r in rooms:
            r.save()
            print(f"{r.id}: {len(r.items)} 件")


if __name__ == "__main__":
    main()
