"""runly-dwg — conversor DWG a DXF para insertar planos de AutoCAD en
runly.canvas (modo visualizacion). Ver docs/superpowers/specs/2026-11-02-canvas-dwg-viewer-design.md.

Igual que runly-tts es SIN ESTADO: no toca Postgres ni Storage, no conserva
archivos. Un ciclo HTTP sincrono basta porque una conversion tarda segundos; el
resultado (un PNG ya rasterizado en el navegador) se guarda como imagen normal,
asi que abrir el tablero nunca vuelve a llamar aqui.

Expone:
  GET  /health   -> 200 si dwg2dxf esta instalado.
  POST /convert  (body = bytes del DWG) -> 200 con el DXF como texto.
                 400 no es un DWG, 413 excede DWG_MAX_BYTES,
                 422 LibreDWG no pudo convertirlo, 504 tiempo agotado.

No expuesto a internet — solo la API de Runly le habla por la red interna de
Docker Compose (ver DWG_CONVERTER_URL). La autorizacion (canvas.edit) la hace
la API antes de llamar aqui. LibreDWG (GPL) se ejecuta como proceso externo y
nunca se enlaza con codigo de Runly.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG_PREFIX = "[runly-dwg]"

PORT = int(os.environ.get("DWG_PORT", "8091"))
MAX_BYTES = int(os.environ.get("DWG_MAX_BYTES", str(50 * 1024 * 1024)))
TIMEOUT_SECONDS = int(os.environ.get("DWG_TIMEOUT_SECONDS", "60"))
CONVERTER = os.environ.get("DWG_BINARY", "dwg2dxf")

# Every DWG starts with its version tag: AC1014, AC1015, AC1018, AC1021, AC1024, AC1027, AC1032...
DWG_MAGIC = re.compile(rb"^AC10\d\d")


class ConversionError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def convert_dwg(data: bytes) -> bytes:
    if not DWG_MAGIC.match(data[:6]):
        raise ConversionError(400, "El archivo no es un DWG.")
    workdir = tempfile.mkdtemp(prefix="runly-dwg-")
    try:
        source = os.path.join(workdir, "in.dwg")
        target = os.path.join(workdir, "out.dxf")
        with open(source, "wb") as handle:
            handle.write(data)
        try:
            result = subprocess.run(
                [CONVERTER, "-y", "-o", target, source],
                capture_output=True, timeout=TIMEOUT_SECONDS, check=False,
            )
        except subprocess.TimeoutExpired:
            raise ConversionError(504, "La conversion tardo demasiado.")
        # dwg2dxf exits non-zero for recoverable warnings too; a usable DXF on disk is what counts.
        if not os.path.isfile(target) or os.path.getsize(target) == 0:
            tail = result.stderr.decode("utf-8", "replace").strip().splitlines()[-1:] or ["sin detalle"]
            print(f"{LOG_PREFIX} dwg2dxf fallo (codigo {result.returncode}): {tail[0][:200]}", flush=True)
            raise ConversionError(422, "LibreDWG no pudo convertir este DWG.")
        with open(target, "rb") as handle:
            return handle.read()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, status, message):
        self._send(status, json.dumps({"error": message}).encode("utf-8"), "application/json")

    def do_GET(self):
        if self.path == "/health":
            if shutil.which(CONVERTER):
                return self._send(200, b'{"ok":true}', "application/json")
            return self._json_error(503, "dwg2dxf no esta instalado.")
        self._json_error(404, "No encontrado.")

    def do_POST(self):
        if self.path != "/convert":
            return self._json_error(404, "No encontrado.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._json_error(400, "Content-Length invalido.")
        if length <= 0:
            return self._json_error(400, "Cuerpo vacio.")
        if length > MAX_BYTES:
            return self._json_error(413, "El DWG supera el limite permitido.")
        data = self.rfile.read(length)
        try:
            dxf = convert_dwg(data)
        except ConversionError as error:
            return self._json_error(error.status, error.message)
        self._send(200, dxf, "text/plain; charset=utf-8")

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    print(f"{LOG_PREFIX} Escuchando en el puerto {PORT} (max {MAX_BYTES} bytes, timeout {TIMEOUT_SECONDS}s).", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
