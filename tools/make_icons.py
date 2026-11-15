"""Generate app icons + splash (requires Pillow). Usage: python tools/make_icons.py"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "app")
SS = 4  # supersampling


def icon(size):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # dark rounded background
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=(28, 28, 33, 255))
    # 2x2 grid of rounded 16:9 tiles, top-left one "focused"
    pad, gap = s * 0.17, s * 0.07
    w = (s - 2 * pad - gap) / 2
    h = w * 0.62
    top = (s - (2 * h + gap)) / 2
    colors = [(255, 255, 255), (10, 132, 255), (255, 69, 58), (48, 209, 88)]
    for i, col in enumerate(colors):
        x = pad + (i % 2) * (w + gap)
        y = top + (i // 2) * (h + gap)
        d.rounded_rectangle([x, y, x + w, y + h], radius=int(h * 0.26), fill=col + (255,))
    return img.resize((size, size), Image.LANCZOS)


icon(80).save(os.path.join(OUT, "icon.png"))
icon(130).save(os.path.join(OUT, "largeIcon.png"))

splash = Image.new("RGB", (1920, 1080), (11, 11, 14))
big = icon(260)
splash.paste(big, ((1920 - 260) // 2, (1080 - 260) // 2), big)
splash.save(os.path.join(OUT, "splash.png"), optimize=True)
print("icons written")
