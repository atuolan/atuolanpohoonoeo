# -*- coding: utf-8 -*-
"""
解析 APK 的 AndroidManifest.xml (Binary XML / AXML 格式)
不依賴外部套件，純手動解析 AXML
"""
import zipfile
import struct
import sys

sys.stdout.reconfigure(encoding='utf-8')

apk_path = 'APK/com.starcatzx.starcat.apk'

# AXML 解析器
class AXMLParser:
    START_DOCUMENT = 0x00100100
    END_DOCUMENT   = 0x00100101
    START_TAG      = 0x00100102
    END_TAG        = 0x00100103
    TEXT           = 0x00100104

    def __init__(self, data):
        self.data = data
        self.pos = 0
        self.strings = []
        self._parse_header()

    def _read(self, fmt):
        size = struct.calcsize(fmt)
        result = struct.unpack_from(fmt, self.data, self.pos)
        self.pos += size
        return result

    def _parse_header(self):
        # Magic + fileSize
        magic, file_size = self._read('<II')
        # String pool chunk
        str_chunk_type, str_chunk_size = self._read('<II')
        str_count, style_count, _, str_start, style_start = self._read('<IIIII')
        
        # String offsets
        offsets = [self._read('<I')[0] for _ in range(str_count)]
        
        # Style offsets
        for _ in range(style_count):
            self._read('<I')
        
        # Strings start position (relative to string pool chunk start = pos 8)
        str_pool_start = 8 + 28 + str_count * 4 + style_count * 4
        
        self.strings = []
        for i, off in enumerate(offsets):
            abs_pos = 8 + str_start + off  # 8 = fileSize field offset
            length = struct.unpack_from('<H', self.data, abs_pos)[0]
            s = self.data[abs_pos+2: abs_pos+2+length*2].decode('utf-16-le', errors='replace')
            self.strings.append(s)
        
        # Skip to end of string pool
        self.pos = 8 + str_chunk_size
        
        # Skip resource map chunk if present
        chunk_type = struct.unpack_from('<I', self.data, self.pos)[0]
        if chunk_type == 0x00080180:  # RES_XML_RESOURCE_MAP_TYPE
            chunk_size = struct.unpack_from('<I', self.data, self.pos + 4)[0]
            self.pos += chunk_size

    def get_string(self, idx):
        if 0 <= idx < len(self.strings):
            return self.strings[idx]
        return ''

    def parse(self):
        events = []
        while self.pos < len(self.data) - 4:
            chunk_type = struct.unpack_from('<I', self.data, self.pos)[0]
            if chunk_type == self.START_TAG:
                self.pos += 4  # type
                chunk_size = self._read('<I')[0]
                line_num, comment, ns_idx, name_idx = self._read('<IiII')
                attr_start, attr_size, attr_count, id_idx, class_idx, style_idx = self._read('<HHHHHH')
                
                name = self.get_string(name_idx)
                ns = self.get_string(ns_idx) if ns_idx != 0xFFFFFFFF else ''
                
                attrs = {}
                for _ in range(attr_count):
                    a_ns, a_name, a_raw, a_type_size, a_type, a_data = self._read('<IIIHbxI')
                    attr_name = self.get_string(a_name)
                    if a_raw != 0xFFFFFFFF:
                        attr_val = self.get_string(a_raw)
                    elif a_type == 0x03:
                        attr_val = self.get_string(a_data)
                    elif a_type == 0x12:
                        attr_val = str(bool(a_data))
                    elif a_type == 0x10:
                        attr_val = str(a_data)
                    elif a_type == 0x01:
                        attr_val = f'@ref/0x{a_data:08x}'
                    else:
                        attr_val = f'0x{a_data:08x}'
                    attrs[attr_name] = attr_val
                
                events.append(('start', name, attrs, line_num))
            
            elif chunk_type == self.END_TAG:
                self.pos += 4
                chunk_size = self._read('<I')[0]
                line_num, comment, ns_idx, name_idx = self._read('<IiII')
                name = self.get_string(name_idx)
                events.append(('end', name, {}, line_num))
            
            elif chunk_type == self.END_DOCUMENT:
                break
            
            else:
                # Skip unknown chunk
                self.pos += 4
                if self.pos + 4 > len(self.data):
                    break
                chunk_size = struct.unpack_from('<I', self.data, self.pos)[0]
                self.pos += chunk_size - 4  # already read 4 bytes for chunk_size... wait
                # Actually just advance by 4 more to skip this unknown chunk header
                # We'll do a safer approach
                break
        
        return events


