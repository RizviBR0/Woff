type StorageError = { message: string } | null;
type StorageItem = { name: string; id?: string | null };

export type CleanupStorage = {
  list: (
    prefix: string,
    options: {
      limit: number;
      offset: number;
      sortBy: { column: string; order: string };
    },
  ) => Promise<{ data: StorageItem[] | null; error: StorageError }>;
  remove: (paths: string[]) => Promise<{ error: StorageError }>;
};

/** Remove only objects beneath one queued room UUID, including nested folders. */
export async function removeRoomStoragePrefix(
  storage: CleanupStorage,
  roomId: string,
): Promise<number> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId)) {
    throw new Error("Invalid queued room UUID");
  }
  let deleted = 0;
  let listings = 0;
  const walk = async (prefix: string, depth: number): Promise<void> => {
    if (depth > 32) throw new Error("Storage folder depth limit reached");
    let previousPage = "";
    while (true) {
      if (++listings > 200) throw new Error("Storage cleanup batch limit reached");
      const { data, error } = await storage.list(prefix, {
        limit: 1000,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      });
      if (error || !data) throw new Error("Storage listing failed");
      if (!data.length) return;
      const page = JSON.stringify(data.map(({ name, id }) => [name, id]));
      if (page === previousPage) throw new Error("Storage deletion did not advance");
      previousPage = page;
      const files: string[] = [];
      const folders: string[] = [];
      for (const item of data) {
        // Storage.list returns immediate children; reject escaped/broad paths.
        if (!item.name || item.name === "." || item.name === ".." || /[\\/]/.test(item.name)) {
          throw new Error("Invalid Storage child path");
        }
        const child = `${prefix}/${item.name}`;
        if (item.id == null) folders.push(child);
        else files.push(child);
      }
      if (files.length) {
        const { error: removeError } = await storage.remove(files);
        if (removeError) throw new Error("Storage deletion failed");
        deleted += files.length;
      }
      for (const folder of folders) await walk(folder, depth + 1);
      // Verify the prefix is empty before declaring success. Successful no-op
      // deletion must not clear a queue item or spin forever on a stale page.
    }
  };
  await walk(roomId, 0);
  return deleted;
}

type RoomQueueItem = { id: number; space_id: string };
type RoomCleanupResult = {
  spaceId: string;
  status: "success" | "deletion_failed" | "queue_clear_failed";
  deletedCount?: number;
};

export async function cleanupRoomQueue(
  storage: CleanupStorage,
  items: RoomQueueItem[],
  clear: (ids: number[]) => Promise<{ error: StorageError }>,
) {
  const processedIds: number[] = [];
  const results: RoomCleanupResult[] = [];
  let failedCount = 0;
  for (const item of items) {
    try {
      const deletedCount = await removeRoomStoragePrefix(storage, item.space_id);
      processedIds.push(item.id);
      results.push({ spaceId: item.space_id, status: "success", deletedCount });
    } catch {
      failedCount++;
      results.push({ spaceId: item.space_id, status: "deletion_failed" });
    }
  }
  if (processedIds.length) {
    try {
      const { error } = await clear(processedIds);
      if (error) throw new Error("Room queue clearing failed");
    } catch {
      failedCount += processedIds.length;
      for (const result of results) {
        if (result.status === "success") result.status = "queue_clear_failed";
      }
    }
  }
  return { results, failedCount };
}
