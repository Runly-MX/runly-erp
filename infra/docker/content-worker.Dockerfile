FROM debian:trixie-slim@sha256:8aa5a7bf5a1955bddbe7d74fcdd0b91ab30e74362a8b73af672b0481b35b44a0
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pil tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng tesseract-ocr-osd \
    poppler-utils ca-certificates fonts-dejavu-core \
    && dpkg-query -W > /opt/content-packages.txt \
    && sha256sum /usr/share/tesseract-ocr/5/tessdata/*.traineddata > /opt/content-models.sha256 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin content
WORKDIR /app
ADD --chmod=0444 --checksum=sha256:8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e2aad9b983032bb1beff9133104a67cdbb87ca4d/eng.traineddata /opt/content-tessdata-best/eng.traineddata
ADD --chmod=0444 --checksum=sha256:e2c1ffdad8b30f26c45d4017a9183d3a7f9aa69e59918be4f88b126fac99ab2c https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e2aad9b983032bb1beff9133104a67cdbb87ca4d/spa.traineddata /opt/content-tessdata-best/spa.traineddata
RUN chmod 0755 /opt/content-tessdata-best && chmod 0444 /opt/content-tessdata-best/*.traineddata
COPY apps/content-worker/worker.py /app/worker.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_THREAD_LIMIT=1 OMP_NUM_THREADS=1
USER 10001:10001
CMD ["python3", "/app/worker.py"]
