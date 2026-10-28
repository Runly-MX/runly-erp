import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharePresence } from '../sharedPresence.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const channels = [], removed = [];
  const client = {
    channel(topic, options) {
      const callbacks = {};
      const ch = { topic, options, tracks: [], sends: [],
        on(type, { event }, fn) { callbacks[`${type}:${event}`] = fn; return this; },
        subscribe(fn) { this.status = fn; },
        presenceState: () => ({ peer: [{ userId: 'peer' }] }),
        track: async (data) => { ch.tracks.push(data); return 'ok'; },
        send: async (data) => { ch.sends.push(data); return 'ok'; },
        emit: (type, data) => callbacks[type]?.(data),
      };
      channels.push(ch); return ch;
    },
    async removeChannel(ch) { removed.push(ch); },
  };
  return { client, channels, removed };
}

test('full and floating views share one private channel; closing one keeps the other online', async () => {
  const { client, channels, removed } = fixture();
  const a = [], b = [];
  const first = sharePresence(client, 'chat:presence:one', { userId: 'profile' }, { onPresenceSync: (s) => a.push(s) });
  const second = sharePresence(client, 'chat:presence:one', { userId: 'profile' }, { onPresenceSync: (s) => b.push(s) });
  await tick();
  assert.equal(channels.length, 1);
  assert.equal(channels[0].options.config.private, true);
  channels[0].status('SUBSCRIBED');
  channels[0].emit('presence:sync');
  assert.equal(a.length, 1); assert.equal(b.length, 1);
  first.unsubscribe(); await tick();
  assert.equal(removed.length, 0);
  channels[0].emit('presence:sync');
  assert.equal(a.length, 1); assert.equal(b.length, 2);
  second.sendTyping(true);
  assert.deepEqual(channels[0].sends[0].payload, { userId: 'profile', isTyping: true });
  second.unsubscribe(); await tick();
  assert.equal(removed.length, 1);
});

test('reconnect republishes presence and a closed consumer cannot send typing', async () => {
  const { client, channels } = fixture();
  const states = [];
  const view = sharePresence(client, 'chat:presence:one', { userId: 'profile' }, { onPresenceSync: (s) => states.push(s) });
  await tick();
  const ch = channels[0];
  ch.status('SUBSCRIBED'); ch.status('CHANNEL_ERROR'); ch.status('SUBSCRIBED');
  assert.deepEqual(states, [{}]);
  assert.equal(ch.tracks.length, 2);
  view.unsubscribe(); view.sendTyping(true);
  assert.equal(ch.sends.length, 0);
  await tick();
});

test('immediate remount avoids subscribing twice to a channel being removed', async () => {
  const { client, channels, removed } = fixture();
  const first = sharePresence(client, 'chat:presence:one', { userId: 'profile' });
  await tick();
  first.unsubscribe();
  const next = sharePresence(client, 'chat:presence:one', { userId: 'profile' });
  await tick();
  assert.equal(channels.length, 1); assert.equal(removed.length, 0);
  next.unsubscribe(); await tick();
});

test('changing account waits for previous removal and publishes the new profile', async () => {
  const { client, channels, removed } = fixture();
  const first = sharePresence(client, 'chat:presence:one', { userId: 'old-profile' });
  await tick();
  const next = sharePresence(client, 'chat:presence:one', { userId: 'new-profile' });
  await tick();
  assert.equal(removed.length, 1); assert.equal(channels.length, 2);
  channels[1].status('SUBSCRIBED');
  assert.equal(channels[1].tracks[0].userId, 'new-profile');
  first.unsubscribe(); next.unsubscribe(); await tick();
});

test('a remount during asynchronous removal waits before creating the new channel', async () => {
  const { client, channels } = fixture();
  let finishRemoval;
  client.removeChannel = () => new Promise((resolve) => { finishRemoval = resolve; });
  const first = sharePresence(client, 'chat:presence:one', { userId: 'profile' });
  await tick(); first.unsubscribe(); await tick();
  const next = sharePresence(client, 'chat:presence:one', { userId: 'profile' });
  await tick(); assert.equal(channels.length, 1);
  finishRemoval('ok'); await tick(); assert.equal(channels.length, 2);
  next.unsubscribe(); await tick(); finishRemoval('ok'); await tick();
});

test('typing sends a bounded heartbeat and stop is immediate only after all views stop', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const { client, channels } = fixture();
  const a = sharePresence(client, 'chat:presence:one', { userId: 'profile' });
  const b = sharePresence(client, 'chat:presence:one', { userId: 'profile' });
  await tick(); const channel = channels[0]; channel.status('SUBSCRIBED');
  for(let i=0;i<20;i++)a.sendTyping(true);
  b.sendTyping(true);a.sendTyping(false);
  assert.equal(channel.sends.length,1);
  context.mock.timers.tick(1000);b.sendTyping(true);
  assert.equal(channel.sends.length,2);
  b.sendTyping(false);
  assert.equal(channel.sends.length,3);
  assert.equal(channel.sends.at(-1).payload.isTyping,false);
  b.sendTyping(false);assert.equal(channel.sends.length,3);
  a.unsubscribe();b.unsubscribe();await tick();
});
