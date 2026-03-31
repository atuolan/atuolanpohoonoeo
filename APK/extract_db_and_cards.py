# -*- coding: utf-8 -*-
"""
1. 完整提取 TAROT/LENORMAND/ORACLE/DICE 牌義 JSON
2. 讀取 local.db SQLite 資料庫所有表格
3. 提取完整牌陣資料
"""
import zipfile
import sys
import json
import os
import sqlite3
import tempfile

sys.stdout.reconfigure(encoding='utf-8')

apk_path = 'APK/com.starcatzx.starcat.apk'
out_dir = 'APK/extracted'
os.makedirs(out_dir, exist_ok=True)

with zipfile.ZipFile(apk_path, 'r') as z:

    # ── 1. 完整牌義 JSON ──────────────────────────────────────────
    print('=' * 60)
    print('【1】完整牌義資料')

    for fname, asset_path in [
        ('TAROT',     'assets/datasource/tarot/deck/card/TAROT'),
        ('LENORMAND', 'assets/datasource/tarot/deck/card/LENORMAND'),
        ('ORACLE',    'assets/datasource/tarot/deck/card/ORACLE'),
        ('DICE',      'assets/datasource/dice/skin/default/DICE'),
    ]:
        raw = z.read(asset_path).decode('utf-8')
        data = json.loads(raw)
        out_path = os.path.join(out_dir, fname + '.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'\n--- {fname} ({len(data) if isinstance(data, list) else "object"} 筆) → {out_path} ---')

        if fname == 'DICE':
            # DICE 是物件結構
            if isinstance(data, dict):
                for key, items in data.items():
                    if isinstance(items, list):
                        print(f'  [{key}] {len(items)} 個項目')
                        for item in items[:3]:
                            print(f'    name={item.get("name","?")}  annotation={str(item.get("annotation",""))[:60]}...')
        else:
            # TAROT/LENORMAND/ORACLE 是陣列
            print(f'  共 {len(data)} 張牌，前 5 張:')
            for card in data[:5]:
                keys = list(card.keys())
                print(f'    {json.dumps(card, ensure_ascii=False)[:120]}')

    # ── 2. 完整牌陣 JSON ──────────────────────────────────────────
    print('\n' + '=' * 60)
    print('【2】完整牌陣資料')

    for sname, spath in [
        ('tarot_spreads.json',     'assets/tarot/spread/tarot/spreads.json'),
        ('lenormand_spreads.json', 'assets/tarot/spread/lenormand/spreads.json'),
    ]:
        raw = z.read(spath).decode('utf-8')
        data = json.loads(raw)
        out_path = os.path.join(out_dir, sname)
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'\n--- {sname} ({len(data)} 個牌陣) ---')
        for sp in data:
            print(f'  [{sp.get("id","?")}] {sp.get("name","?")} | {sp.get("card_num","?")}張 | {sp.get("type","?")}')
            print(f'       {sp.get("content","")[:80]}')

    # ── 3. SQLite local.db ────────────────────────────────────────
    print('\n' + '=' * 60)
    print('【3】local.db SQLite 資料庫')

    db_data = z.read('assets/database/local.db')
    tmp_db = os.path.join(out_dir, 'local.db')
    with open(tmp_db, 'wb') as f:
        f.write(db_data)

    conn = sqlite3.connect(tmp_db)
    cursor = conn.cursor()

    # 列出所有表格
    cursor.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name")
    tables = cursor.fetchall()
    print(f'\n資料庫共 {len(tables)} 個表格/視圖:')
    for t in tables:
        cursor.execute(f'SELECT COUNT(*) FROM "{t[0]}"')
        count = cursor.fetchone()[0]
        cursor.execute(f'PRAGMA table_info("{t[0]}")')
        cols = [c[1] for c in cursor.fetchall()]
        print(f'  [{t[1]}] {t[0]}  ({count} 筆)  欄位: {", ".join(cols)}')

    # 讀取每個表格前幾筆
    print()
    for t in tables:
        tname = t[0]
        cursor.execute(f'SELECT COUNT(*) FROM "{tname}"')
        count = cursor.fetchone()[0]
        if count == 0:
            continue
        cursor.execute(f'PRAGMA table_info("{tname}")')
        cols = [c[1] for c in cursor.fetchall()]
        cursor.execute(f'SELECT * FROM "{tname}" LIMIT 5')
        rows = cursor.fetchall()
        print(f'\n=== 表格: {tname} ({count} 筆) ===')
        print(f'欄位: {cols}')
        for row in rows:
            # 截斷長字串
            display = []
            for v in row:
                s = str(v)
                display.append(s[:100] if len(s) > 100 else s)
            print(f'  {display}')

        # 儲存完整表格為 JSON
        cursor.execute(f'SELECT * FROM "{tname}"')
        all_rows = cursor.fetchall()
        tbl_data = [dict(zip(cols, row)) for row in all_rows]
        out_path = os.path.join(out_dir, f'db_{tname}.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(tbl_data, f, ensure_ascii=False, indent=2)
        print(f'  → 已儲存至 {out_path}')

    conn.close()

print('\n' + '=' * 60)
print('所有資料已儲存至 APK/extracted/ 目錄')
