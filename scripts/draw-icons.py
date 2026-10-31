"""Draw the extension icon with Pillow (only needed when changing the artwork)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / "icons"
root.mkdir(exist_ok=True)
scale = 4
image = Image.new("RGBA", (128 * scale, 128 * scale))
draw = ImageDraw.Draw(image)
def box(points):
    return tuple(round(value * scale) for value in points)

# Page outline, with conversation turns on the left and a heading tree on the right.
draw.rounded_rectangle(box((3, 3, 125, 125)), radius=27 * scale, fill="#123c38")
draw.rounded_rectangle(box((14, 20, 114, 108)), radius=10 * scale, fill="#f3faf6")
draw.rounded_rectangle(box((19, 28, 29, 100)), radius=5 * scale, fill="#d5e9e1")
for y in (36, 51, 66, 81, 94):
    draw.ellipse(box((22, y, 27, y + 5)), fill="#159c81")
draw.rounded_rectangle(box((21, 64, 28, 72)), radius=3 * scale, fill="#087961")
for y, end in ((35, 75), (43, 70), (58, 74), (66, 67), (81, 75), (89, 69)):
    draw.rounded_rectangle(box((36, y, end, y + 4)), radius=2 * scale, fill="#91b3a8")
draw.rounded_rectangle(box((81, 30, 108, 98)), radius=5 * scale, fill="#d8eee7")
for x, y, end in ((85, 38, 104), (90, 48, 104), (90, 58, 101), (85, 71, 104), (90, 81, 101)):
    draw.rounded_rectangle(box((x, y, end, y + 4)), radius=2 * scale, fill="#11836d")
for size in (16, 32, 48, 128):
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f"icon{size}.png")
