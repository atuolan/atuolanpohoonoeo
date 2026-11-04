# 像素小屋拆圖

把設計稿的房間圖拆成牆、地板、每件家具（透明背景），給像素小屋主頁用。

```
python3 -I scripts/pixel-house/split_room.py scripts/pixel-house/source/living.png scripts/pixel-house/living.json public/pixel-house/living
```

- `source/`：設計稿（https://claude.ai/artifact/VnszuGe4esytxkV6nHq2pM）資產庫下載的原圖，130×282
- `<房間>.json`：牆、護牆板、地板的範圍，每件家具的保留框（框外跟背景不一樣的像素當成雜點丟掉，露出重建的牆或地板）
- 輸出：`wall.png`、`floor.png`、`items/<id>.png`、`layout.json`（每層的位置；`unassigned` 是丟掉的雜點數）

做法：牆每欄一色（從乾淨的上緣取）、護牆板每列找水平週期、地板每 12 列重複取眾數，重建出空房間；跟原圖不一樣的像素就是家具。
