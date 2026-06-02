import json
from pathlib import Path

path = Path('提示詞.txt')
data = json.loads(path.read_text(encoding='utf-8'))

needle = '使用者 這輪<lastUserMessage>內說了什麼？\n「分析當前狀態：」'
replacement = '''使用者 這輪<lastUserMessage>內說了什麼？先逐字列出本輪實際內容，不得增加未出現的句子。

<message_integrity>
⚠️ 使用者訊息完整性規則：
- 只能根據 <lastUserMessage> 內實際出現的文字、圖片、語音內容進行分析與回覆。
- 嚴禁補寫、腦補、改寫或新增 使用者 沒有發出的第二句話、第二條語音、隱藏台詞。
- 如果 <lastUserMessage> 只有一句「你有病吧」，就只能視為 使用者 說了「你有病吧」，不得推斷成「你有病吧」與「對我有病」兩條訊息。
- 分析區必須先逐字核對 使用者 本輪實際輸入；任何不在本輪輸入中的內容，一律視為不存在。
</message_integrity>

「分析當前狀態：」'''

updated = False
for item in data:
    content = item.get('content', '')
    if item.get('role') == 'system' and needle in content and '<message_integrity>' not in content:
        item['content'] = content.replace(needle, replacement, 1)
        updated = True
        break

if not updated:
    raise SystemExit('target prompt block not found or already updated')

path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print('updated')
