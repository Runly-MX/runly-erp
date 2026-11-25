# Seguridad de Content Intelligence, etapa 2

Fecha: 2026-11-25. Scout 1.24.0, sin exclusiones. Antes: 50 CVE, 77 hallazgos altos/críticos. Después: 1 CVE alto, cero críticos reportados. La imagen API de prueba tiene 81 CVE altos/críticos propios; coincidencia de CVE no prueba misma ruta de explotación. El worker se añade al ERP: no reemplaza su imagen API.

El SBOM de Scout detectó 59 paquetes y no detectó los binarios compilados Tesseract/Poppler. El SBOM adjunto añade ambos con fuente y hash, **sin afirmar que Scout los haya analizado**. La reducción no equivale a una certificación de ausencia de CVE. Modelos: hashes y commits en el Dockerfile; Apache-2.0.

El único hallazgo final es CVE-2026-107891, musl 1.2.6-r3, HIGH. Scout propone r6; el [registro oficial de Alpine](https://security.alpinelinux.org/vuln/CVE-2026-107891) identifica r3 corregido en 3.24 y r6 en edge. Se conserva el resultado bruto; no hay regla de exclusión. SQLite se retiró porque el worker no lo usa.

Exposición: Pillow/Poppler/Tesseract y bibliotecas de imágenes procesan entradas no confiables. No se presupone inexplotabilidad; cada hallazgo conserva versión/fix del escáner. Los demás paquetes son runtime transitivo; no se ejecutaron exploits. El JSON incluye exposición y mitigación por hallazgo. El mismo nombre ausente en Alpine puede corresponder a un componente renombrado: verificar el SBOM y los dos componentes nativos.

Mitigaciones verificadas por pruebas Docker: UID 10001, sin capabilities, no-new-privileges, filesystem de solo lectura, tmpfs 256 MiB, 64 PIDs, cgroups, plazos y procesos aislados; sin socket Docker ni credenciales DB/Storage. La red solo necesita API pero Compose no impone firewall de salida. No se afirma confinamiento de red completo.

| CVE | Nivel | Paquete / instalada | Fix que informa Scout | Dependencia / tipo | Imagen final | También CVE en API |
| --- | --- | --- | --- | --- | --- | --- |
| CVE-2026-96637 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-96637 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-96642 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-96642 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-96643 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-96643 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-96644 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-107496 | HIGH | openssl 3.5.9-1~deb13u1 | not fixed | Transitiva / SO | 3.5.9-r1 | Sí |
| CVE-2026-54059 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-54060 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-55379 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-55380 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-59199 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-59199 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-59200 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-59205 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-59205 | HIGH | pillow 11.1.0-5+deb13u4 | 12.3.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-84786 | HIGH | openssl 3.5.9-1~deb13u1 | not fixed | Transitiva / SO | 3.5.9-r1 | No |
| CVE-2026-107493 | HIGH | openssl 3.5.9-1~deb13u1 | not fixed | Transitiva / SO | 3.5.9-r1 | No |
| CVE-2026-96778 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-96778 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-86140 | HIGH | libxml2 2.12.7+dfsg+really2.9.14-2.1+deb13u3 | not fixed | Transitiva / SO | Ausente bajo esta identidad | No |
| GHSA-78g4-xqwv-q3g8 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112390 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112390 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-112392 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-112392 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112893 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112893 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-117610 | HIGH | expat 2.9.0-1~deb13u1 | not fixed | Transitiva / SO | 2.11.0-r0 | No |
| CVE-2026-118370 | HIGH | expat 2.9.0-1~deb13u1 | not fixed | Transitiva / SO | 2.11.0-r0 | No |
| CVE-2026-59197 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-96640 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-96640 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-107705 | HIGH | poppler 25.03.0-5+deb13u4 | not fixed | Directa / SO | 26.11.0 | No |
| CVE-2026-112902 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-54058 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-128067 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-74860 | HIGH | libxml2 2.12.7+dfsg+really2.9.14-2.1+deb13u3 | not fixed | Transitiva / SO | Ausente bajo esta identidad | No |
| CVE-2026-25990 | HIGH | pillow 11.1.0 | 12.1.1 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-42311 | HIGH | pillow 11.1.0 | 12.2.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-88048 | HIGH | tesseract 5.5.0-1 | not fixed | Directa / SO | 5.5.4 | No |
| CVE-2026-112397 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-112397 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112399 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-112399 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112400 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112400 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-112402 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-112402 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112406 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-112406 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112892 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-112892 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112894 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112894 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-112895 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112895 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-112897 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112897 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-40192 | HIGH | pillow 11.1.0 | 12.2.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-59204 | HIGH | pillow 11.1.0 | 12.3.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112404 | HIGH | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-112404 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112896 | HIGH | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112896 | HIGH | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-112902 | HIGH | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112393 | CRITICAL | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112393 | CRITICAL | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-112398 | CRITICAL | pillow 11.1.0-5+deb13u4 | not fixed | Directa / SO | 13.0.0 | No |
| CVE-2026-112398 | CRITICAL | pillow 11.1.0 | not fixed | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112403 | CRITICAL | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112403 | CRITICAL | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-112900 | CRITICAL | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-112900 | CRITICAL | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |
| CVE-2026-96639 | CRITICAL | pillow 11.1.0 | 13.0.0 | Directa / Aplicación | 13.0.0 | No |
| CVE-2026-96639 | CRITICAL | pillow 11.1.0-5+deb13u4 | 13.0.0 | Directa / SO | 13.0.0 | No |

## Árbol npm del ERP

Auditoría de producción con pnpm: 1 crítico, 14 altos, 12 moderados y 7 bajos. Es una superficie separada de la imagen Python y de los CVE del sistema operativo que informa Scout. No se suman los resultados entre herramientas. [Versiones, rutas transitivas y avisos](node-dependencies.json).

Esta consolidación no añadió dependencias npm. Los hallazgos requieren verificar exposición efectiva por ruta y compatibilidad antes de actualizar; no se cambiaron dependencias generales del ERP solo para reducir el contador. En particular hay avisos de tar, Fabric y otras dependencias transitivas. No se presume que estén todos expuestos por OCR ni que sean inocuos. El análisis de alcance del ERP completo y su remediación siguen pendientes y bloquean una certificación de producción.
