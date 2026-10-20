import { useChatPreferences, chatPreferencesStyle } from "../hooks/useChatPreferences";

// Popovers, pickers and dialogs are portaled to <body>, outside the chat's
// themed root, so they would fall back to the company color. Wrapping their
// content in this scope applies the user's accent (and radii) to them too.
export function ChatThemeScope({ children, className = "" }) {
  const { prefs } = useChatPreferences();
  return (
    <div className={`chat-glass-theme ${className}`} style={chatPreferencesStyle(prefs)}>
      {children}
    </div>
  );
}
