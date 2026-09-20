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
      const { data: season, error: seasonError } = await supabase
        .from("seasons")
        .select("mill_id")
        .eq("id", seasonId)
        .single();
      if (seasonError) return errorResult(seasonError.message);

      const [cashResult, oilResult] = await Promise.all([
        // The generated browser schema does not include this canonical SQL view.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("mill_cash_balance")
          .select("cash_balance")
          .eq("season_id", seasonId)
          .eq("mill_id", season.mill_id)
          .maybeSingle(),
        // The generated browser schema does not include this canonical SQL view.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("mill_oil_balance")
          .select("current_balance")
          .eq("season_id", seasonId)
          .eq("mill_id", season.mill_id)
          .maybeSingle(),
      ]);
      if (cashResult.error) return errorResult(cashResult.error.message);
      if (oilResult.error) return errorResult(oilResult.error.message);
      return textResult({
        season_id: seasonId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total_oil: Number((oilResult.data as any)?.current_balance ?? 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total_cash: Number((cashResult.data as any)?.cash_balance ?? 0),
        balance_sources: { oil: "mill_oil_balance", cash: "mill_cash_balance" },
      });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
