import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.80.0";

const FILES_BUCKET = "files";
const ENTRY_BATCH_SIZE = 200;
const QUEUE_BATCH_SIZE = 1000;
const STORAGE_BATCH_SIZE = 1000;

type ExpiringEntry = {
  id: string;
  assets: Array<{ bucket_key: string }> | null;
};

type StorageQueueItem = {
  id: number;
  bucket_key: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getAdminKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (secretKeys) {
    try {
      const keys = JSON.parse(secretKeys) as Record<string, unknown>;
      if (typeof keys.default === "string" && keys.default.length > 0) {
        return keys.default;
      }
    } catch {
      // Fall back to the legacy service-role key during API key migrations.
    }
  }

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function unique(paths: string[]) {
  return [...new Set(paths)];
}

async function removeObjects(admin: SupabaseClient, paths: string[]) {
  const objectPaths = unique(paths);

  for (let offset = 0; offset < objectPaths.length; offset += STORAGE_BATCH_SIZE) {
    const batch = objectPaths.slice(offset, offset + STORAGE_BATCH_SIZE);
    const { error } = await admin.storage.from(FILES_BUCKET).remove(batch);
    if (error) throw error;
  }

  return objectPaths.length;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const cleanupSecret = request.headers.get("x-woff-cleanup-secret") ?? "";
  if (cleanupSecret.length < 32 || cleanupSecret.length > 256) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) {
    console.error("Supabase admin environment is unavailable");
    return json({ error: "Cleanup service unavailable" }, 503);
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: isAuthorized, error: authorizationError } = await admin.rpc(
    "validate_extension_cleanup_secret",
    { p_secret: cleanupSecret },
  );

  if (authorizationError) {
    console.error("Cleanup authorization failed", authorizationError.message);
    return json({ error: "Cleanup service unavailable" }, 503);
  }
  if (isAuthorized !== true) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const now = new Date().toISOString();

    // Remove the physical objects before their rows. If Storage is temporarily
    // unavailable, the database's separate expiry job still blocks access and
    // this function retries the objects on its next run.
    const { data: expiredEntries, error: expiredEntriesError } = await admin
      .from("entries")
      // Assets are registered only by validated server RPCs. Never trust paths
      // copied from client-controlled entry metadata for an admin deletion.
      .select("id, assets(bucket_key)")
      .not("expires_at", "is", null)
      .lte("expires_at", now)
      .order("expires_at", { ascending: true })
      .limit(ENTRY_BATCH_SIZE)
      .returns<ExpiringEntry[]>();
    if (expiredEntriesError) throw expiredEntriesError;

    const expiredEntryPaths = unique(
      (expiredEntries ?? []).flatMap((entry) =>
        (entry.assets ?? []).map((asset) => asset.bucket_key),
      ),
    );
    await removeObjects(admin, expiredEntryPaths);

    const expiredEntryIds = (expiredEntries ?? []).map((entry) => entry.id);
    if (expiredEntryIds.length > 0) {
      const { error } = await admin
        .from("entries")
        .delete()
        .in("id", expiredEntryIds);
      if (error) throw error;
    }

    // Entry deletion queues every asset path. This also drains files queued by
    // room deletion and by the database-only expiry safety job.
    const { data: queuedObjects, error: queueError } = await admin
      .from("deleted_storage_keys")
      .select("id, bucket_key")
      .order("id", { ascending: true })
      .limit(QUEUE_BATCH_SIZE)
      .returns<StorageQueueItem[]>();
    if (queueError) throw queueError;

    const queuedPaths = (queuedObjects ?? []).map((item) => item.bucket_key);
    await removeObjects(admin, queuedPaths);

    const queuedIds = (queuedObjects ?? []).map((item) => item.id);
    if (queuedIds.length > 0) {
      const { error } = await admin
        .from("deleted_storage_keys")
        .delete()
        .in("id", queuedIds);
      if (error) throw error;
    }

    // Clear uploads that reached Storage but were never attached to an entry.
    const { data: expiredIntents, error: intentsError } = await admin
      .from("upload_intents")
      .select("path")
      .lt("expires_at", now)
      .order("expires_at", { ascending: true })
      .limit(QUEUE_BATCH_SIZE)
      .returns<Array<{ path: string }>>();
    if (intentsError) throw intentsError;

    const abandonedPaths = (expiredIntents ?? []).map((intent) => intent.path);
    await removeObjects(admin, abandonedPaths);

    if (abandonedPaths.length > 0) {
      const { error } = await admin
        .from("upload_intents")
        .delete()
        .in("path", abandonedPaths);
      if (error) throw error;
    }

    return json({
      ok: true,
      expiredEntries: expiredEntryIds.length,
      expiredEntryObjects: expiredEntryPaths.length,
      queuedObjects: unique(queuedPaths).length,
      abandonedUploads: unique(abandonedPaths).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cleanup error";
    console.error("Extension file cleanup failed", message);
    return json({ error: "Cleanup failed" }, 500);
  }
});
