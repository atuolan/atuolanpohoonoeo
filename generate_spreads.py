import json
import math

with open('APK/extracted/tarot_spread_tarot_spreads.json', 'r', encoding='utf-8') as f:
    spreads_data = json.load(f)

def get_layout(card_num, spread_id, name):
    positions = []
    
    # Default position names
    def_names = [f"第{i}張牌" for i in range(1, card_num + 1)]
    def_descs = [f"位置 {i} 的解讀" for i in range(1, card_num + 1)]
    
    coords = []
    if card_num == 1:
        coords = [{"x": 50, "y": 50}]
    elif card_num == 3:
        if "三角" in name:
            coords = [{"x": 50, "y": 20}, {"x": 25, "y": 70}, {"x": 75, "y": 70}]
            def_names = ["過去/原因", "現在/過程", "未來/結果"]
        else:
            coords = [{"x": 20, "y": 50}, {"x": 50, "y": 50}, {"x": 80, "y": 50}]
            def_names = ["過去", "現在", "未來"]
    elif card_num == 4:
        if "三角" in name:
            coords = [{"x": 50, "y": 20}, {"x": 25, "y": 60}, {"x": 75, "y": 60}, {"x": 50, "y": 85}]
        else:
            coords = [{"x": 20, "y": 50}, {"x": 40, "y": 50}, {"x": 60, "y": 50}, {"x": 80, "y": 50}]
    elif card_num == 5:
        if "十字" in name:
            coords = [{"x": 50, "y": 20}, {"x": 20, "y": 50}, {"x": 50, "y": 50}, {"x": 80, "y": 50}, {"x": 50, "y": 80}]
        elif "五芒星" in name:
            coords = [{"x": 50, "y": 15}, {"x": 85, "y": 40}, {"x": 70, "y": 85}, {"x": 30, "y": 85}, {"x": 15, "y": 40}]
        elif "二择一" in name or "二選一" in name:
            coords = [{"x": 50, "y": 80}, {"x": 30, "y": 50}, {"x": 70, "y": 50}, {"x": 20, "y": 20}, {"x": 80, "y": 20}]
        else:
            coords = [{"x": 10, "y": 50}, {"x": 30, "y": 50}, {"x": 50, "y": 50}, {"x": 70, "y": 50}, {"x": 90, "y": 50}]
    elif card_num == 6:
        coords = [{"x": 30, "y": 30}, {"x": 50, "y": 30}, {"x": 70, "y": 30}, {"x": 30, "y": 70}, {"x": 50, "y": 70}, {"x": 70, "y": 70}]
    elif card_num == 7:
        if "六芒星" in name:
            coords = [{"x": 50, "y": 15}, {"x": 80, "y": 35}, {"x": 80, "y": 65}, {"x": 50, "y": 85}, {"x": 20, "y": 65}, {"x": 20, "y": 35}, {"x": 50, "y": 50}]
        else:
            coords = [{"x": 50, "y": 20}, {"x": 25, "y": 40}, {"x": 75, "y": 40}, {"x": 25, "y": 70}, {"x": 75, "y": 70}, {"x": 50, "y": 90}, {"x": 50, "y": 55}]
    elif card_num == 8:
        coords = [{"x": 50, "y": 10}, {"x": 25, "y": 30}, {"x": 75, "y": 30}, {"x": 25, "y": 60}, {"x": 75, "y": 60}, {"x": 25, "y": 90}, {"x": 75, "y": 90}, {"x": 50, "y": 50}]
    elif card_num == 9:
        coords = [{"x": 20, "y": 20}, {"x": 50, "y": 20}, {"x": 80, "y": 20}, {"x": 20, "y": 50}, {"x": 50, "y": 50}, {"x": 80, "y": 50}, {"x": 20, "y": 80}, {"x": 50, "y": 80}, {"x": 80, "y": 80}]
    elif card_num == 10: # Celtic Cross
        coords = [{"x": 40, "y": 50}, {"x": 40, "y": 50}, {"x": 40, "y": 80}, {"x": 15, "y": 50}, {"x": 40, "y": 20}, {"x": 65, "y": 50}, {"x": 85, "y": 85}, {"x": 85, "y": 65}, {"x": 85, "y": 45}, {"x": 85, "y": 25}]
    elif card_num == 11:
        coords = [{"x": 50, "y": 10}, {"x": 70, "y": 25}, {"x": 30, "y": 25}, {"x": 70, "y": 45}, {"x": 30, "y": 45}, {"x": 50, "y": 55}, {"x": 70, "y": 70}, {"x": 30, "y": 70}, {"x": 50, "y": 80}, {"x": 50, "y": 95}, {"x": 85, "y": 50}]
    elif card_num == 13: # Zodiac
        coords = []
        for i in range(12):
            angle = math.pi / 2 - (i * math.pi / 6)
            x = 50 + 35 * math.cos(angle)
            y = 50 - 35 * math.sin(angle)
            coords.append({"x": round(x, 1), "y": round(y, 1)})
        coords.append({"x": 50, "y": 50})
    else:
        # Fallback circle
        coords = []
        for i in range(card_num):
            angle = math.pi / 2 - (i * 2 * math.pi / card_num)
            x = 50 + 35 * math.cos(angle)
            y = 50 - 35 * math.sin(angle)
            coords.append({"x": round(x, 1), "y": round(y, 1)})

    for i in range(card_num):
        c = coords[i] if i < len(coords) else {"x": 50, "y": 50}
        positions.append({
            "id": f"pos-{i+1}",
            "name": f"Position {i+1}",
            "nameCn": def_names[i] if i < len(def_names) else f"第{i+1}張牌",
            "description": def_descs[i] if i < len(def_descs) else f"位置 {i+1} 的解讀",
            "coords": c
        })
    return positions

ts_content = """/**
 * 塔羅牌陣定義 (Starcat 原版)
 */
import type { FateSpread } from "@/types/fate";

export const fateSpreads: FateSpread[] = [
"""

for spread in spreads_data:
    s_id = spread.get("id", "")
    name = spread.get("name", "").strip()
    card_num = int(spread.get("card_num", 1))
    content = spread.get("content", "").strip().replace('\r', '').replace('\n', '\\n')
    
    positions = get_layout(card_num, s_id, name)
    
    ts_content += f"""  {{
    id: "starcat-{s_id}",
    name: "{name}",
    nameCn: "{name}",
    description: "{content}",
    layoutType: "free",
    positions: [
"""
    for pos in positions:
        ts_content += f"""      {{
        id: "{pos['id']}",
        name: "{pos['name']}",
        nameCn: "{pos['nameCn']}",
        description: "{pos['description']}",
        coords: {{ x: {pos['coords']['x']}, y: {pos['coords']['y']} }},
      }},
"""
    ts_content += """    ],
  },
"""

ts_content += "];\n"

with open('src/data/fateSpreads.ts', 'w', encoding='utf-8') as f:
    f.write(ts_content)

print("Successfully generated src/data/fateSpreads.ts")
