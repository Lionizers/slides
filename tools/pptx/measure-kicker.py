"""Measures the kicker ('>>' and text) on a PDF page, in cap heights of the kicker text.
python tools/measure-kicker.py file.pdf page(0-based)"""
import sys, pymupdf
from PIL import Image
doc = pymupdf.open(sys.argv[1]); page = doc[int(sys.argv[2])]
s = page.rect.width / 1280  # PDF units per CSS px
pix = page.get_pixmap(dpi=600, clip=pymupdf.Rect(70 * s, 55 * s, 220 * s, 95 * s))
im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
W, H = im.size
def bbox(pred):
    xs = []; ys = []
    for y in range(H):
        for x in range(W):
            if pred(im.getpixel((x, y))): xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None
amber = bbox(lambda p: p[0] > 150 and p[1] > 80 and p[2] < 80 and p[0] - p[2] > 100)
text = bbox(lambda p: abs(p[0] - p[1]) < 12 and abs(p[1] - p[2]) < 12 and p[0] > 110)
cap = text[3] - text[1]
print(f"height {(amber[3]-amber[1])/cap:.2f}  top {(amber[1]-text[1])/cap:+.2f}  bottom {(text[3]-amber[3])/cap:+.2f}  start->text {(text[0]-amber[0])/cap:.2f}  width {(amber[2]-amber[0])/cap:.2f}")
