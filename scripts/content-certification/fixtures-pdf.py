"""Fixtures for vertical-searchable.mjs, run inside the worker image. Writes scan-3p.pdf and scan-rot90.pdf plus truth.json to OUT.
Ground truth for geometry is computed independently of OCR: the marker line is redrawn alone and its ink box is measured."""
import json
import os
import random
from pathlib import Path

from PIL import ImageChops, ImageDraw

import corpus

out = Path(os.environ['OUT'])
out.mkdir(parents=True, exist_ok=True)
rng = random.Random(11)
marker = os.environ['MARKER']
texts = [f"FACTURA UNO\nFolio FA{marker}1\nPagina 1 de 3", f"FACTURA DOS\nSerial {marker}\nPagina 2 de 3", f"FACTURA TRES\nFolio FC{marker}3\nPagina 3 de 3"]
images = [corpus.render(text, 40, rng, '#ffffff') for text in texts]
corpus.pdf(out / 'scan-3p.pdf', [(None, image) for image in images])
corpus.pdf(out / 'scan-rot90.pdf', [(None, images[1])], rotate=90)


def line_box(text, line):
    """Ink box (px) of one text line exactly as corpus.render places it, found without OCR."""
    lines = text.split('\n')
    only = '\n'.join(item if i == line else '' for i, item in enumerate(lines))
    blank = corpus.render('', 40, random.Random(0), '#ffffff')
    drawn = corpus.render(only, 40, random.Random(0), '#ffffff')
    box = ImageChops.difference(blank.convert('L'), drawn.convert('L')).point(lambda v: 255 if v > 40 else 0).getbbox()
    return box


# Page geometry in corpus.pdf: image drawn at (20,400) sized 560x280 on a 600x800 MediaBox; image is 1400x700.
box = line_box(texts[1], 1)
scale = 560 / 1400
truth = {'marker': marker, 'imageBoxPx': box,
         'pageBoxPt': {'xMin': 20 + box[0] * scale, 'xMax': 20 + box[2] * scale, 'yMin': 800 - (400 + 280) + box[1] * scale, 'yMax': 800 - (400 + 280) + box[3] * scale}}
# The marker word alone, measured from ink (no OCR, no font metrics of the whole string): the word spans from the end of the
# "Serial" ink plus one space to the right ink edge of the line.
space = corpus.font(40).getlength(' ')
serial_only = line_box(texts[1].replace(marker, ' ' * len(marker)), 1)
word_left_px, word_right_px = serial_only[2] + space, box[2]
truth['wordBoxPt'] = {'xMin': 20 + word_left_px * scale, 'xMax': 20 + word_right_px * scale, 'yMin': truth['pageBoxPt']['yMin'], 'yMax': truth['pageBoxPt']['yMax']}
(out / 'truth.json').write_text(json.dumps(truth))
print(json.dumps(truth))
