// Plain-language result of "Verificar conexion". The SDK reports a small hello (state + origin) even when it
// is not allowed to track, so we can tell "never loaded" apart from "loaded but blocked".
const STATE_TEXT = {
  dnt: "El script cargo, pero el navegador tiene activado «No rastrear», asi que no envia datos. Prueba con otro navegador o desactivalo.",
  consent_denied: "El script cargo, pero el visitante rechazo el consentimiento de analitica.",
  consent_required: "El script cargo, pero la analitica espera el consentimiento del visitante.",
  off: "El script cargo, pero la analitica de este sitio esta apagada en Runly.",
  unavailable: "El script cargo, pero no pudo leer la configuracion del sitio en Runly.",
};

export function describeVerification(result) {
  if (result?.verified) {
    return { kind: "success", message: "Sitio verificado: ya estamos recibiendo datos." };
  }
  const ping = result?.diagnostic;
  if (!ping) {
    return {
      kind: "info",
      message:
        "Aun no sabemos nada de ese sitio: el script no ha cargado. Verifica que el snippet este publicado y que la politica de seguridad (CSP) del sitio permita este servidor.",
    };
  }
  if (ping.originAllowed === false) {
    return {
      kind: "info",
      message: `El script cargo desde ${ping.origin || "otro origen"}, pero ese origen no coincide con el dominio configurado del sitio, asi que Runly rechaza sus eventos. Edita el sitio y corrige el dominio.`,
    };
  }
  if (ping.state === "tracking") {
    return {
      kind: "info",
      message: "El script cargo y esta listo. Navega una pagina del sitio y vuelve a verificar en unos segundos.",
    };
  }
  return { kind: "info", message: STATE_TEXT[ping.state] ?? "El script cargo, pero aun no hay eventos." };
}
