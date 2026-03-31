# -*- coding: utf-8 -*-
"""
進一步分析 APK assets 目錄內容，特別是 database 和 datasource
"""
import zipfile
import struct
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

apk_path = 'APK/com.starcatzx.starcat.apk'

with zipfile.ZipFile(apk_path, 'r') as z:
    all_files = z.infolist()
    
    print('=== 完整 Assets 清單 ===')
    asset_files = [f for f in all_files if f.filename.startswith('assets/')]
    for af in sorted(asset_files, key=lambda x: x.filename):
        print(f'  {af.file_size/1024:8.1f} KB  {af.filename}')
    
    print()
    print('=== META-INF app-metadata.properties ===')
    try:
        meta = z.read('META-INF/com/android/build/gradle/app-metadata.properties').decode('utf-8')
        print(meta)
    except:
        print('  無法讀取')
    
    print()
    print('=== META-INF version-control-info.textproto ===')
    try:
        vci = z.read('META-INF/version-control-info.textproto').decode('utf-8', errors='replace')
        print(vci)
    except:
        print('  無法讀取')
    
    print()
    print('=== kotlin-tooling-metadata.json ===')
    try:
        kt_meta = z.read('kotlin-tooling-metadata.json').decode('utf-8')
        data = json.loads(kt_meta)
        print(json.dumps(data, indent=2, ensure_ascii=False))
    except:
        print('  無法讀取')

    print()
    print('=== TAROT/ORACLE/LENORMAND 牌組資料 ===')
    for fname in ['assets/datasource/tarot/deck/card/TAROT',
                  'assets/datasource/tarot/deck/card/LENORMAND', 
                  'assets/datasource/tarot/deck/card/ORACLE',
                  'assets/datasource/dice/skin/default/DICE']:
        try:
            content = z.read(fname)
            # 嘗試 UTF-8 解碼
            try:
                text = content.decode('utf-8')
                print(f'\n--- {fname} ---')
                print(text[:2000])
            except:
                print(f'\n--- {fname} (binary, {len(content)} bytes) ---')
                # 嘗試找出可讀字串
                readable = []
                i = 0
                while i < min(len(content), 500):
                    if 32 <= content[i] < 127:
                        j = i
                        while j < len(content) and 32 <= content[j] < 127:
                            j += 1
                        if j - i > 4:
                            readable.append(content[i:j].decode('ascii'))
                        i = j
                    else:
                        i += 1
                print('  可讀字串:', readable[:20])
        except Exception as e:
            print(f'  {fname}: 讀取失敗 - {e}')

    print()
    print('=== androidsupportmultidexversion.txt ===')
    try:
        txt = z.read('androidsupportmultidexversion.txt').decode('utf-8')
        print(txt)
    except:
        print('  無法讀取')

    print()
    print('=== 所有 .json 檔案內容 ===')
    json_files = [f for f in all_files if f.filename.endswith('.json')]
    for jf in json_files:
        try:
            content = z.read(jf.filename).decode('utf-8')
            print(f'\n--- {jf.filename} ---')
            print(content[:1000])
        except Exception as e:
            print(f'  {jf.filename}: {e}')

    print()
    print('=== lib/arm64-v8a 完整函式庫清單 ===')
    lib_files = [f for f in all_files if f.filename.startswith('lib/arm64-v8a/')]
    for lf in sorted(lib_files, key=lambda x: -x.file_size):
        print(f'  {lf.file_size/1024:8.1f} KB  {lf.filename.split("/")[-1]}')
