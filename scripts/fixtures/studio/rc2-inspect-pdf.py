import json,sys
from pathlib import Path
import pymupdf as fitz

folder=Path(sys.argv[1]);results=[]
for profile in ['rgb','cmyk']:
    path=folder/f'rc2-print-{profile}.pdf'
    doc=fitz.open(path);assert len(doc)==1
    page=doc[0];mm=72/25.4
    assert abs(page.trimbox.width-158.75*mm)<0.02
    assert abs(page.trimbox.height-(400/96*25.4)*mm)<0.02
    assert abs(page.bleedbox.width-(158.75+6)*mm)<0.02
    assert abs(page.mediabox.width-(158.75+20)*mm)<0.02
    assert page.rotation==0 and page.rect.width>page.rect.height
    images=page.get_images(full=True);assert len(images)==1
    xref,smask,width,height,bits,space,*_=images[0]
    assert smask==0 and bits==8
    assert space==('DeviceCMYK' if profile=='cmyk' else 'DeviceRGB')
    assert abs(width/((158.75+6)/25.4)-300)<0.5
    assert doc.xref_get_key(doc.pdf_catalog(),'OutputIntents')[0]=='null'
    pix=page.get_pixmap(dpi=96,alpha=False)
    def pixel(x,y):
        p=(int(y)*pix.width+int(x))*pix.n
        return list(pix.samples[p:p+3])
    offset=10/25.4*96
    probes=[(80+offset,80+offset,[255,191,191]),(310+offset,100+offset,[245,158,11])]
    error=0
    for x,y,expected in probes:
        error=max(error,max(abs(a-b) for a,b in zip(pixel(x,y),expected)))
    assert error<=(5 if profile=='rgb' else 25),(profile,error)
    assert min(pixel(1,1))>=250
    # Registration marks are vector strokes outside BleedBox; test their raster.
    mark_x=round(10/25.4*96);mark_y=round(3/25.4*96)
    assert min(min(pixel(mark_x+dx,mark_y+dy)) for dx in [-1,0,1] for dy in [-1,0,1])<230
    pix.save(folder/f'rc2-print-{profile}-raster.png')
    results.append({'profile':profile,'imagePixels':[width,height],'colorSpace':space,'effectivePpi':width/((158.75+6)/25.4),'maxSampleError':error,'trimBox':list(page.trimbox),'bleedBox':list(page.bleedbox),'mediaBox':list(page.mediabox),'noSoftMask':True,'noOutputIntent':True})
print(json.dumps({'passed':True,'renderer':'PyMuPDF','pdfs':results}))
