FROM python:3.13-alpine3.24@sha256:9ef1a599f863231c3d91e941389bfdc4a2d6070557243d54df1a4e57015b960e AS native-build
RUN apk add --no-cache build-base cmake pkgconf leptonica-dev fontconfig-dev freetype-dev libjpeg-turbo-dev openjpeg-dev lcms2-dev libpng-dev zlib-dev boost-dev
ADD --checksum=sha256:445603ab1d0a63df552e193a600d9d5c4021aff36e144f3091af149e5efb381a https://github.com/tesseract-ocr/tesseract/archive/7e548e6eff172f38f97664afe7f7ce40db36c8d6.tar.gz /tmp/tesseract.tar.gz
ADD --checksum=sha256:41c32680160addf5a8dd7a830e4869c01e9f6bee1abb91e44fabd1ba9d7828fb https://poppler.freedesktop.org/poppler-26.11.0.tar.xz /tmp/poppler.tar.xz
RUN mkdir /src-tess /src-poppler && tar -xf /tmp/tesseract.tar.gz -C /src-tess --strip-components=1 \
    && tar -xf /tmp/poppler.tar.xz -C /src-poppler --strip-components=1 \
    && cmake -S /src-tess -B /build-tess -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/native \
      -DBUILD_TRAINING_TOOLS=OFF -DBUILD_TESTS=OFF -DDISABLE_ARCHIVE=ON -DDISABLE_CURL=ON \
    && cmake --build /build-tess -j2 && cmake --install /build-tess
RUN cmake -S /src-poppler -B /build-poppler -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/native \
      -DENABLE_GLIB=OFF -DENABLE_QT5=OFF -DENABLE_QT6=OFF -DENABLE_CPP=OFF \
      -DENABLE_NSS3=OFF -DENABLE_GPGME=OFF -DENABLE_LIBCURL=OFF -DENABLE_LIBTIFF=OFF -DENABLE_HARFBUZZ=OFF \
      -DBUILD_GTK_TESTS=OFF -DBUILD_QT5_TESTS=OFF -DBUILD_QT6_TESTS=OFF -DBUILD_CPP_TESTS=OFF -DBUILD_MANUAL_TESTS=OFF \
    && cmake --build /build-poppler -j2 && cmake --install /build-poppler
COPY apps/content-worker/requirements.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir --only-binary=:all: --require-hashes -r /tmp/requirements.txt

FROM python:3.13-alpine3.24@sha256:9ef1a599f863231c3d91e941389bfdc4a2d6070557243d54df1a4e57015b960e
RUN apk upgrade --no-cache && apk add --no-cache leptonica libstdc++ libgomp fontconfig freetype libjpeg-turbo openjpeg lcms2 libpng ca-certificates font-dejavu \
    libssl3 libcrypto3 libffi libbz2 xz-libs expat \
    && apk del .python-rundeps \
    && rm -rf /usr/local/lib/python3.13/sqlite3 /usr/local/lib/python3.13/lib-dynload/_sqlite3* \
    && addgroup -S -g 10001 content && adduser -S -D -H -u 10001 -G content content && fc-cache -f
COPY --from=native-build /opt/native/bin/tesseract /opt/native/bin/pdftotext /opt/native/bin/pdftoppm /opt/native/bin/pdfinfo /usr/local/bin/
COPY --from=native-build /opt/native/lib/*.so* /usr/local/lib/
COPY --from=native-build /src-tess/LICENSE /usr/share/licenses/content/tesseract-LICENSE
COPY --from=native-build /src-poppler/COPYING /usr/share/licenses/content/poppler-COPYING
COPY --from=native-build /usr/local/lib/python3.13/site-packages/PIL /usr/local/lib/python3.13/site-packages/PIL
COPY --from=native-build /usr/local/lib/python3.13/site-packages/pillow.libs /usr/local/lib/python3.13/site-packages/pillow.libs
COPY --from=native-build /usr/local/lib/python3.13/site-packages/pillow-13.0.0.dist-info /usr/local/lib/python3.13/site-packages/pillow-13.0.0.dist-info
RUN python -m pip uninstall -y pip && apk info -v > /opt/content-packages.txt && tesseract --version >> /opt/content-packages.txt
WORKDIR /app
ADD --checksum=sha256:7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2 https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/65727574dfcd264acbb0c3e07860e4e9e9b22185/eng.traineddata /opt/content-tessdata-fast/eng.traineddata
ADD --checksum=sha256:6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464 https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/65727574dfcd264acbb0c3e07860e4e9e9b22185/spa.traineddata /opt/content-tessdata-fast/spa.traineddata
ADD --checksum=sha256:9cf5d576fcc47564f11265841e5ca839001e7e6f38ff7f7aacf46d15a96b00ff https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/65727574dfcd264acbb0c3e07860e4e9e9b22185/osd.traineddata /opt/content-tessdata-fast/osd.traineddata
ADD --checksum=sha256:8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e2aad9b983032bb1beff9133104a67cdbb87ca4d/eng.traineddata /opt/content-tessdata-best/eng.traineddata
ADD --checksum=sha256:e2c1ffdad8b30f26c45d4017a9183d3a7f9aa69e59918be4f88b126fac99ab2c https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e2aad9b983032bb1beff9133104a67cdbb87ca4d/spa.traineddata /opt/content-tessdata-best/spa.traineddata
RUN chmod 0755 /opt/content-tessdata-* && chmod 0444 /opt/content-tessdata-*/*.traineddata \
    && sha256sum /opt/content-tessdata-*/*.traineddata > /opt/content-models.sha256
COPY apps/content-worker/worker.py /app/worker.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_THREAD_LIMIT=1 OMP_NUM_THREADS=1 TESSDATA_PREFIX=/opt/content-tessdata-fast
USER 10001:10001
CMD ["python3", "/app/worker.py"]
