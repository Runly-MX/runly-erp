# runly-dwg — conversor DWG a DXF para runly.canvas (solo visualizacion).
# Ver apps/dwg/main.py y docs/superpowers/specs/2026-11-02-canvas-dwg-viewer-design.md.

# LibreDWG no esta en los repositorios de Debian bookworm: se compila desde el
# tarball oficial de GNU (GPL, se ejecuta como proceso externo, sin enlazarlo).
FROM python:3.11-slim-bookworm AS libredwg
ARG LIBREDWG_VERSION=0.13.3
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fsSL "https://ftp.gnu.org/gnu/libredwg/libredwg-${LIBREDWG_VERSION}.tar.xz" | tar -xJ --strip-components=1 \
    && ./configure --prefix=/opt/libredwg --disable-bindings --disable-static --disable-docs --disable-werror \
    && make -j"$(nproc)" \
    && make install

FROM python:3.11-slim-bookworm

# Mismo motivo que runly-tts: sin esto `docker compose logs` no muestra nada.
ENV PYTHONUNBUFFERED=1

COPY --from=libredwg /opt/libredwg /opt/libredwg
ENV PATH="/opt/libredwg/bin:${PATH}" \
    LD_LIBRARY_PATH="/opt/libredwg/lib"

RUN useradd --system --no-create-home runly
WORKDIR /app
COPY apps/dwg/main.py .
USER runly

CMD ["python", "main.py"]
