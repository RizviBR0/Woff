import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Note: This endpoint should be secured (e.g., using a secret token header) to prevent abuse
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Optional: Verify cron secret if configured
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({ message: "No pending spaces in cleanup queue." });
    }

    const processedIds: number[] = [];
    const results = [];

    // 2. Process each deleted space
    for (const item of queueItems) {
      const spaceId = item.space_id;
      const deletedFiles: string[] = [];
      let hasError = false;

      try {
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;

        // List and delete all files in the bucket for this space ID
        while (hasMore) {
          const { data: fileList, error: listError } = await supabaseAdmin.storage
            .from("files")
            .list(spaceId, { limit: pageSize, offset });

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

          if (fileList.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
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

    return NextResponse.json({
      message: `Processed ${queueItems.length} spaces.`,
      results,
    });
  } catch (error: any) {
    console.error("Cleanup job failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
