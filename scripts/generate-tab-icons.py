from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path("apps/miniprogram/assets/icons/tab")
OUT.mkdir(parents=True, exist_ok=True)
SIZE = 81

def home(draw, color):
    draw.line([(18, 38), (40, 18), (63, 38)], fill=color, width=5, joint="curve")
    draw.rounded_rectangle((23, 35, 58, 64), radius=4, outline=color, width=5)
    draw.rectangle((36, 48, 46, 64), outline=color, width=4)

def calendar(draw, color):
    draw.rounded_rectangle((17, 20, 64, 65), radius=7, outline=color, width=5)
    draw.line((17, 34, 64, 34), fill=color, width=5)
    draw.line((29, 15, 29, 27), fill=color, width=5)
    draw.line((52, 15, 52, 27), fill=color, width=5)
    for x in (29, 41, 53): draw.ellipse((x - 2, 45, x + 2, 49), fill=color)

def pin(draw, color):
    draw.ellipse((20, 13, 61, 54), outline=color, width=5)
    draw.line([(23, 45), (40, 69), (58, 45)], fill=color, width=5, joint="curve")
    draw.ellipse((33, 27, 48, 42), outline=color, width=5)

def user(draw, color):
    draw.ellipse((29, 14, 52, 37), outline=color, width=5)
    draw.arc((17, 35, 64, 72), 190, 350, fill=color, width=5)

for name, painter in {"home": home, "calendar": calendar, "pin": pin, "user": user}.items():
    for suffix, color in (("", "#8e8e93"), ("-active", "#007aff")):
        image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        painter(ImageDraw.Draw(image), color)
        image.save(OUT / f"{name}{suffix}.png", optimize=True)
