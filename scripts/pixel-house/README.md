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

# 晚上的窗戶（夜空、星星、月亮）：items/window-night.png
python3 -I scripts/pixel-house/night_windows.py

# 自己畫的分層小人（Aseprite 匯出 Sprite Sheet → 分割圖層，直排或橫排都可以；圖層名由底往上）
python3 -I scripts/pixel-house/split_doll.py scripts/pixel-house/source/boy-front-layers-fixed.png boy front body,eyes,blush,brows,hair,underwear,shoes,pants,shirt,jacket 01
# （boy-front-layers.png 是使用者畫的原稿，-fixed 是修過的版本）
python3 -I scripts/pixel-house/split_doll.py scripts/pixel-house/source/boy-back-layers.png boy back body,underwear,pants,shoes,shirt,jacket,hair 01
# 側面走路：格子圖（一列一層、一欄一格），畫的是往左走，往右程式左右翻
# （褲子、衣服、外套的 1~3 格是照第 0 格補畫的）
python3 -I scripts/pixel-house/split_doll.py scripts/pixel-house/source/boy-walk-layers.png boy walk body,eyes,hair,pants,shirt,jacket 01 --frames 4 --ms 150 --faces left

# 小人走路圖（暫用；女生／男生 × 向左／向右 × 6 格）
python3 -I scripts/pixel-house/extract_walk.py scripts/pixel-house/source/walk-sheet.webp public/pixel-house/chars
```

臥室之後的房間都直接寫在設定檔裡（家具的顏色過濾、被擋住的地方補畫），不用另外的 refine 腳本。

`refine_<房間>.py`：細拆和補畫。牆再拆成壁紙、護牆板；疊在一起的東西拆開（窗戶／窗簾／窗台盆栽／花瓶、電視／電視櫃），被擋住的地方照周圍補畫。

- `source/`：設計稿（https://claude.ai/artifact/VnszuGe4esytxkV6nHq2pM）資產庫下載的原圖，130×282
- `<房間>.json`：牆、護牆板、地板的範圍，每件家具的保留框（框外跟背景不一樣的像素當成雜點丟掉，露出重建的牆或地板）
- 輸出：`wall.png`（壁紙）、`wainscot.png`（護牆板＋踢腳板；浴室是下半的磁磚牆）、`floor.png`、`items/<id>.png`、`layout.json`（每層的位置；`unassigned` 是丟掉的雜點數）

做法：牆每欄一色（從乾淨的上緣取）、護牆板每列找水平週期、地板每 12 列重複取眾數，重建出空房間；跟原圖不一樣的像素就是家具。

## 加一個新款式（一張長條圖）

畫一張 150×41：正面｜背面｜走路 1～4，每格 25×41（跟用戶上傳的格式一樣；只畫到走路 1 的 75×41 也可以，可以整數倍匯出）：

```
python3 -I scripts/pixel-house/add_style.py <長條圖> boy shirt 05 --name 毛衣 --price 2000
```

會切好放進 `doll/`、寫進 `doll.json` 和 `wardrobe.json`。同一個款式重跑會覆蓋。

`source/boy-styles/` 是我（Claude）畫的那幾套的長條圖，想改就在 Aseprite 裡改，再用上面的指令放回去。
`shoes_01.png` 只有走路那 4 格是新的（原本走路沒穿鞋）。

加完之後跑 `npx vitest run src/components/pixelHouse/dollAssets.test.ts`：會檢查檔案在不在、尺寸對不對、清單上的款式每個角度都有畫。

## 女生（chars/girl）

- 跟男生同一個人胚：`doll.json` 裡的身體、腮紅、眉毛、內褲直接指到 `../boy/doll/...`；男生的衣服也換個編號放進來（改男生那張，女生也會跟著變）。
- 女生自己的款式長條圖在 `source/girl-styles/`，一樣用 `add_style.py ... girl <部位> <款式>` 放回去。
- `doll.json` 的 `defaults`：沒選的部位預設穿什麼，`null` = 不穿（女生預設不穿外套）。

## 長頭髮：hairBack

垂到肩膀以下的頭髮要畫在身體後面，不然會被衣服蓋住：另外畫一張 `hairBack` 長條圖（正面｜背面｜走路，背面通常空著），
跟著同一個髮型編號、同一個髮色：

```
python3 -I scripts/pixel-house/add_style.py source/girl-styles/hairBack_01.png girl hairBack 01
```

注意：換色是拿每一層「最多的那個顏色」當主色，所以 hairBack 的主色要跟前面的頭髮一樣，外框和陰影不要比主色多。

## 客廳的信箱

信箱不在原圖裡，另外畫。重新跑 `split_room.py` 拆客廳之後，要再跑一次：

```
python3 -I scripts/pixel-house/draw_mailbox.py
```

