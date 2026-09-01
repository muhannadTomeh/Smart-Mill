import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveSeasonId, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "get_inventory",
  title: "Get inventory",
  description: "Get the current oil (kg) and cash (₪) balances for a season.",
  inputSchema: {
    season_id: z.string().uuid().optional().describe("Season id. Defaults to the active season."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ season_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    try {
      const seasonId = await resolveSeasonId(supabase, season_id);
      const { data, error } = await supabase
        .from("inventory")
        .select("total_oil,total_cash,updated_at")
        .eq("season_id", seasonId)
        .maybeSingle();
      if (error) return errorResult(error.message);
      return textResult({
        season_id: seasonId,
        total_oil: data?.total_oil ?? 0,
        total_cash: data?.total_cash ?? 0,
        updated_at: data?.updated_at ?? null,
      });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
