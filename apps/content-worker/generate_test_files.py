"""Emit twelve small synthetic fixtures as JSON, for isolated ERP Storage tests."""
import base64
import io
import json
import tempfile
import zipfile
from pathlib import Path
from benchmark_corpus import CASES, fixture
from test_worker import make_pdf

files=[]
def add(name,mime,data):
    files.append([name,mime,base64.b64encode(data).decode('ascii')])
for name,text,size in [case for case in CASES if case[0] in ('laptop','switch','access-point','cctv','screenshot','reflection')]:
    stream=io.BytesIO();fixture(name,text,size).save(stream,'PNG');add(name+'.png','image/png',stream.getvalue())
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory)/'test.pdf'
    for name,kinds in [('scan',['image']),('digital',['digital'])]:
        make_pdf(path,kinds);add(name+'.pdf','application/pdf',path.read_bytes())
office=[
 ('docx','word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Documento Office Serie OFFICE987</w:t></w:r></w:p></w:body></w:document>','wordprocessingml.document'),
 ('xlsx','xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Serie SHEET987</t></is></c></row></sheetData></worksheet>','spreadsheetml.sheet'),
 ('pptx','ppt/slides/slide1.xml','<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Diapositiva SLIDE987</a:t></p:sld>','presentationml.presentation'),
]
for extension,entry,xml,mime in office:
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as archive: archive.writestr(entry,xml)
    add('office.'+extension,'application/vnd.openxmlformats-officedocument.'+mime,stream.getvalue())
add('plain.txt','text/plain',b'Documento sintetico Serie TEXT987')
print(json.dumps(files))
