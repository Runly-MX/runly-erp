import { getSupabaseClient } from "../../../lib/supabase.js";
import { sharePresence } from './sharedPresence.js';
import { shareMessages, shareBroadcasts } from './sharedSubscriptions.js';

/**
 * Subscribe to new/updated messages in a conversation via Postgres Changes.
 * Returns an unsubscribe function.
 */
export function subscribeToMessages(conversationId, onMessage, options) {
  return shareMessages(getSupabaseClient(), conversationId, onMessage, options);
}

// chat:conv:<id> is now covered too (migration
// 20260911180000_chat_guest_realtime_authorization, chat_conv_receive
// policy): the operator side here is a real authenticated user, so
// chat_is_member alone authorizes it — no extra token needed, unlike the
// anonymous storefront guest widget (packages/storefront-sdk), which mints
// and applies its own short-lived guest token separately.
const PRIVATE_TOPIC_PREFIXES = ["chat:presence:", "chat:company:", "chat:conv:"];

function isPrivateTopic(channelName) {
  return PRIVATE_TOPIC_PREFIXES.some((prefix) => channelName.startsWith(prefix));
}

/**
 * Subscribe to a single broadcast event on a channel.
 * Returns an unsubscribe function.
 */
export function subscribeToBroadcast(channelName, event, onEvent) {
  return subscribeToMultiBroadcast(channelName, { [event]: onEvent });
}

/**
 * Subscribe to multiple broadcast events on a SINGLE channel.
 * Avoids the channel-removal conflict that occurs when subscribeToBroadcast
 * is called more than once with the same channelName.
 * handlers is an object of { eventName: callbackFn }.
 * Returns an unsubscribe function.
 */
export function subscribeToMultiBroadcast(channelName, handlers) {
  return shareBroadcasts(getSupabaseClient(), channelName, handlers, isPrivateTopic(channelName) ? { config: { private: true } } : undefined);
}

/**
 * Create a Presence + Broadcast channel for a conversation.
 * Used for typing indicators and online status.
 */
export function createPresenceChannel(channelName, userPresenceData, { onPresenceSync, onTyping } = {}) {
  return sharePresence(getSupabaseClient(), channelName, userPresenceData, { onPresenceSync, onTyping });
}
