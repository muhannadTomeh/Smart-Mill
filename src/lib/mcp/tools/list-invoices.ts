import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveSeasonId, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_invoices",
  title: "List invoices",
  description: "List invoices for a season, newest first.",
  inputSchema: {
    season_id: z.string().uuid().optional().describe("Season id. Defaults to the active season."),
    limit: z.number().int().min(1).max(200).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ season_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    try {
      const seasonId = await resolveSeasonId(supabase, season_id);
      const { data, error } = await supabase
        .from("invoices")
        .select("id,customer_name,oil_produced,oil_amount,cash_amount,payment_type,container_type,container_count,total_display,created_at")
        .eq("season_id", seasonId)
        .order("created_at", { ascending: false })
        .limit(limit ?? 25);
      if (error) return errorResult(error.message);
      return textResult({ season_id: seasonId, invoices: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
