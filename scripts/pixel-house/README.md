# 像素小屋的圖

## 房間和家具：全部用程式畫

四間房（客廳、臥室、廚房、浴室）都是 130×282。先畫空房間（牆、護牆板、地板），家具再一件一件畫好放上去：

```
python3 -I scripts/pixel-house/draw_rooms.py                    # 畫好寫進 public/pixel-house/<房間>/
python3 -I scripts/pixel-house/draw_rooms.py --preview <資料夾>  # 只出預覽圖（空房間、白天、晚上），不動 public
python3 -I scripts/pixel-house/draw_rooms.py --preview <資料夾> kitchen   # 只看一間
```

- `draw/kit.py`：畫布、色票（四間共用）、形狀、自動描外框、空房間的牆和地板
- `draw/common.py`：幾間都用到的家具（窗戶、窗簾、掛鐘、門、電視、盆栽、杯子…）
- `draw/living.py`、`bedroom.py`、`kitchen.py`、`bath.py`：每間的家具和擺在哪
- 輸出：`wall.png`、`wainscot.png`（護牆板；浴室是下半的磁磚牆）、`floor.png`、`items/<id>.png`、`layout.json`
- 晚上的窗戶（`items/window-night.png`）、有信的信箱（`items/mailbox-full.png`）、他睡覺時的床（`items/bed-sleep.png`）也是這支一起畫的

改一件家具：改那個函式，跑一次預覽看看，再跑一次不帶 `--preview` 的寫進去。

加一件家具：在那間的 `build()` 裡 `r.add("<id>", "<名字>", <圖>, <x>, bottom=<底部那列>)`。
掛在牆上的要把 id 加進 `houseData.ts` 的 `WALL_ITEMS`；點了要打開 App 的加進 `FURNITURE_ACTIONS`。
已經有的 id 不要改名（使用者搬過的位置、他做事時站哪，都是跟著 id 走）。

### 擺件（擺件商店賣的）

`draw/decor.py` 的 `DECOR` 清單：id、名字、畫的函式、價錢、預設放哪間的哪裡、是不是掛在牆上。
跑 `draw_rooms.py` 會輸出 `public/pixel-house/decor/<id>.png` 和 `decor.json`（程式讀這份）。
加一件新擺件只要畫一個函式、在 `DECOR` 加一行，商店就會出現，不用改程式。
id 不能跟房間原本的家具一樣，已經上架的 id 不要改（使用者買過的是記 id）。

### 家具的款式（換色、換花樣）

`draw/skins.py`：擺件商店「換款式」賣的。換色是拿已經畫好的家具圖，把某一組顏色（例如沙發的綠色那組）整組換成別的色調，
其他顏色（抱枕、木頭、外框）不動；原本有睡覺、有信、晚上的圖的，那幾張也一起換。換花樣是重新畫（床的條紋、點點被子）。

- 加一個換色：在 `add(...)` 那幾行加一個 `(色調, 名字)`；色調在 `TONES`
- 加一件家具的換色：`add(房間, 家具 id, 顏色組, 價錢, [...])`，顏色組是那件家具「要換的那些顏色」
- 款式一定要跟原本一樣大（不一樣大會直接報錯），換了才不會影響擺放
- 輸出 `public/pixel-house/skins/<房間>/<家具>/<款式>.png` 和 `skins/skins.json`；已經上架的款式 id 不要改（使用者買過的是記 id）

### 他睡覺時的床

`items/bed-sleep.png`：被子中間鼓起來的版本（`bedroom.py` 的 `bed(sleep=True)`）。
小人只留頭（正面、閉眼，程式自動做的）放在枕頭上，位置是 `houseData.ts` 的 `ACTS.sleep.lie`；
床的枕頭或被子位置有改，要一起調 `bulge()` 和 `lie`。

改完跑 `npx vitest run src/components/pixelHouse/houseLogic.test.ts`。

`source/living.png` 等四張是最早那版設計稿的原圖，只留著參考。

## 寵物

寵物的圖不是圖檔，是寫在程式裡的字串（一個字母一格，字母是「部位」，顏色由花色決定）：貓在 `houseCat.ts` 的 `CAT_ART`，其他在 `petArt.ts`。

貓的原稿：`source/cat-sheet.png`，一排五張（坐著｜走路 1｜走路 2｜睡覺｜吃飯），每格 36×24，橘貓的顏色。
在 Aseprite 改好之後傳回來，照顏色和位置換回字母、更新 `CAT_ART`（新顏色要決定是哪個部位，其他花色才推得出來）。

## 小人

```
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
