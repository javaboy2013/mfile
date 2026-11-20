#!/usr/bin/env python3
"""小红书推文配图合成：真实截图 → 3:4 竖版卡片（顶部痛点标题 + 截图 + 底部品牌条）"""
from PIL import Image, ImageDraw, ImageFont
import os

SRC = '/tmp/xhs-shots'
OUT = '/tmp/xhs-shots/cards'
os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1440  # 3:4
ACCENT = (10, 123, 240)
DARK = (30, 30, 34)

# 中文字体
FONT_CANDIDATES = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
]
def font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

def card(title_lines, shot_path, out_name, badge=None):
    img = Image.new('RGB', (W, H), DARK)
    d = ImageDraw.Draw(img)
    # 顶部标题区
    y = 70
    f_title = font(64)
    f_badge = font(34)
    if badge:
        d.rounded_rectangle([70, 40, 70 + f_badge.getbbox(badge)[2] + 40, 100], radius=30, fill=ACCENT)
        d.text((90, 52), badge, font=f_badge, fill='white')
        y = 130
    for line in title_lines:
        d.text((70, y), line, font=f_title, fill='white')
        y += 84
    # 截图（等比缩放，圆角+边框感）
    shot = Image.open(shot_path)
    avail_w, avail_h = W - 120, H - y - 160
    scale = min(avail_w / shot.width, avail_h / shot.height)
    shot = shot.resize((int(shot.width * scale), int(shot.height * scale)), Image.LANCZOS)
    fx, fy = (W - shot.width) // 2, y + 40
    # 白色描边模拟窗口
    d.rounded_rectangle([fx - 6, fy - 6, fx + shot.width + 6, fy + shot.height + 6], radius=12, fill=(240, 240, 244))
    img.paste(shot, (fx, fy))
    # 底部品牌条
    f_foot = font(40)
    d.text((70, H - 90), 'mfile', font=font(56), fill=ACCENT)
    d.text((240, H - 78), 'GitHub 开源免费 · Apple Silicon', font=f_foot, fill=(160, 160, 170))
    img.save(os.path.join(OUT, out_name), quality=92)
    print('✓', out_name)

# 图1：封面（主视图 + 我的车 D/E/F 盘）
card(['Mac 找不到 C 盘？', 'Windows 用户的崩溃瞬间'], f'{SRC}/05-main-view.png', '01-封面.png', badge='痛点篇')
# 图2：右键菜单对比
card(['右键终于不是空的了', '复制路径 / 新建 / 压缩全都有'], f'{SRC}/03-context-menu.png', '02-右键.png', badge='痛点2')
# 图3：隐藏文件
card(['.git .env 找不到？', '一键显示隐藏文件'], f'{SRC}/04-hidden-files.png', '03-隐藏文件.png', badge='痛点3')
# 图4：侧栏特写（D/E/F 盘）
card(['「我的电脑」回来了', 'D盘 E盘 F盘 各归各位'], f'{SRC}/02-sidebar-drives.png', '04-我的电脑.png', badge='核心功能')
# 图5：主界面全景
card(['整个软件长这样', '轻量干净，M 芯片免费下载'], f'{SRC}/05-main-view.png', '05-全景.png', badge='mfile')

print('全部完成 →', OUT)
