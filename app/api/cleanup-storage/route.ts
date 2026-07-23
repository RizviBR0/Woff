import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables" },
      { status: 500 }
    );
  }

  // Create admin client with service role key to bypass RLS and delete files
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Expire inactive non-Pro rooms first. Their delete trigger queues all
    // storage cleanup work processed below in the same invocation.
    const { data: expiredSpaceCount, error: expiryError } = await supabaseAdmin
      .rpc("cleanup_expired_spaces");
    if (expiryError) throw expiryError;

    // 1. Fetch pending deleted spaces from the queue
    const { data: queueItems, error: fetchError } = await supabaseAdmin
      .from("deleted_spaces_queue")
      .select("id, space_id");

    if (fetchError) {
      // If table doesn't exist yet, return helpful error
      if (fetchError.code === "P0001" || fetchError.message.includes("does not exist")) {
        return NextResponse.json(
          { error: "Table deleted_spaces_queue does not exist. Please run the SQL migration first." },
          { status: 400 }
        );
      }
      throw fetchError;
    }

    const processedIds: number[] = [];
    const results = [];

    // 2. Process each deleted space
    for (const item of queueItems || []) {
      const spaceId = item.space_id;
      const deletedFiles: string[] = [];
      let hasError = false;

      try {
        const pageSize = 1000;
        let hasMore = true;

        // List and delete all files in the bucket for this space ID
        while (hasMore) {
          const { data: fileList, error: listError } = await supabaseAdmin.storage
            .from("files")
            .list(spaceId, { limit: pageSize, offset: 0 });

          if (listError) {
            console.error(`Error listing files for space ${spaceId}:`, listError);
            hasError = true;
            break;
          }

          if (!fileList || fileList.length === 0) {
            hasMore = false;
            break;
          }

          const filePaths = fileList.map((f) => `${spaceId}/${f.name}`);
          const { error: removeError } = await supabaseAdmin.storage
            .from("files")
            .remove(filePaths);

          if (removeError) {
            console.error(`Error deleting files for space ${spaceId}:`, removeError);
            hasError = true;
            break;
          }

          deletedFiles.push(...filePaths);

          // Deleting reindexes the directory, so the next page is offset zero.
          if (fileList.length < pageSize) hasMore = false;
        }

        if (!hasError) {
          processedIds.push(item.id);
          results.push({ spaceId, status: "success", deletedCount: deletedFiles.length });
        } else {
          results.push({ spaceId, status: "partial_failure" });
        }
      } catch (err) {
        console.error(`Unexpected error processing space ${spaceId}:`, err);
        results.push({ spaceId, status: "error" });
      }
    }

    // 3. Remove successfully processed spaces from the queue
    if (processedIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("deleted_spaces_queue")
        .delete()
        .in("id", processedIds);

      if (deleteError) {
        console.error("Error clearing processed queue items:", deleteError);
      }
    }

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
      if (removeKeysError) throw removeKeysError;
      const { error: clearKeysError } = await supabaseAdmin
        .from("deleted_storage_keys")
        .delete()
        .in("id", keyItems.map((item) => item.id));
      if (clearKeysError) throw clearKeysError;
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
      if (removeAbandonedError) throw removeAbandonedError;
      const { error: clearIntentError } = await supabaseAdmin
        .from("upload_intents")
        .delete()
        .in("path", paths);
      if (clearIntentError) throw clearIntentError;
      abandonedUploadCount = paths.length;
    }

    return NextResponse.json({
      message: `Expired ${expiredSpaceCount || 0} inactive spaces; processed ${queueItems?.length || 0} storage queues, ${deletedKeyCount} objects, and ${abandonedUploadCount} abandoned uploads.`,
      results,
      expiredSpaceCount: expiredSpaceCount || 0,
      deletedKeyCount,
      abandonedUploadCount,
    });
  } catch (error: any) {
    console.error("Cleanup job failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
