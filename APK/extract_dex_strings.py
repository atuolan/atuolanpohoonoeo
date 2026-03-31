# -*- coding: utf-8 -*-
"""
從 DEX 檔案提取字串，搜尋牌義相關內容與選牌邏輯
"""
import zipfile
import sys
import os
import re

sys.stdout.reconfigure(encoding='utf-8')

apk_path = 'APK/com.starcatzx.starcat.apk'
out_dir = 'APK/extracted'
os.makedirs(out_dir, exist_ok=True)

def extract_strings_from_dex(dex_data):
    """從 DEX 二進位資料提取所有字串"""
    # DEX 字串池格式解析
    magic = dex_data[:8]
    if not magic.startswith(b'dex\n'):
        return []
    
    import struct
    # string_ids_size at offset 56, string_ids_off at offset 60
    string_ids_size = struct.unpack_from('<I', dex_data, 56)[0]
    string_ids_off  = struct.unpack_from('<I', dex_data, 60)[0]
    
    strings = []
    for i in range(string_ids_size):
        str_off = struct.unpack_from('<I', dex_data, string_ids_off + i * 4)[0]
        # ULEB128 encoded length
        pos = str_off
        length = 0
        shift = 0
        while True:
            b = dex_data[pos]
            pos += 1
            length |= (b & 0x7F) << shift
            if not (b & 0x80):
                break
            shift += 7
        # Read MUTF-8 string
        try:
            s = dex_data[pos:pos+length].decode('utf-8', errors='replace')
            strings.append(s)
        except:
            pass
    return strings

with zipfile.ZipFile(apk_path, 'r') as z:
    # 提取所有 DEX 檔案的字串
    all_strings = []
    for dex_name in ['classes.dex', 'classes2.dex', 'classes3.dex']:
        print(f'正在解析 {dex_name}...')
        dex_data = z.read(dex_name)
        strings = extract_strings_from_dex(dex_data)
        print(f'  提取到 {len(strings)} 個字串')
        all_strings.extend(strings)
    
    print(f'\n總計 {len(all_strings)} 個字串')
    
    # ── 搜尋牌義相關內容 ──────────────────────────────────────────
    print('\n' + '='*60)
    print('【搜尋塔羅牌義相關字串】')
    
    # 正位/逆位牌義關鍵字
    tarot_keywords = ['正位', '逆位', '大阿卡纳', '小阿卡纳', '权杖', '圣杯', '宝剑', '钱币',
                      'upright', 'reversed', 'MajorArcana', 'MinorArcana',
                      'Wands', 'Cups', 'Swords', 'Pentacles',
                      '牌义', '关键词', 'keyword', 'meaning']
    
    for kw in tarot_keywords:
        matches = [s for s in all_strings if kw in s and len(s) > 10]
        if matches:
            print(f'\n關鍵字 "{kw}": {len(matches)} 個')
            for m in matches[:5]:
                print(f'  {m[:150]}')
    
    # ── 搜尋選牌邏輯 ──────────────────────────────────────────────
    print('\n' + '='*60)
    print('【搜尋選牌/洗牌邏輯相關字串】')
    
    shuffle_keywords = ['shuffle', 'Shuffle', 'random', 'Random', 'drawCard', 'pickCard',
                        'selectCard', 'cardIndex', 'randomInt', 'nextInt',
                        'Collections.shuffle', 'Math.random', 'SecureRandom',
                        '洗牌', '抽牌', '随机']
    
    for kw in shuffle_keywords:
        matches = [s for s in all_strings if kw in s and len(s) > 5]
        if matches:
            print(f'\n關鍵字 "{kw}": {len(matches)} 個')
            for m in matches[:5]:
                print(f'  {m[:150]}')
    
    # ── 搜尋 API 端點 ──────────────────────────────────────────────
    print('\n' + '='*60)
    print('【API 端點 URL 搜尋】')
    
    urls = [s for s in all_strings if ('http' in s or 'https' in s or 'api' in s.lower()) 
            and len(s) > 15 and len(s) < 300]
    url_unique = sorted(set(urls))
    print(f'找到 {len(url_unique)} 個 URL/API 相關字串:')
    for u in url_unique[:50]:
        print(f'  {u}')
    
    # ── 搜尋牌義相關類別名稱 ──────────────────────────────────────
    print('\n' + '='*60)
    print('【塔羅相關類別/方法名稱】')
    
    class_keywords = ['tarot', 'Tarot', 'card', 'Card', 'spread', 'Spread', 
                      'dice', 'Dice', 'lenormand', 'Lenormand', 'oracle', 'Oracle',
                      'divination', 'fortune']
    
    class_names = [s for s in all_strings if any(kw in s for kw in class_keywords)
                   and ('.' in s or '/' in s) and len(s) > 10 and len(s) < 100]
    
    seen = set()
    print(f'找到塔羅相關類別/路徑字串:')
    for c in sorted(class_names):
        if c not in seen:
            seen.add(c)
            print(f'  {c}')
    
    # ── 儲存所有字串到檔案 ────────────────────────────────────────
    out_path = os.path.join(out_dir, 'dex_strings_all.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        for s in all_strings:
            if s.strip():
                f.write(s + '\n')
    print(f'\n所有字串已儲存至 {out_path} ({len(all_strings)} 行)')
    
    # 搜尋牌義內容（長文字串）
    long_strings = [s for s in all_strings if len(s) > 50 and 
                    any(c >= '\u4e00' and c <= '\u9fff' for c in s)]
    out_path2 = os.path.join(out_dir, 'dex_chinese_strings.txt')
    with open(out_path2, 'w', encoding='utf-8') as f:
        for s in sorted(set(long_strings)):
            f.write(s + '\n')
    print(f'中文長字串已儲存至 {out_path2} ({len(long_strings)} 個)')
