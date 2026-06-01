import json

# === 目標檔案路徑 ===
target_path = "prompt-sillytavern-1780302765544-配置檔100000.json"

with open(target_path, "r", encoding="utf-8") as f:
    target_data = json.load(f)

# === 新的 prompt 排列順序（identifier），依照參考檔的分組邏輯 ===
new_order = [
    # 區塊1: 前導
    "custom_1775981528552",       # 前情提要(不開)

    # 區塊2: 核心身份
    "protectionSequence",         # 🌟星核:看見世界的第一眼(預設)
    "sovereigntyNegotiation",     # 🌟星魂:我是誰?(預設)
    "coreUnderstanding",          # 🌟星願:我的願望(預設)
    "narrativeMission",           # 🌟星語:我聽見了(預設)
    "languageMode",               # 🌟星眸:真實之眼(預設)

    # 區塊3: 時間天氣
    "timeInfo",                   # 時間信息
    "weatherInfo",                # 天氣資訊

    # 區塊4: 用戶上下文
    "characterWorldContext",      # 角色世界設定情境
    "userInfo",                   # 用戶信息
    "userSecrets",                # 用戶的秘密

    # 區塊5: 角色信息
    "worldInfoBefore",            # 世界書 (↑角色)
    "charDescription",            # 角色描述
    "charPersonality",            # 角色性格
    "characterCorePersonality",   # {{char}}與{{user}}的權力關係
    "worldInfoAfter",             # 世界書 (↓角色)
    "scenario",                   # 場景
    "dialogueExamples",           # 對話示例
    "chatHistory",                # 聊天歷史

    # 區塊6: 線上功能
    "socialMedia",                # 社交媒體動態
    "stickerList",                # 表情包列表
    "stickerSystem",              # 表情包系統(必開)
    "callDecision",               # 來電決策(必開)
    "onlineModeIntro",            # 線上模式介紹(預設)
    "onlineModeFeatures",         # 線上模式功能(必開)

    # 區塊7: 狀態層
    "doNotDisturbStatus",         # 勿擾模式狀態
    "ongoingCallStatus",          # 進行中通話狀態
    "gamePlayingStatus",          # 在玩遊戲狀態
    "fitnessInfo",                # 健身資訊
    "holidayInfo",                # 節日資訊

    # 區塊8: 事件/記憶/數據
    "timeJump",                   # 偏移時間跳轉
    "importantEvents",            # 重要事件記錄本
    "summaries",                  # 對話歷史總結
    "gameScores",                 # 遊戲成績
    "gameEconomyState",           # 遊戲經濟狀態
    "affinityState",              # 好感度數值狀態
    "affinityUpdateRules",        # 好感度更新規則
    "foodLogs",                   # 飲食記錄
    "mediaLogs",                  # 書影記錄

    # 區塊9: 作者筆記
    "authorsNote",                # 作者筆記

    # 區塊10: 行為規則
    "thinkingGuide",              # 思考框架(預設)
    "humanLike",                  # 真實存在(預設)
    "caringPacing",               # 適度關心(不催飯不催睡)

    # 區塊11: 結尾
    "confirmLastOutput",          # 確認用戶最終輸出(必開)
    "custom_1772987632994",       # <think>(必開)
    "custom_1776008320741",       # 決定面對面提示詞(必開)
    "custom_1776010669277",       # 電話預約/行事曆/位置/食記(必開)
]

# === 建立 identifier → prompt 物件 的查找表 ===
prompt_map = {}
for p in target_data["prompts"]:
    prompt_map[p["identifier"]] = p

# === 按新順序重建 prompts 陣列 ===
new_prompts = []
for ident in new_order:
    if ident in prompt_map:
        new_prompts.append(prompt_map[ident])
    else:
        print(f"⚠️ 警告：identifier '{ident}' 在目標檔 prompts 中找不到！")

# 檢查是否有遺漏的 prompt（不在 new_order 中的）
found_idents = set(ident for ident in new_order if ident in prompt_map)
missing_idents = set(prompt_map.keys()) - found_idents
if missing_idents:
    print(f"⚠️ 警告：以下 identifier 不在排序清單中，將附加在最後：{missing_idents}")
    for ident in missing_idents:
        new_prompts.append(prompt_map[ident])

target_data["prompts"] = new_prompts

# === 同樣重建 prompt_order 陣列 ===
# 從原始 prompt_order 中取出每個 identifier 的 enabled 狀態
order_enabled_map = {}
for entry in target_data["prompt_order"][0]["order"]:
    order_enabled_map[entry["identifier"]] = entry.get("enabled", True)

new_prompt_order = []
for ident in new_order:
    if ident in order_enabled_map or ident in prompt_map:
        new_prompt_order.append({
            "identifier": ident,
            "enabled": order_enabled_map.get(ident, prompt_map.get(ident, {}).get("enabled", True))
        })

# 補上遺漏的
for ident in missing_idents:
    new_prompt_order.append({
        "identifier": ident,
        "enabled": order_enabled_map.get(ident, prompt_map.get(ident, {}).get("enabled", True))
    })

target_data["prompt_order"][0]["order"] = new_prompt_order

# === 統一 injection_order（全部設為 100，讓 SillyTavern 依陣列順序而非 injection_order 排序） ===
for ident in prompt_map:
    prompt_map[ident]["injection_order"] = 100

# === 寫回檔案 ===
with open(target_path, "w", encoding="utf-8") as f:
    json.dump(target_data, f, ensure_ascii=False, indent=2)

print("✅ 完成！已依照參考檔邏輯分組重新排列目標 JSON。")
print(f"   prompts 陣列: {len(new_prompts)} 個條目已重新排序。")
print(f"   prompt_order 陣列: {len(new_prompt_order)} 個條目已重新排序。")
print(f"   injection_order: 已全部統一設為 100（排序由陣列順序決定）。")

# === 印出新順序摘要 ===
print("\n📋 新排序摘要：")
for i, ident in enumerate(new_order):
    if ident in prompt_map:
        name = prompt_map[ident].get("name", "?")
        role = prompt_map[ident].get("role", "?")
        print(f"  {i+1:2d}. [{role:9s}] {name}")
if missing_idents:
    print(f"\n  ⚠️ 附加遺漏條目：{missing_idents}")
