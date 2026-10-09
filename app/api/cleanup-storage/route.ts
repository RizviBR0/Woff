import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleanupRoomQueue } from "@/lib/storage-cleanup";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: an unset secret must never turn this into a public admin route.
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Cleanup database configuration is unavailable" },
      { status: 503 }
    );
  }

  // Create admin client with service role key to bypass RLS and delete files
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  let failedRoomCount = 0;
  let failedObjectCount = 0;
  let failedReservationCount = 0;

  try {
    // Expire extension uploads first. The database also runs this idempotent
    // function every five minutes so access stops close to the 48-hour mark;
    // this invocation catches up before processing the resulting file queue.
    const { data: expiredEntryCount, error: entryExpiryError } =
      await supabaseAdmin.rpc("cleanup_expired_entries");
    if (entryExpiryError) throw entryExpiryError;

    // Expire rooms with an elapsed owner deadline or legacy inactivity timer. Their delete trigger queues all
    // storage cleanup work processed below in the same invocation.
    const { data: expiredSpaceCount, error: expiryError } = await supabaseAdmin
      .rpc("cleanup_expired_spaces");
    if (expiryError) throw expiryError;

    // 1. Fetch pending deleted spaces from the queue
    const { data: queueItems, error: fetchError } = await supabaseAdmin
      .from("deleted_spaces_queue")
      .select("id, space_id")
      .order("id", { ascending: true })
      .limit(100);

    if (fetchError) {
      throw fetchError;
    }

    // 2/3. Recurse only beneath queued private UUID prefixes. Keep incomplete
    // prefixes queued, including when removing the successful queue rows fails.
    const roomCleanup = await cleanupRoomQueue(
      supabaseAdmin.storage.from("files"),
      queueItems || [],
      async (ids) => await supabaseAdmin.from("deleted_spaces_queue").delete().in("id", ids),
    );
    failedRoomCount = roomCleanup.failedCount;

    // 4. Remove individual objects queued when an entry/note is deleted.
    const { data: keyItems, error: keyFetchError } = await supabaseAdmin
      .from("deleted_storage_keys")
      .select("id, bucket_key")
      .limit(1000);
    if (keyFetchError) throw keyFetchError;

    let deletedKeyCount = 0;
    if (keyItems?.length) {
      const { error: removeKeysError } = await supabaseAdmin.storage
        .from("files")
        .remove(keyItems.map((item) => item.bucket_key));
      if (removeKeysError) {
        failedObjectCount = keyItems.length;
        throw removeKeysError;
      }
      const { error: clearKeysError } = await supabaseAdmin
        .from("deleted_storage_keys")
        .delete()
        .in("id", keyItems.map((item) => item.id));
      if (clearKeysError) {
        failedObjectCount = keyItems.length;
        throw clearKeysError;
      }
      deletedKeyCount = keyItems.length;
    }

    // 5. Expired upload reservations are abandoned uploads. Remove any object
    // that reached Storage but was never atomically attached to an entry.
    const { data: expiredIntents, error: intentFetchError } = await supabaseAdmin
      .from("upload_intents")
      .select("path")
      .lt("expires_at", new Date().toISOString())
      .limit(1000);
    if (intentFetchError) throw intentFetchError;

    let abandonedUploadCount = 0;
    if (expiredIntents?.length) {
      const paths = expiredIntents.map((intent) => intent.path);
      const { error: removeAbandonedError } = await supabaseAdmin.storage
        .from("files")
        .remove(paths);
      if (removeAbandonedError) {
        failedReservationCount = expiredIntents.length;
        throw removeAbandonedError;
      }
      const { error: clearIntentError } = await supabaseAdmin
        .from("upload_intents")
        .delete()
        .in("path", paths);
      if (clearIntentError) {
        failedReservationCount = expiredIntents.length;
        throw clearIntentError;
      }
      abandonedUploadCount = paths.length;
    }

    return NextResponse.json({
      message: `Expired ${expiredEntryCount || 0} extension entries and ${expiredSpaceCount || 0} rooms; processed ${queueItems?.length || 0} storage queues, ${deletedKeyCount} objects, and ${abandonedUploadCount} abandoned uploads.`,
      results: roomCleanup.results,
      expiredEntryCount: expiredEntryCount || 0,
      expiredSpaceCount: expiredSpaceCount || 0,
      deletedKeyCount,
      abandonedUploadCount,
      failedRoomCount,
      failedObjectCount,
      failedReservationCount,
      failedOperationCount: failedRoomCount ? 1 : 0,
    }, { status: failedRoomCount ? 503 : 200 });
  } catch {
    console.error("Storage cleanup incomplete; queued work will be retried.");
    return NextResponse.json({
      error: "Cleanup incomplete. Retry queued work.",
      failedRoomCount,
      failedObjectCount,
      failedReservationCount,
      failedOperationCount: (failedRoomCount ? 1 : 0) + 1,
    }, { status: 503 });
  }
}
