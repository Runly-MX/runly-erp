import { useCallback, useEffect, useState } from "react";

// Very wide screens have room for the chat AND the conversation/group profile,
// so it opens docked by default. Closing it there is remembered per device, so
// someone who prefers the plain chat is not fighting the default every time.
const WIDE_QUERY = "(min-width: 1600px)";
const PREF_KEY = "runly-chat-profile-docked";

function readPref() {
  try {
    return localStorage.getItem(PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

export function useDockedProfile() {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches,
  );
  const [preferred, setPreferred] = useState(readPref);

  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const handler = (e) => setWide(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Only a choice made on a wide screen counts: on a narrow one the profile
  // replaces the chat, so closing it there says nothing about the default.
  const remember = useCallback((open) => {
    if (!window.matchMedia(WIDE_QUERY).matches) return;
    setPreferred(open);
    try {
      localStorage.setItem(PREF_KEY, open ? "1" : "0");
    } catch {}
  }, []);

  return { dockByDefault: wide && preferred, wide, remember };
}
