# -*- coding: utf-8 -*-
import zipfile
import os
import sys

# 強制使用 UTF-8 輸出
sys.stdout.reconfigure(encoding='utf-8')

apk_path = 'APK/com.starcatzx.starcat.apk'

try:
    size = os.path.getsize(apk_path)
    print(f'APK 檔案大小: {size / 1024 / 1024:.2f} MB')
    print()

    with zipfile.ZipFile(apk_path, 'r') as z:
        files = z.infolist()
        print(f'總檔案數: {len(files)}')
        print()

        # 統計各類型
        categories = {}
        for f in files:
            ext = os.path.splitext(f.filename)[1].lower()
            if not ext:
                ext = '(無副檔名)'
            categories[ext] = categories.get(ext, 0) + 1

        print('=== 檔案類型統計 ===')
        for ext, count in sorted(categories.items(), key=lambda x: -x[1]):
            print(f'  {ext}: {count} 個')

        print()
        print('=== 頂層目錄結構 ===')
        top_dirs = set()
        top_files = []
        for f in files:
            parts = f.filename.split('/')
            if len(parts) == 1:
                top_files.append(f.filename)
            else:
                top_dirs.add(parts[0])
        for d in sorted(top_dirs):
            count = sum(1 for f in files if f.filename.startswith(d + '/'))
            print(f'  [DIR] {d}/  ({count} 個檔案)')
        for f in sorted(top_files):
            print(f'  [FILE] {f}')

        print()
        print('=== DEX 檔案 ===')
        dex_files = [f for f in files if f.filename.endswith('.dex')]
        for d in dex_files:
            print(f'  {d.filename}  ({d.file_size / 1024:.1f} KB)')

        print()
        print('=== 原生函式庫 (lib/) ===')
        lib_files = [f for f in files if f.filename.startswith('lib/')]
        if lib_files:
            arches = set()
            for f in lib_files:
                parts = f.filename.split('/')
                if len(parts) >= 2:
                    arches.add(parts[1])
            for arch in sorted(arches):
                arch_files = [f for f in lib_files if f.filename.startswith(f'lib/{arch}/')]
                print(f'  [{arch}] {len(arch_files)} 個 .so 檔案')
                for af in arch_files[:5]:
                    print(f'    - {af.filename.split("/")[-1]}  ({af.file_size / 1024:.1f} KB)')
                if len(arch_files) > 5:
                    print(f'    ... 還有 {len(arch_files) - 5} 個')
        else:
            print('  無原生函式庫')

        print()
        print('=== Assets 目錄 ===')
        asset_files = [f for f in files if f.filename.startswith('assets/')]
        if asset_files:
            print(f'  共 {len(asset_files)} 個檔案')
            for af in asset_files[:30]:
                print(f'  - {af.filename}  ({af.file_size / 1024:.1f} KB)')
            if len(asset_files) > 30:
                print(f'  ... 還有 {len(asset_files) - 30} 個')
        else:
            print('  無 assets 目錄')

        print()
        print('=== META-INF 簽章資訊 ===')
        meta_files = [f for f in files if f.filename.startswith('META-INF/')]
        for mf in meta_files:
            print(f'  {mf.filename}')

        print()
        print('=== 最大檔案 TOP 10 ===')
        sorted_files = sorted(files, key=lambda x: x.file_size, reverse=True)
        for f in sorted_files[:10]:
            print(f'  {f.file_size / 1024:.1f} KB  {f.filename}')

except Exception as e:
    print(f'錯誤: {e}')
    import traceback
    traceback.print_exc()
