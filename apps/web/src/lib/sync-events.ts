export const SYNC_QUEUE_CHANGED_EVENT = "edgeever:sync-queue-changed";
export const SYNC_QUEUE_DEFERRED_EVENT = "edgeever:sync-queue-deferred";

export const notifySyncQueueChanged = () => {
  window.dispatchEvent(new CustomEvent(SYNC_QUEUE_CHANGED_EVENT));
};

export const notifySyncQueueDeferred = () => {
  window.dispatchEvent(new CustomEvent(SYNC_QUEUE_DEFERRED_EVENT));
};
