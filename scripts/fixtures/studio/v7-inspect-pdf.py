"""Independent raster verification of the actual five-page Web exports."""
import json
import sys
from pathlib import Path
import pymupdf as fitz

directory = Path(sys.argv[1])
outputs = []
for profile in ('rgb', 'cmyk'):
    path = directory / f'v7-pdf-{profile}.pdf'
    pdf = fitz.open(path)
    assert len(pdf) == 5
    expected = [(255,255,255), (255,255,255), (255,221,221), (221,255,221), (221,221,255)]
    pages = []
    for index, page in enumerate(pdf):
        trim = page.trimbox
        assert (trim.width > trim.height) == (index % 2 == 0)
        images = page.get_images(full=True)
        assert len(images) == 1
        assert images[0][5] == ('DeviceRGB' if profile == 'rgb' else 'DeviceCMYK')
        pix = page.get_pixmap(matrix=fitz.Matrix(1,1), alpha=False, colorspace=fitz.csRGB)
        point = fitz.Point(trim.x0 + trim.width * .92, trim.y0 + trim.height * .92)
        pixel = pix.pixel(min(pix.width-1,round(point.x)), min(pix.height-1,round(point.y)))
        tolerance = 5 if profile == 'rgb' else 40
        assert max(abs(a-b) for a,b in zip(pixel,expected[index])) <= tolerance, (profile,index,pixel)
        if index == 2:
            photo = fitz.Point(trim.x0 + trim.width * 230/320, trim.y0 + trim.height * 80/240)
            photo_pixel = pix.pixel(round(photo.x), round(photo.y))
            assert max(abs(a-b) for a,b in zip(photo_pixel,(245,158,11))) <= (8 if profile == 'rgb' else 50), (profile,photo_pixel)
        pages.append({'index':index+1,'trimMm':[round(trim.width*25.4/72,2),round(trim.height*25.4/72,2)],'rasterPixels':[images[0][2],images[0][3]],'sampleRgb':list(pixel)})
    outputs.append({'file':path.name,'profile':profile,'pages':pages})
    pdf.close()
print(json.dumps({'passed':True,'outputs':outputs}))
