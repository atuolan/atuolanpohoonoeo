"""三個新房間（客廳、廚房、浴室）：牆、地板、小東西借用臥室的圖，傢俱用程式畫。130×282 格。"""
import numpy as np
from PIL import Image

W, H = 130, 282
BED = np.asarray(Image.open("../rooms/bedroom-nochar.png").convert("RGB")).astype(float)


def hx(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


O = hx("#5A3A2A")        # 外框
WL, WM, WD = hx("#DEA579"), hx("#C2855D"), hx("#8F5B3D")  # 木頭亮、中、暗
CREAM, WHITE = hx("#F6E8D2"), hx("#FBF7EE")
GREEN, GREEND = hx("#8AA06E"), hx("#60784E")


class Room:
    def __init__(self, upper_tint=None, tint_k=0.0):
        a = np.zeros((H, W, 3))
        # 上半牆：臥室第 10 排的直紋
        a[:128] = BED[10]
        if upper_tint is not None:
            a[:128] = a[:128] * (1 - tint_k) + hx(upper_tint) * tint_k
        # 護牆板
        a[127] = hx("#9A6546")
        a[128] = hx("#E0B796")
        for y in range(129, 151):
            a[y] = hx("#CE9B77")
            a[y, ::7] = hx("#BC8763")
        # 踢腳板
        a[151] = hx("#6A452F")
        a[152:156] = hx("#C2855D")
        a[156] = hx("#CA8C62")
        a[157] = hx("#8F5B3D")
        # 地板：臥室中間那段乾淨的地板，12 排一循環
        tile = BED[164:176]
        for y in range(158, H):
            a[y] = tile[(y - 158) % 12]
        self.a = a

    def rect(self, x, y, w, h, c):
        self.a[max(0, y):y + h, max(0, x):x + w] = c

    def px(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.a[y, x] = c

    def box(self, x, y, w, h, fill, light=None, shade=None, o=O):
        self.rect(x, y, w, h, o)
        self.rect(x + 1, y + 1, w - 2, h - 2, fill)
        if light is not None:
            self.rect(x + 1, y + 1, w - 2, 1, light)
            self.rect(x + 1, y + 1, 1, h - 2, light)
        if shade is not None:
            self.rect(x + 1, y + h - 2, w - 2, 1, shade)
            self.rect(x + w - 2, y + 1, 1, h - 2, shade)

    def copy(self, x0, y0, x1, y1, dx, dy, skip_wall=True):
        """把臥室的一塊貼過來；跟臥室牆一樣顏色的像素不貼（等於去背）"""
        for y in range(y0, y1):
            for x in range(x0, x1):
                c = BED[y, x]
                if skip_wall and (np.abs(c - BED[10, x]).sum() < 18 or np.abs(c - BED[y, 0 if x > 2 else 3]).sum() < 6 and y < 127):
                    continue
                self.px(dx + x - x0, dy + y - y0, c)

    def shadow(self, x, y, w, k=0.82):
        self.a[y:y + 2, x:x + w] *= k

    def plant(self, x, bottom, h=16):
        # 地上的大盆栽：橢圓形的葉子團，外圈深綠
        self.box(x + 2, bottom - 8, 10, 8, hx("#C46E4E"), hx("#DA8A68"), hx("#9E5238"))
        cx, cy, rx, ry = x + 7, bottom - 8 - h // 2, 6, h // 2
        rng = np.random.default_rng(x)
        for yy in range(cy - ry - 1, cy + ry + 2):
            for xx in range(cx - rx - 1, cx + rx + 2):
                d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
                if d <= 1:
                    c = GREEN if rng.random() > 0.3 else GREEND
                    if xx < cx and yy < cy and rng.random() > 0.5:
                        c = hx("#A7BD86")
                    self.px(xx, yy, c)
                elif d <= 1.45 and rng.random() > 0.35:
                    self.px(xx, yy, hx("#4E6340"))

    def save(self, name):
        img = Image.fromarray(np.clip(self.a, 0, 255).astype(np.uint8), "RGB")
        img.save(f"out/{name}.png")
        img.resize((W * 3, H * 3), Image.NEAREST).save(f"out/{name}@3x.png")


# ================= 客廳 =================
def living():
    r = Room("#E4EBD2", 0.35)
    r.copy(0, 21, 130, 32, 0, 21)            # 燈串
    r.copy(40, 33, 92, 92, 10, 36)           # 窗戶（含窗簾）
    r.copy(100, 40, 120, 62, 104, 40)        # 時鐘
    r.copy(98, 84, 130, 158, 98, 84, skip_wall=False)  # 大門
    # 電視櫃 + 電視
    r.shadow(66, 152, 48)
    r.box(64, 134, 34, 19, WM, WL, WD)
    r.rect(80, 136, 1, 15, O)
    r.rect(72, 143, 4, 1, O); r.rect(86, 143, 4, 1, O)
    r.box(66, 111, 30, 21, hx("#3B2F2C"), hx("#4C3F3B"))
    r.rect(68, 113, 26, 17, hx("#56626B"))
    r.rect(69, 114, 7, 1, hx("#8EA2AE"))
    r.rect(78, 132, 6, 2, O)
    r.box(69, 128 + 9, 8, 4, hx("#E9E3D8"))  # 遊戲機
    # 窗下的書報架和盆栽
    r.plant(46, 153, 20)
    r.plant(0, 153, 26)
    # 沙發（前景，面向我們）
    sage, sageL, sageD = hx("#9DB08A"), hx("#B6C7A2"), hx("#7A8E68")
    r.shadow(10, 245, 74)
    r.box(14, 214, 66, 14, sage, sageL, sageD)      # 椅背
    r.box(14, 226, 66, 12, sageL, hx("#C9D6B6"), sage)  # 坐墊
    r.rect(46, 227, 1, 10, sageD)
    r.box(8, 220, 9, 22, sage, sageL, sageD)        # 扶手
    r.box(77, 220, 9, 22, sage, sageL, sageD)
    r.box(12, 237, 70, 6, WM, WL, WD)               # 底座
    r.rect(14, 243, 2, 3, O); r.rect(78, 243, 2, 3, O)
    r.box(20, 217, 12, 11, hx("#F2B8A0"), hx("#F7CDB9"), hx("#D69A82"))  # 抱枕
    r.box(60, 217, 12, 11, hx("#F3D98B"), hx("#F8E6AE"), hx("#D8BC6C"))
    # 地毯
    r.copy(22, 240, 109, 250, 22, 248, skip_wall=False)
    # 立燈
    r.rect(113, 206, 1, 38, O)
    r.box(106, 198, 15, 10, hx("#F6E3B4"), hx("#FFF3D0"), hx("#DCC38E"))
    r.box(109, 243, 9, 3, WD)
    # 啞鈴
    for x in (92, 99):
        r.rect(x, 243, 5, 1, hx("#6E6A66"))
        r.box(x - 1, 241, 2, 5, hx("#45403D"), o=hx("#2F2A28"))
        r.box(x + 4, 241, 2, 5, hx("#45403D"), o=hx("#2F2A28"))
    r.save("living")


# ================= 廚房 =================
def kitchen():
    r = Room("#FFF1D6", 0.3)
    # 磁磚牆（流理台後面）
    for y in range(90, 127):
        for x in range(0, 96):
            r.a[y, x] = hx("#F4F1E8") if (x % 6 and y % 6) else hx("#CFE3DA")
    # 小窗戶
    r.box(8, 48, 30, 30, hx("#AFD6EE"), None, None, o=WD)
    r.rect(9, 49, 28, 1, hx("#D7ECF7"))
    r.rect(22, 49, 2, 28, WM); r.rect(9, 62, 28, 2, WM)
    r.rect(10, 70, 8, 5, hx("#9FC48F")); r.rect(26, 66, 10, 9, hx("#8FB580"))
    r.box(6, 77, 34, 4, WL, hx("#EBC09A"), WM)
    r.box(4, 46, 38, 6, hx("#F2B8A0"), hx("#F7CDB9"), hx("#D69A82"))  # 短窗簾
    for x in range(6, 40, 4):
        r.px(x, 51, hx("#FBF7EE"))
    # 開放式層架 + 罐子
    for y in (58, 72):
        r.box(44, y + 8, 22, 3, WL, None, WM)
    jars = [("#F3D98B", 46), ("#E8A07A", 52), ("#B6C7A2", 59)]
    for c, x in jars:
        r.box(x, 58, 5, 8, hx(c), hx("#FFF6DD"))
        r.rect(x, 57, 5, 1, WD)
    r.box(46, 73, 7, 7, hx("#9CC7E6"), hx("#C6E2F3"))
    r.box(55, 72, 8, 8, hx("#FBF7EE"), None, hx("#DDD5C7"))
    # 抽油煙機
    r.box(66, 70, 26, 12, hx("#C9CBC6"), hx("#E3E5E0"), hx("#A6A8A3"))
    r.box(73, 46, 12, 25, hx("#C9CBC6"), hx("#E3E5E0"), hx("#A6A8A3"))
    # 流理台
    r.shadow(0, 152, 96)
    r.box(0, 127, 96, 5, hx("#E9DCC6"), WHITE, hx("#CDBFA8"))
    r.box(0, 131, 96, 22, WM, WL, WD)
    for x0 in (2, 26, 50, 74):
        r.box(x0, 134, 21, 17, WM, WL, WD)
        r.rect(x0 + 9, 140, 3, 1, O)
    # 水槽 + 水龍頭
    r.rect(16, 127, 22, 2, hx("#9FA4A2"))
    r.rect(17, 128, 20, 1, hx("#7C8180"))
    r.rect(26, 116, 2, 11, hx("#A6A8A3")); r.rect(26, 116, 6, 2, hx("#A6A8A3")); r.px(31, 118, hx("#A6A8A3"))
    # 爐子 + 鍋子
    r.box(66, 124, 26, 4, hx("#3B3735"), hx("#55504D"))
    r.box(70, 113, 14, 11, hx("#D9654E"), hx("#EE8A70"), hx("#B24A38"))
    r.rect(68, 115, 2, 1, O); r.rect(84, 115, 2, 1, O)
    r.rect(75, 111, 4, 2, O)
    # 砧板、蔬菜
    r.box(44, 123, 14, 4, hx("#E6C38E"), hx("#F2D9AE"))
    r.box(46, 120, 4, 4, hx("#E8853C"), None); r.box(51, 121, 4, 3, hx("#8AB86E"))
    # 冰箱
    r.shadow(98, 153, 30)
    mint, mintL, mintD = hx("#AFD9C8"), hx("#CBEBDD"), hx("#88B9A6")
    r.box(100, 70, 28, 84, mint, mintL, mintD)
    r.rect(101, 104, 26, 1, O)
    r.rect(103, 92, 1, 9, O); r.rect(103, 108, 1, 14, O)
    r.box(108, 78, 6, 7, hx("#F4A9B8")); r.box(116, 80, 5, 5, hx("#F3D98B"))  # 貼紙
    r.box(110, 112, 10, 12, WHITE, None, hx("#DDD5C7"))  # 便條
    r.rect(112, 115, 6, 1, hx("#B79C86")); r.rect(112, 118, 5, 1, hx("#B79C86"))
    r.copy(100, 40, 120, 62, 104, 42)   # 時鐘
    # 餐桌 + 椅子（前景）
    r.shadow(20, 245, 92)
    for x in (12, 106):
        r.box(x, 210, 12, 22, WM, WL, WD)    # 椅背
        r.rect(x + 3, 214, 6, 1, WD); r.rect(x + 3, 218, 6, 1, WD)
        r.box(x - 1, 230, 14, 4, WL, None, WM)
        r.rect(x, 234, 2, 12, O); r.rect(x + 10, 234, 2, 12, O)
    r.box(26, 220, 78, 6, WL, hx("#EBC09A"), WM)   # 桌面
    r.box(28, 225, 74, 4, WM, None, WD)
    r.rect(31, 229, 3, 17, O); r.rect(96, 229, 3, 17, O)
    r.rect(32, 229, 1, 16, WD); r.rect(97, 229, 1, 16, WD)
    # 桌上的東西
    r.box(54, 213, 18, 7, hx("#FBF7EE"), None, hx("#DDD5C7"))  # 水果盤
    r.box(56, 209, 5, 5, hx("#D9453A")); r.box(61, 208, 5, 5, hx("#F3C04B")); r.box(65, 210, 5, 5, hx("#8AB86E"))
    r.box(38, 213, 6, 7, hx("#9CC7E6")); r.rect(44, 215, 2, 3, O)   # 馬克杯
    r.box(86, 213, 6, 7, hx("#F4A9B8")); r.rect(92, 215, 2, 3, O)
    r.save("kitchen")


# ================= 浴室 =================
def bath():
    r = Room()
    # 牆：上半淺色，下半磁磚
    for y in range(0, 151):
        for x in range(W):
            if y < 84:
                r.a[y, x] = hx("#EEF3EA") if x % 9 else hx("#E3EADF")
            elif y == 84:
                r.a[y, x] = hx("#9FC5B7")
            else:
                r.a[y, x] = hx("#D3EAE1") if ((x + (6 if (y // 6) % 2 else 0)) % 12 and (y - 85) % 6) else hx("#B5D6CA")
    r.a[151:158] = hx("#9FC5B7"); r.a[151] = hx("#6F9A8B"); r.a[157] = hx("#7FAA9A")
    for y in range(158, H):
        for x in range(W):
            r.a[y, x] = hx("#F3F1EA") if ((x // 10 + (y - 158) // 10) % 2) else hx("#CFDCD6")
    # 高窗
    r.box(100, 38, 24, 20, hx("#BFE3F2"), hx("#E2F3FA"), None, o=hx("#7FAA9A"))
    r.rect(111, 39, 2, 18, hx("#9FC5B7"))
    # 浴簾桿 + 浴簾（拉到旁邊）
    r.rect(3, 58, 62, 2, hx("#A6A8A3"))
    for k, x in enumerate(range(4, 16)):
        c = hx("#F4A9B8") if (x // 2) % 2 else hx("#FBE3E8")
        r.rect(x, 60, 1, 64 + (k % 3), c)
    r.rect(4, 60, 12, 1, O)
    # 蓮蓬頭
    r.rect(48, 64, 2, 30, hx("#A6A8A3"))
    r.box(42, 62, 10, 4, hx("#C9CBC6"), hx("#E3E5E0"))
    # 浴缸
    r.shadow(2, 153, 66)
    r.box(2, 124, 66, 30, WHITE, hx("#FFFFFF"), hx("#DCE3DF"))
    r.rect(3, 128, 64, 1, hx("#DCE3DF"))
    r.rect(5, 125, 60, 3, hx("#A8D8EE"))   # 水
    r.box(54, 119, 7, 6, hx("#F7D44C"), hx("#FBE58A"))  # 小鴨
    r.px(61, 121, hx("#E8853C"))
    r.rect(8, 154, 4, 3, O); r.rect(58, 154, 4, 3, O)
    # 小置物架
    r.box(20, 98, 24, 3, WL, None, WM)
    for c, x, h in (("#F4A9B8", 22, 8), ("#9CC7E6", 28, 10), ("#F3D98B", 35, 7)):
        r.box(x, 98 - h, 5, h, hx(c), hx("#FFFFFF"))
    # 鏡子 + 洗手台
    r.box(72, 64, 26, 34, hx("#CBE6F0"), hx("#E7F4F9"), None, o=WD)
    r.rect(76, 68, 2, 8, WHITE); r.rect(79, 68, 1, 4, WHITE)
    r.shadow(70, 153, 32)
    r.box(70, 114, 30, 6, WHITE, hx("#FFFFFF"), hx("#DCE3DF"))
    r.rect(74, 115, 22, 2, hx("#BFD6DD"))
    r.rect(84, 108, 2, 7, hx("#A6A8A3")); r.rect(84, 108, 5, 2, hx("#A6A8A3"))
    r.box(72, 120, 26, 33, WM, WL, WD)
    r.rect(84, 122, 1, 29, O)
    r.rect(80, 135, 2, 1, O); r.rect(88, 135, 2, 1, O)
    r.box(92, 108, 4, 6, hx("#9ED3A5"))   # 牙刷杯
    r.rect(93, 104, 1, 4, hx("#F4A9B8")); r.rect(94, 105, 1, 3, hx("#9CC7E6"))
    # 毛巾架
    r.rect(104, 88, 22, 2, hx("#A6A8A3"))
    r.box(105, 89, 9, 22, hx("#F4A9B8"), hx("#FBD3DC"), hx("#D9899A"))
    r.box(115, 89, 9, 18, hx("#F3D98B"), hx("#F8E6AE"), hx("#D8BC6C"))
    r.plant(108, 153, 18)
    # 前景：踏墊、洗衣籃
    r.box(30, 240, 40, 6, hx("#B7B4EE"), hx("#D2D0F6"), hx("#9692D4"))
    r.shadow(96, 245, 24)
    r.box(98, 226, 20, 20, hx("#E6C38E"), hx("#F2D9AE"), hx("#C9A26B"))
    for y in range(229, 244, 3):
        r.rect(99, y, 18, 1, hx("#C9A26B"))
    r.box(100, 222, 9, 5, hx("#9CC7E6")); r.box(107, 221, 8, 6, WHITE)
    r.save("bath")


if __name__ == "__main__":
    import os
    os.makedirs("out", exist_ok=True)
    living(); kitchen(); bath()
    BEDI = Image.open("../rooms/bedroom-nochar.png")
    BEDI.save("out/bedroom.png")
    ims = [Image.open(f"out/{n}.png").resize((W * 3, H * 3), Image.NEAREST) for n in ("living", "bedroom", "kitchen", "bath")]
    c = Image.new("RGB", (W * 3 * 4 + 30, H * 3), (40, 40, 40))
    for i, im in enumerate(ims):
        c.paste(im, (i * (W * 3 + 10), 0))
    c.save("out/compare.png")
