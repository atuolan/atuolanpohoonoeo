# -*- coding: utf-8 -*-
"""
深入分析選牌邏輯：
1. 提取完整的 user_tarot_preferences SQL 結構
2. 搜尋 drawCard / shuffle / spread 相關類別
3. 搜尋牌陣位置 (position) 資料
4. 搜尋 API 域名與完整端點
"""
import zipfile
import sys
import os
import struct
import re

sys.stdout.reconfigure(encoding='utf-8')

apk_path = 'APK/com.starcatzx.starcat.apk'
out_dir = 'APK/extracted'

def extract_strings_from_dex(dex_data):
    magic = dex_data[:8]
    if not magic.startswith(b'dex\n'):
        return []
    string_ids_size = struct.unpack_from('<I', dex_data, 56)[0]
    string_ids_off  = struct.unpack_from('<I', dex_data, 60)[0]
    strings = []
    for i in range(string_ids_size):
        str_off = struct.unpack_from('<I', dex_data, string_ids_off + i * 4)[0]
        pos = str_off
        length = 0
        shift = 0
        while True:
            b = dex_data[pos]; pos += 1
            length |= (b & 0x7F) << shift
            if not (b & 0x80): break
            shift += 7
        try:
            strings.append(dex_data[pos:pos+length].decode('utf-8', errors='replace'))
        except:
            pass
    return strings

with zipfile.ZipFile(apk_path, 'r') as z:
    all_strings = []
    for dex_name in ['classes.dex', 'classes2.dex', 'classes3.dex']:
        dex_data = z.read(dex_name)
        all_strings.extend(extract_strings_from_dex(dex_data))

print(f'共 {len(all_strings)} 個字串\n')

# ── 1. 完整 SQL 建表語句 ───────────────────────────────────────
print('=' * 70)
print('【1】完整 SQL CREATE TABLE 語句')
sql_stmts = [s for s in all_strings if s.strip().upper().startswith('CREATE TABLE')]
seen_sql = set()
for sql in sql_stmts:
    if sql not in seen_sql:
        seen_sql.add(sql)
        print(f'\n{sql}')

# ── 2. 使用者偏好設定欄位 ──────────────────────────────────────
print('\n' + '=' * 70)
print('【2】user_tarot_preferences 欄位詳情')
pref_sqls = [s for s in all_strings if 'user_tarot_preferences' in s and 'CREATE' in s]
seen = set()
for s in pref_sqls:
    if s not in seen:
        seen.add(s)
        print(s)

# ── 3. 塔羅相關類別完整路徑 ────────────────────────────────────
print('\n' + '=' * 70)
print('【3】塔羅/骰子相關類別（完整路徑）')
tarot_classes = [s for s in all_strings 
                 if ('tarot' in s.lower() or 'dice' in s.lower() or 'spread' in s.lower())
                 and s.startswith('L') and s.endswith(';') and '/' in s]
seen = set()
for c in sorted(tarot_classes):
    if c not in seen:
        seen.add(c)
        print(f'  {c}')

# ── 4. drawCard / shuffle 相關方法 ────────────────────────────
print('\n' + '=' * 70)
print('【4】選牌/洗牌相關方法字串')
method_kws = ['drawCard', 'drawCards', 'shuffleCard', 'pickCard', 'selectCard',
              'ShakeShuffleEnabled', 'reversedEnabled', 'onlyUseMajorArcana',
              'isNeedShuffle', 'PreDrawCard', 'FanStyle', 'FanPosition',
              'spreadPosition', 'SpreadPosition', 'cardPosition',
              'tarot_random', 'lenormand_random', 'dice_random', 'oracle_random']
seen = set()
for kw in method_kws:
    matches = [s for s in all_strings if kw in s and s not in seen]
    for m in matches:
        seen.add(m)
        print(f'  [{kw}] {m[:200]}')

# ── 5. 完整 API 域名和路徑 ─────────────────────────────────────
print('\n' + '=' * 70)
print('【5】API 域名與路徑')
api_patterns = [s for s in all_strings 
                if ('starcatzx' in s or 'starcat' in s.lower()) 
                and ('http' in s or 'index.php' in s or 'api' in s.lower())]
seen = set()
for a in sorted(api_patterns):
    if a not in seen:
        seen.add(a)
        print(f'  {a}')

# ── 6. 牌陣位置資料 ────────────────────────────────────────────
print('\n' + '=' * 70)
print('【6】牌陣位置相關字串')
pos_kws = ['position', 'Position', 'spread', 'Spread', 'layout', 'Layout',
           'cardNum', 'card_num', 'spreadId', 'spread_id']
seen = set()
for kw in pos_kws:
    matches = [s for s in all_strings if kw in s and len(s) > 8 and len(s) < 200 and s not in seen]
    for m in matches[:8]:
        seen.add(m)
        print(f'  [{kw}] {m}')

# ── 7. defaultSpreads.json 搜尋 ───────────────────────────────
print('\n' + '=' * 70)
print('【7】defaultSpreads.json 相關字串')
ds = [s for s in all_strings if 'defaultSpread' in s or 'default_spread' in s.lower()]
for s in ds:
    print(f'  {s}')

# ── 8. 牌義 API 端點 ──────────────────────────────────────────
print('\n' + '=' * 70)
print('【8】所有 index.php 路徑（API 端點）')
php_paths = [s for s in all_strings if 'index.php' in s]
seen = set()
for p in sorted(php_paths):
    if p not in seen:
        seen.add(p)
        print(f'  {p}')

# ── 9. 伺服器域名 ─────────────────────────────────────────────
print('\n' + '=' * 70)
print('【9】完整 HTTP/HTTPS URL')
urls = [s for s in all_strings 
        if re.match(r'https?://', s) and len(s) > 10 and len(s) < 200
        and not s.startswith('https://schemas')
        and not s.startswith('http://schemas')]
seen = set()
for u in sorted(set(urls)):
    if u not in seen:
        seen.add(u)
        print(f'  {u}')
