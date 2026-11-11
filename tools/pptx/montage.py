"""Contact sheet: python tools/montage.py OUT.png IMG... (2 columns, 640 px per image)"""
import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
W = 640
ims = [Image.open(f).convert('RGB') for f in files]
ims = [im.resize((W, round(im.height * W / im.width))) for im in ims]
h = ims[0].height
cols = 2
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W + (cols - 1) * 8, rows * h + (rows - 1) * 8), (128, 128, 128))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * (W + 8), (i // cols) * (h + 8)))
sheet.save(out)
