# 像素小屋工具

把生圖模型做的「像素風」圖整理成真正對齊格子的像素圖，給像素小屋主頁用。
計畫：`docs/superpowers/plans/2026-11-03-pixel-room-roadmap.md`

需要 Python 3、Pillow、numpy。三個腳本都從**自己所在的資料夾**讀寫 `in/`、`out/`。

| 檔案 | 做什麼 |
|---|---|
| `clean_sprites.py` | 人物動作圖 → 去背景、去特效、對齊格子、暖色調整。`python3 clean_sprites.py <高度格數> [名稱,名稱]` |
| `room_from_image.py` | 房間圖 → 130 格寬、補成手機比例、加白天／黃昏／晚上光線、放上人物。`python3 room_from_image.py <人物資料夾>` |
| `render_procedural.py` | 第二版：完全用程式畫的房間（不需要圖） |

## 原圖

原圖（`in/actions.png`、`in/turnaround.png`、`in/room.png`）沒有放進 repo。
`clean_sprites.py` 裡每個動作的切割範圍、`room_from_image.py` 裡窗戶／檯燈／床的位置，都是照這次的原圖量的；換新圖要重新量。

## 產出

- `sprites/`：男生、女生各個動作（54 格高），男生另有 42 格高（第三版房間用）
- `rooms/`：第三版房間的白天、黃昏、晚上（130×282，顯示時放大 3 倍）

## 三房（客廳｜臥室｜廚房＋浴室）

- `house/draw_house.py`：客廳、廚房、浴室的暫代圖（牆、地板、小東西借臥室的圖，傢俱用程式畫）。在 `house/` 裡跑：`python3 draw_house.py`，輸出到 `house/out/`
- `rooms/bedroom-nochar.png`：臥室（第三版）不放人物的白天圖
- `canvas/House.dc.html`：畫布上的三房原型（換房間、他自己走來走去、每間能點的東西、轉盤選單），`canvas/Room3.dc.html` 是第三版單間
- 之後換成使用者生的客廳／廚房／浴室圖，`House.dc.html` 裡 `acts()` 的站位和 `SP` 的可點範圍要重新量
