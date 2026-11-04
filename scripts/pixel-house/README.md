# 像素小屋拆圖

把設計稿的房間圖拆成牆、地板、每件家具（透明背景），給像素小屋主頁用。

```
python3 -I scripts/pixel-house/split_room.py scripts/pixel-house/source/living.png scripts/pixel-house/living.json public/pixel-house/living
python3 -I scripts/pixel-house/refine_living.py public/pixel-house/living
rm public/pixel-house/living/_recomposed.png public/pixel-house/living/_unassigned.png

python3 -I scripts/pixel-house/split_room.py scripts/pixel-house/source/bedroom.png scripts/pixel-house/bedroom.json public/pixel-house/bedroom
rm public/pixel-house/bedroom/_recomposed.png public/pixel-house/bedroom/_unassigned.png

python3 -I scripts/pixel-house/split_room.py scripts/pixel-house/source/kitchen.png scripts/pixel-house/kitchen.json public/pixel-house/kitchen
rm public/pixel-house/kitchen/_recomposed.png public/pixel-house/kitchen/_unassigned.png

python3 -I scripts/pixel-house/split_room.py scripts/pixel-house/source/bath.png scripts/pixel-house/bath.json public/pixel-house/bath
rm public/pixel-house/bath/_recomposed.png public/pixel-house/bath/_unassigned.png
```

臥室之後的房間都直接寫在設定檔裡（家具的顏色過濾、被擋住的地方補畫），不用另外的 refine 腳本。

`refine_<房間>.py`：細拆和補畫。牆再拆成壁紙、護牆板；疊在一起的東西拆開（窗戶／窗簾／窗台盆栽／花瓶、電視／電視櫃），被擋住的地方照周圍補畫。

- `source/`：設計稿（https://claude.ai/artifact/VnszuGe4esytxkV6nHq2pM）資產庫下載的原圖，130×282
- `<房間>.json`：牆、護牆板、地板的範圍，每件家具的保留框（框外跟背景不一樣的像素當成雜點丟掉，露出重建的牆或地板）
- 輸出：`wall.png`（壁紙）、`wainscot.png`（護牆板＋踢腳板；浴室是下半的磁磚牆）、`floor.png`、`items/<id>.png`、`layout.json`（每層的位置；`unassigned` 是丟掉的雜點數）

做法：牆每欄一色（從乾淨的上緣取）、護牆板每列找水平週期、地板每 12 列重複取眾數，重建出空房間；跟原圖不一樣的像素就是家具。
