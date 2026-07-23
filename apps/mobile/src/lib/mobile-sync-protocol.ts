export const hasMobileSyncCursorRewound = (localCursor: number, serverCursor?: number) =>
  typeof serverCursor === "number" && Number.isFinite(serverCursor) && serverCursor < localCursor;

export const hasMobileSyncIdentityChanged = (localIdentity: string, serverIdentity?: string) =>
  typeof serverIdentity === "string" && serverIdentity.length > 0 && serverIdentity !== localIdentity;

export const isMobileSyncMetadataInitialized = (
  cursorValue: string | null | undefined,
  identityValue: string | null | undefined
) => Boolean(identityValue?.trim()) && typeof cursorValue === "string" && cursorValue.trim().length > 0 && Number.isFinite(Number(cursorValue));

export const splitMobileBootstrapWriteBatches = <T>(items: T[], batchSize: number): T[][] => {
  const normalizedBatchSize = Math.max(1, Math.floor(batchSize));
  if (items.length === 0) {
    return [[]];
  }
  return Array.from(
    { length: Math.ceil(items.length / normalizedBatchSize) },
    (_, index) => items.slice(index * normalizedBatchSize, (index + 1) * normalizedBatchSize)
  );
};
