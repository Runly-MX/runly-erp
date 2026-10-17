// Loads ffmpeg.wasm with its core self-hosted under `${BASE_URL}ffmpeg/`
// (apps/desktop/public/ffmpeg, populated by apps/desktop's postinstall), the
// same way downloadHlsAsMp4.js does. Resolves { ffmpeg, fetchFile }; the caller
// owns ffmpeg.terminate(). The ~30 MB core is fetched only when this runs.
export async function loadFfmpeg() {
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ffmpeg = new FFmpeg();
  const base = `${import.meta.env.BASE_URL}ffmpeg/`;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}ffmpeg-core.wasm`, "application/wasm"),
  });
  return { ffmpeg, fetchFile };
}
