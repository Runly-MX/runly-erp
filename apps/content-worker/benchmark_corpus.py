"""Reproducible synthetic device/document corpus; not a claim about real photographs."""
import json
import multiprocessing
import resource
import tempfile
import time
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFont
from test_worker import FONT, POLICY, distance
from worker import extract

CASES = [
    ('laptop','LAPTOP\nService Tag ABC123XYZ\nModel Latitude 7450',42),
    ('switch','SWITCH\nSerial FCW2345ABCD\nHostname SW-OFICINA-01',38),
    ('access-point','ACCESS POINT\nModel AP-AX3000\nAsset Tag RUNLY90876',34),
    ('cctv','CAMARA CCTV\nSerial DS202611250987\nModel IPC-4MP',30),
    ('invoice','FACTURA MX-2026-012345\nRFC ABC010203AB1\nTotal MXN 1250.50',38),
    ('screenshot','Inventario\nHostname LAP-CONTABILIDAD-01\nEstado Disponible',32),
    ('small','PRODUCT CODE XY987654321\nService Tag ABC123XYZ',17),
    ('reflection','Service Tag ABC123XYZ\nModel AP-AX3000',34),
    ('low-contrast','Numero de serie FCW2345ABCD\nInformacion del equipo',32),
    ('inclined','ASSET TAG RUNLY90876\nHostname SW-OFICINA-01',36),
    ('rotation','Service Tag ABC123XYZ\nSerial DS202611250987',36),
    ('empty','',32),
]

def fixture(name,text,size):
    image=Image.new('RGB',(1400,700),'#414952')
    draw=ImageDraw.Draw(image)
    draw.rounded_rectangle((100,80,1300,620),radius=25,fill='#b8bdc4')
    draw.rectangle((170,145,1230,520),fill='white')
    draw.multiline_text((210,195),text,font=ImageFont.truetype(FONT,size),fill='#101820',spacing=24)
    if name=='low-contrast': image=ImageEnhance.Contrast(image).enhance(.15)
    if name=='reflection':
        overlay=Image.new('RGBA',image.size)
        ImageDraw.Draw(overlay).polygon([(800,100),(920,100),(600,600),(480,600)],fill=(255,255,255,190))
        image=Image.alpha_composite(image.convert('RGBA'),overlay).convert('RGB')
    if name=='inclined': image=image.rotate(4,expand=True,fillcolor='#414952')
    if name=='rotation': image=image.rotate(90,expand=True)
    return image

def recognize_case(connection,path,quality):
    started=time.monotonic()
    try:
        result=extract(path,'image/png',{**POLICY,'quality':quality})
        own,child=resource.getrusage(resource.RUSAGE_SELF),resource.getrusage(resource.RUSAGE_CHILDREN)
        connection.send({'text':result['pages'][0]['text'],'seconds':round(time.monotonic()-started,4),
          'cpuSeconds':round(own.ru_utime+own.ru_stime+child.ru_utime+child.ru_stime,4),
          'peakProcessRssKiB':max(own.ru_maxrss,child.ru_maxrss),'secondPasses':result['metrics']['secondPasses']})
    except Exception as error: connection.send({'error':type(error).__name__})
    finally: connection.close()

if __name__=='__main__':
    measurements=[]
    with tempfile.TemporaryDirectory() as directory:
        for name,truth,size in CASES:
            path=Path(directory)/f'{name}.png';fixture(name,truth,size).save(path)
            for quality in ('fast','balanced','accurate'):
                receive,send=multiprocessing.Pipe(duplex=False)
                process=multiprocessing.Process(target=recognize_case,args=(send,path,quality));process.start();send.close()
                if not receive.poll(120): process.kill();process.join();raise RuntimeError('Corpus deadline')
                result=receive.recv();receive.close();process.join();process.close()
                expected=' '.join(truth.split());actual=' '.join(result.get('text','').split())
                ids=[word for word in expected.split() if any(c.isdigit() for c in word) and any(c.isalpha() for c in word)]
                measurements.append({'case':name,'quality':quality,'width':fixture(name,truth,size).width,
                  'bytes':path.stat().st_size,'groundTruth':truth,'cer':distance(expected,actual)/max(1,len(expected)),
                  'wer':distance(expected.split(),actual.split())/max(1,len(expected.split())),
                  'exactIdentifiers':sum(value in actual for value in ids),'identifiers':len(ids),**result})
    print(json.dumps({'synthetic':True,'measurements':measurements},ensure_ascii=False))
