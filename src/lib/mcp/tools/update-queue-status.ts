import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "update_queue_status",
  title: "Update queue status",
  description: "Change a queue entry's status to waiting, processing, or completed.",
  inputSchema: {
    queue_id: z.string().uuid().describe("Queue entry id."),
    status: z.enum(["waiting", "processing", "completed"]),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ queue_id, status }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("queue")
      .update({ status })
      .eq("id", queue_id)
      .select()
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Queue entry not found.");
    return textResult({ entry: data });
  },
});
