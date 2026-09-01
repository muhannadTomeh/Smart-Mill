import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveSeasonId, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_customers",
  title: "List customers",
  description: "List or search customers of a season by name.",
  inputSchema: {
    search: z.string().trim().optional().describe("Filter by name (partial match)."),
    season_id: z.string().uuid().optional().describe("Season id. Defaults to the active season."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, season_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    try {
      const seasonId = await resolveSeasonId(supabase, season_id);
      let query = supabase
        .from("customers")
        .select("id,name,phone,created_at")
        .eq("season_id", seasonId)
        .order("created_at", { ascending: false })
        .limit(limit ?? 50);
      if (search) query = query.ilike("name", `%${search}%`);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return textResult({ season_id: seasonId, customers: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
