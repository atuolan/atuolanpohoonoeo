# -*- coding: utf-8 -*-
"""
提取 APK 中的牌義資料庫與牌陣資料
"""
import zipfile
import struct
import sys
import json
import os

sys.stdout.reconfigure(encoding='utf-8')

apk_path = 'APK/com.starcatzx.starcat.apk'
out_dir = 'APK/extracted'
os.makedirs(out_dir, exist_ok=True)

def try_decode(data):
    """嘗試多種編碼解析二進位資料"""
    for enc in ['utf-8', 'utf-16-le', 'gbk', 'gb2312']:
        try:
            return data.decode(enc)
        except:
            pass
    return None

def analyze_binary(data, name):
    """分析二進位檔案格式"""
    print(f'\n{"="*60}')
    print(f'檔案: {name}  ({len(data)} bytes)')
    print(f'前 32 bytes (hex): {data[:32].hex()}')
    print(f'前 32 bytes (ascii): {repr(data[:32])}')
    
    # 嘗試直接 UTF-8
    text = try_decode(data)
    if text:
        print(f'可直接解碼為文字！前 500 字元:')
        print(text[:500])
        return text
    
    # 嘗試 zlib 解壓
    import zlib
    try:
        decompressed = zlib.decompress(data)
        print(f'zlib 解壓成功！解壓後 {len(decompressed)} bytes')
        text = try_decode(decompressed)
        if text:
            print(f'解壓後文字前 500 字元:')
            print(text[:500])
            return text
    except:
        pass
    
    # 嘗試跳過 header 後解壓
    for skip in [4, 8, 12, 16, 20]:
        try:
            decompressed = zlib.decompress(data[skip:])
            print(f'跳過 {skip} bytes 後 zlib 解壓成功！解壓後 {len(decompressed)} bytes')
            text = try_decode(decompressed)
            if text:
                print(text[:500])
                return text
        except:
            pass
    
    # 嘗試 gzip
    import gzip
    try:
        decompressed = gzip.decompress(data)
        print(f'gzip 解壓成功！解壓後 {len(decompressed)} bytes')
        text = try_decode(decompressed)
        if text:
            print(text[:500])
            return text
    except:
        pass
    
    # 搜尋可讀字串
    print('嘗試提取可讀字串...')
    readable = []
    i = 0
    while i < len(data):
        if data[i] >= 0x20 and data[i] < 0x7f:
            j = i
            while j < len(data) and data[j] >= 0x20 and data[j] < 0x7f:
                j += 1
            if j - i >= 6:
                readable.append(data[i:j].decode('ascii'))
            i = j
        else:
            i += 1
    print(f'找到 {len(readable)} 個可讀字串（前 30 個）:')
    for s in readable[:30]:
        print(f'  {s}')
    
    # 嘗試找 UTF-16 字串
    print('嘗試提取 UTF-16LE 字串...')
    utf16_strings = []
    i = 0
    while i < len(data) - 2:
        # 找連續可見 UTF-16LE 字元
        if data[i] >= 0x20 and data[i] < 0x7f and data[i+1] == 0x00:
            j = i
            while j < len(data) - 1 and data[j] >= 0x20 and data[j] < 0x7f and data[j+1] == 0x00:
                j += 2
            if j - i >= 8:
                try:
                    s = data[i:j].decode('utf-16-le')
                    utf16_strings.append(s)
                except:
                    pass
            i = j
        else:
            i += 1
    if utf16_strings:
        print(f'找到 {len(utf16_strings)} 個 UTF-16LE 字串（前 20 個）:')
        for s in utf16_strings[:20]:
            print(f'  {s}')
    
    return None

with zipfile.ZipFile(apk_path, 'r') as z:
    # 1. 提取牌義資料
    card_files = [
        'assets/datasource/tarot/deck/card/TAROT',
        'assets/datasource/tarot/deck/card/LENORMAND',
        'assets/datasource/tarot/deck/card/ORACLE',
        'assets/datasource/dice/skin/default/DICE',
    ]
    
    for cf in card_files:
        data = z.read(cf)
        fname = cf.split('/')[-1]
        text = analyze_binary(data, cf)
        if text:
            out_path = os.path.join(out_dir, fname + '.txt')
            with open(out_path, 'w', encoding='utf-8') as f:
                f.write(text)
            print(f'已儲存到 {out_path}')
        # 無論如何都儲存原始二進位
        with open(os.path.join(out_dir, fname + '.bin'), 'wb') as f:
            f.write(data)
    
    # 2. 提取牌陣 JSON
    spread_files = [
        'assets/tarot/spread/lenormand/spreads.json',
        'assets/tarot/spread/tarot/spreads.json',
    ]
    
    print('\n' + '='*60)
    print('=== 完整牌陣 JSON ===')
    for sf in spread_files:
        try:
            content = z.read(sf).decode('utf-8')
            data = json.loads(content)
            fname = sf.replace('/', '_').replace('assets_', '')
            out_path = os.path.join(out_dir, fname)
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f'\n--- {sf} ({len(data)} 個牌陣) ---')
            for spread in data:
                print(f'  ID:{spread.get("id","?")} 名稱:{spread.get("name","?")} 張數:{spread.get("card_num","?")} 類型:{spread.get("type","?")}')
        except Exception as e:
            print(f'{sf}: 讀取失敗 {e}')
    
    # 3. 查看 local.db 開頭（確認是否 SQLite 或 SQLCipher）
    print('\n' + '='*60)
    print('=== assets/database/local.db 格式分析 ===')
    db_data = z.read('assets/database/local.db')
    print(f'前 16 bytes: {db_data[:16].hex()}')
    print(f'前 16 bytes ascii: {repr(db_data[:16])}')
    if db_data[:6] == b'SQLite':
        print('這是標準 SQLite 資料庫！')
    else:
        print('非標準 SQLite（可能是 SQLCipher 加密）')
