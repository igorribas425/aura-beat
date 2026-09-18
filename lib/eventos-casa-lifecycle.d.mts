import type { RealtimeChannel } from "@supabase/supabase-js";

type ConnectedMapContainer = {
  isConnected: boolean;
};

type LeafletMapLike = {
  getContainer: () => ConnectedMapContainer;
  invalidateSize: () => unknown;
};

type LeafletLifecycleOptions<
  TContainer extends ConnectedMapContainer,
  TMap extends LeafletMapLike,
  TTimer,
> = {
  getCurrentMap: () => TMap | null;
  getCurrentContainer: () => TContainer | null;
  schedule: (callback: () => void, delay: number) => TTimer;
  cancel: (timer: TTimer) => void;
};

export function createLeafletLifecycle<
  TContainer extends ConnectedMapContainer,
  TMap extends LeafletMapLike,
  TTimer,
>(
  options: LeafletLifecycleOptions<TContainer, TMap, TTimer>
): {
  begin: () => number;
  isCurrentContainer: (
    expectedRenderId: number,
    expectedContainer: TContainer
  ) => boolean;
  isCurrentMap: (
    expectedRenderId: number,
    expectedMap: TMap,
    expectedContainer: TContainer
  ) => boolean;
  scheduleInvalidate: (
    expectedRenderId: number,
    expectedMap: TMap,
    expectedContainer: TContainer,
    delay: number
  ) => void;
  reset: () => void;
};

type TrackingRealtimeLifecycleOptions = {
  createChannel: (topic: string) => RealtimeChannel;
  removeChannel: (channel: RealtimeChannel) => Promise<unknown>;
  onRemoveError?: (error: unknown) => void;
};

export function createTrackingRealtimeLifecycle(
  options: TrackingRealtimeLifecycleOptions
): {
  clear: () => void;
  subscribe: (
    bookingId: string,
    onInsert: () => void | Promise<void>
  ) => RealtimeChannel;
};
