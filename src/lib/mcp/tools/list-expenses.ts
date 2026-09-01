import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveSeasonId, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_expenses",
  title: "List expenses",
  description: "List expenses recorded for a season, newest first.",
  inputSchema: {
    season_id: z.string().uuid().optional().describe("Season id. Defaults to the active season."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ season_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    try {
      const seasonId = await resolveSeasonId(supabase, season_id);
      const { data, error } = await supabase
        .from("expenses")
        .select("id,amount,category,description,created_at")
        .eq("season_id", seasonId)
        .order("created_at", { ascending: false })
        .limit(limit ?? 50);
      if (error) return errorResult(error.message);
      return textResult({ season_id: seasonId, expenses: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
