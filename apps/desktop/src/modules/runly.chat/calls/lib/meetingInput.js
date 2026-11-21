// What a person types in "Unirse con un ID": the meeting ID ("abc-d234-5",
// any case/spacing) or a pasted guest link (/p/call/<token> or /p/call?code=).
// Returns { token } | { code } | null, plus guestPath to open the guest page.
export function parseMeetingInput(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  const tokenMatch = text.match(/\/p\/call\/([0-9a-f]{16,})/i);
  if (tokenMatch) {
    const invite = text.match(/[?&]i=([0-9a-f]+)/i)?.[1];
    return { token: tokenMatch[1], guestPath: `/app/p/call/${tokenMatch[1]}${invite ? `?i=${invite}` : ""}` };
  }
  const fromUrl = text.match(/[?&]code=([^&#\s]+)/i)?.[1];
  const code = decodeURIComponent(fromUrl ?? text).replace(/[^0-9a-z]/gi, "").toUpperCase();
  if (code.length !== 8) return null;
  return { code, guestPath: `/app/p/call?code=${code.toLowerCase()}` };
}
