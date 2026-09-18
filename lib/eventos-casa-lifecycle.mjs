export function createLeafletLifecycle({
  getCurrentMap,
  getCurrentContainer,
  schedule,
  cancel,
}) {
  let renderId = 0;
  let pendingTimer = null;

  function cancelPendingTimer() {
    if (pendingTimer === null) {
      return;
    }

    cancel(pendingTimer);
    pendingTimer = null;
  }

  function isCurrentContainer(
    expectedRenderId,
    expectedContainer
  ) {
    return (
      expectedRenderId === renderId &&
      getCurrentContainer() === expectedContainer &&
      expectedContainer.isConnected
    );
  }

  function isCurrentMap(
    expectedRenderId,
    expectedMap,
    expectedContainer
  ) {
    return (
      isCurrentContainer(expectedRenderId, expectedContainer) &&
      getCurrentMap() === expectedMap &&
      expectedMap.getContainer() === expectedContainer
    );
  }

  function begin() {
    renderId += 1;
    cancelPendingTimer();
    return renderId;
  }

  function scheduleInvalidate(
    expectedRenderId,
    expectedMap,
    expectedContainer,
    delay
  ) {
    cancelPendingTimer();

    pendingTimer = schedule(() => {
      pendingTimer = null;

      if (
        isCurrentMap(
          expectedRenderId,
          expectedMap,
          expectedContainer
        )
      ) {
        expectedMap.invalidateSize();
      }
    }, delay);
  }

  function reset() {
    renderId += 1;
    cancelPendingTimer();
  }

  return {
    begin,
    isCurrentContainer,
    isCurrentMap,
    scheduleInvalidate,
    reset,
  };
}

let nextTrackingSubscriptionId = 0;

export function createTrackingRealtimeLifecycle({
  createChannel,
  removeChannel,
  onRemoveError,
}) {
  let currentChannel = null;

  function clear() {
    const channel = currentChannel;
    currentChannel = null;

    if (!channel) {
      return;
    }

    void removeChannel(channel).catch((error) => {
      onRemoveError?.(error);
    });
  }

  function subscribe(bookingId, onInsert) {
    clear();
    nextTrackingSubscriptionId += 1;

    const channel = createChannel(
      `tracking-${bookingId}-${nextTrackingSubscriptionId}`
    );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "booking_tracking",
        filter: `booking_id=eq.${bookingId}`,
      },
      onInsert
    );

    currentChannel = channel;
    channel.subscribe();

    return channel;
  }

  return {
    clear,
    subscribe,
  };
}
