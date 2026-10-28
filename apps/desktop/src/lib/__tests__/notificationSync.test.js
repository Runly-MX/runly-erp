import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { NOTIFICATION_SUMMARY_KEY, applyIncomingNotification, applyReadChange, refreshNotifications } from "../notificationSync.js";

const KEY = [...NOTIFICATION_SUMMARY_KEY, "token"];
const base = () => ({ unreadCount: 2, unreadByCategory: { messages: 1, general: 1 }, latestUnreadId: "x" });
const client = () => { const c = new QueryClient(); c.setQueryData(KEY, base()); return c; };

describe("notification counters", () => {
  it("adds a new row once per notification id and category", () => {
    const c = client();
    assert.equal(applyIncomingNotification(c, { notificationId: "a", eventType: "chat.message.new", count: 1 }), true);
    assert.equal(applyIncomingNotification(c, { notificationId: "a", eventType: "chat.message.new", count: 1 }), false);
    assert.deepEqual(c.getQueryData(KEY).unreadByCategory, { messages: 2, general: 1 });
    assert.equal(c.getQueryData(KEY).unreadCount, 3);
  });

  it("does not count an update of an already counted row (count > 1) or an event without id", () => {
    const c = client();
    assert.equal(applyIncomingNotification(c, { notificationId: "b", eventType: "chat.message.new", count: 4 }), false);
    assert.equal(applyIncomingNotification(c, { eventType: "system.alert" }), false);
    assert.equal(c.getQueryData(KEY).unreadCount, 2);
  });

  it("marks one or all read without ever going negative and can roll back", () => {
    const c = client();
    const rollback = applyReadChange(c, { category: "general" });
    applyReadChange(c, { category: "general" });
    applyReadChange(c, { category: "general" });
    assert.equal(c.getQueryData(KEY).unreadByCategory.general, 0);
    assert.ok(c.getQueryData(KEY).unreadCount >= 0);
    rollback();
    assert.equal(c.getQueryData(KEY).unreadByCategory.general, 1);
    applyReadChange(c, { all: true });
    assert.deepEqual(c.getQueryData(KEY).unreadByCategory, { messages: 0, general: 0 });
  });

  it("refreshes leading then at most once more for a burst of events", async () => {
    const c = new QueryClient();
    let invalidations = 0;
    c.invalidateQueries = () => { invalidations += 1; return Promise.resolve(); };
    for (let i = 0; i < 50; i++) refreshNotifications(c);
    assert.equal(invalidations, 2); // leading: summary-prefix and inbox
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(invalidations, 4); // exactly one trailing refresh after the burst
  });
});
