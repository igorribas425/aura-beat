import assert from "node:assert/strict";
import test from "node:test";

const lifecycleModule = await import(
  "../lib/eventos-casa-lifecycle.mjs"
).catch(() => ({}));

const {
  createLeafletLifecycle,
  createTrackingRealtimeLifecycle,
} = lifecycleModule;

test("does not invalidate a Leaflet map after cleanup", () => {
  assert.equal(
    typeof createLeafletLifecycle,
    "function",
    "createLeafletLifecycle must be implemented"
  );

  let currentMap;
  let currentContainer;
  let scheduledCallback;
  const cancelledTimers = [];
  let invalidations = 0;

  const container = { isConnected: true };
  const map = {
    getContainer: () => container,
    invalidateSize: () => {
      invalidations += 1;
    },
  };

  currentMap = map;
  currentContainer = container;

  const lifecycle = createLeafletLifecycle({
    getCurrentMap: () => currentMap,
    getCurrentContainer: () => currentContainer,
    schedule: (callback) => {
      scheduledCallback = callback;
      return 17;
    },
    cancel: (timer) => {
      cancelledTimers.push(timer);
    },
  });

  const render = lifecycle.begin();
  assert.equal(
    lifecycle.isCurrentContainer(render, container),
    true
  );
  assert.equal(lifecycle.isCurrentMap(render, map, container), true);
  lifecycle.scheduleInvalidate(render, map, container, 100);

  currentMap = null;
  currentContainer = null;
  lifecycle.reset();

  assert.equal(
    lifecycle.isCurrentContainer(render, container),
    false
  );
  assert.equal(lifecycle.isCurrentMap(render, map, container), false);

  assert.deepEqual(cancelledTimers, [17]);

  // Simula um callback que já entrou na fila antes do cancelamento.
  scheduledCallback();

  assert.equal(invalidations, 0);
});

test("invalidates only the current map with a connected container", () => {
  assert.equal(
    typeof createLeafletLifecycle,
    "function",
    "createLeafletLifecycle must be implemented"
  );

  let scheduledCallback;
  let invalidations = 0;
  const container = { isConnected: true };
  const map = {
    getContainer: () => container,
    invalidateSize: () => {
      invalidations += 1;
    },
  };

  const lifecycle = createLeafletLifecycle({
    getCurrentMap: () => map,
    getCurrentContainer: () => container,
    schedule: (callback) => {
      scheduledCallback = callback;
      return 23;
    },
    cancel: () => {},
  });

  const render = lifecycle.begin();
  lifecycle.scheduleInvalidate(render, map, container, 100);
  scheduledCallback();

  assert.equal(invalidations, 1);

  const nextRender = lifecycle.begin();
  lifecycle.scheduleInvalidate(nextRender, map, container, 100);
  container.isConnected = false;
  scheduledCallback();

  assert.equal(invalidations, 1);
});

test("registers tracking callbacks before subscribe and never reuses a subscribed topic", () => {
  assert.equal(
    typeof createTrackingRealtimeLifecycle,
    "function",
    "createTrackingRealtimeLifecycle must be implemented"
  );

  const events = [];
  const channels = new Map();
  const pendingRemoval = new Promise(() => {});

  const createChannel = (topic) => {
    events.push(`channel:${topic}`);

    if (channels.has(topic)) {
      return channels.get(topic);
    }

    let subscribed = false;
    const channel = {
      topic,
      on(type, filter, callback) {
        if (subscribed) {
          throw new Error("callback registered after subscribe");
        }

        events.push(`on:${topic}:${type}:${filter.filter}`);
        channel.callback = callback;
        return channel;
      },
      subscribe() {
        subscribed = true;
        events.push(`subscribe:${topic}`);
        return channel;
      },
    };

    channels.set(topic, channel);
    return channel;
  };

  const lifecycleOptions = {
    createChannel,
    removeChannel: (channel) => {
      events.push(`remove:${channel.topic}`);
      return pendingRemoval;
    },
  };

  const firstLifecycle =
    createTrackingRealtimeLifecycle(lifecycleOptions);

  firstLifecycle.subscribe("booking-1", () => {});
  firstLifecycle.clear();

  const recreatedLifecycle =
    createTrackingRealtimeLifecycle(lifecycleOptions);

  recreatedLifecycle.subscribe("booking-1", () => {});

  assert.deepEqual(events, [
    "channel:tracking-booking-1-1",
    "on:tracking-booking-1-1:postgres_changes:booking_id=eq.booking-1",
    "subscribe:tracking-booking-1-1",
    "remove:tracking-booking-1-1",
    "channel:tracking-booking-1-2",
    "on:tracking-booking-1-2:postgres_changes:booking_id=eq.booking-1",
    "subscribe:tracking-booking-1-2",
  ]);
});