def parse_manifest_safe(data):
    """簡化版 AXML 解析，只提取關鍵字串"""
    try:
        parser = AXMLParser(data)
        events = parser.parse()
        return parser, events
    except Exception as e:
        return None, []


def extract_strings_from_axml(data):
    """直接從 AXML 二進位資料提取字串池"""
    try:
        # Check magic
        magic = struct.unpack_from('<I', data, 0)[0]
        if magic != 0x00080003:
            return []
        
        file_size = struct.unpack_from('<I', data, 4)[0]
        # String pool chunk at offset 8
        sp_type = struct.unpack_from('<I', data, 8)[0]
        sp_size = struct.unpack_from('<I', data, 12)[0]
        str_count = struct.unpack_from('<I', data, 16)[0]
        style_count = struct.unpack_from('<I', data, 20)[0]
        flags = struct.unpack_from('<I', data, 24)[0]
        str_start = struct.unpack_from('<I', data, 28)[0]
        style_start = struct.unpack_from('<I', data, 32)[0]
        
        is_utf8 = bool(flags & (1 << 8))
        
        strings = []
        offset_base = 36  # After header (8 type+size + 28 string pool header)
        
        for i in range(str_count):
            off = struct.unpack_from('<I', data, offset_base + i * 4)[0]
            str_abs = 8 + str_start + off
            
            if str_abs >= len(data):
                continue
            
            if is_utf8:
                # UTF-8: length in utf16 chars (1 byte), then length in bytes (1 byte), then string
                u16_len = data[str_abs]
                if u16_len & 0x80:
                    u16_len = ((u16_len & 0x7F) << 8) | data[str_abs + 1]
                    str_abs += 2
                else:
                    str_abs += 1
                byte_len = data[str_abs]
                if byte_len & 0x80:
                    byte_len = ((byte_len & 0x7F) << 8) | data[str_abs + 1]
                    str_abs += 2
                else:
                    str_abs += 1
                s = data[str_abs: str_abs + byte_len].decode('utf-8', errors='replace')
            else:
                # UTF-16LE
                char_len = struct.unpack_from('<H', data, str_abs)[0]
                if char_len & 0x8000:
                    char_len = ((char_len & 0x7FFF) << 16) | struct.unpack_from('<H', data, str_abs + 2)[0]
                    str_abs += 4
                else:
                    str_abs += 2
                s = data[str_abs: str_abs + char_len * 2].decode('utf-16-le', errors='replace')
            
            strings.append(s)
        
        return strings
    except Exception as e:
        print(f'  字串提取錯誤: {e}')
        return []


# 主程式
with zipfile.ZipFile(apk_path, 'r') as z:
    manifest_data = z.read('AndroidManifest.xml')

print(f'AndroidManifest.xml 大小: {len(manifest_data)} bytes')
print(f'Magic: 0x{struct.unpack_from("<I", manifest_data, 0)[0]:08x}')
print()

strings = extract_strings_from_axml(manifest_data)
print(f'字串池共 {len(strings)} 個字串')
print()

# 找出關鍵資訊
package_related = [s for s in strings if '.' in s and len(s) > 5 and not s.startswith('http') and '/' not in s]
activities = [s for s in strings if 'Activity' in s or 'activity' in s]
services = [s for s in strings if 'Service' in s and len(s) > 7]
permissions = [s for s in strings if 'permission' in s.lower() or 'PERMISSION' in s]
receivers = [s for s in strings if 'Receiver' in s or 'receiver' in s]
providers = [s for s in strings if 'Provider' in s and len(s) > 8 and 'ContentProvider' not in s]

print('=== 套件名稱相關字串 ===')
for s in sorted(set(package_related))[:20]:
    print(f'  {s}')

print()
print('=== Activity 類別 ===')
for s in sorted(set(activities))[:30]:
    print(f'  {s}')

print()
print('=== Service 類別 ===')
for s in sorted(set(services))[:20]:
    print(f'  {s}')

print()
print('=== 權限宣告 ===')
for s in sorted(set(permissions))[:30]:
    print(f'  {s}')

print()
print('=== 完整字串池（前100個）===')
for i, s in enumerate(strings[:100]):
    if s.strip():
        print(f'  [{i:3d}] {s}')
