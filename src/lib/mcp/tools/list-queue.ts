import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveSeasonId, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_queue",
  title: "List queue",
  description: "List customers in the mill queue for a season (waiting, processing, completed).",
  inputSchema: {
    season_id: z.string().uuid().optional().describe("Season id. Defaults to the active season."),
    status: z.enum(["waiting", "processing", "completed"]).optional().describe("Filter by queue status."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ season_id, status }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    try {
      const seasonId = await resolveSeasonId(supabase, season_id);
      let query = supabase
        .from("queue")
        .select("id,name,bags,phone,notes,position,status,created_at")
        .eq("season_id", seasonId)
        .order("position", { ascending: true });
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return textResult({ season_id: seasonId, queue: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
