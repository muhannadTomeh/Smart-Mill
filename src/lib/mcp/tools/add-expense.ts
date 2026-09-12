import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveSeasonId, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "add_expense",
  title: "Add expense",
  description: "Record an expense for a season.",
  inputSchema: {
    amount: z.number().positive().describe("Amount in shekels."),
    category: z.string().trim().min(1).describe("Expense category."),
    description: z.string().trim().optional(),
    season_id: z.string().uuid().optional().describe("Season id. Defaults to the active season."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ amount, category, description, season_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    try {
      const seasonId = await resolveSeasonId(supabase, season_id);
      // Keep MCP-created expenses on the same atomic financial path as the UI.
      // This records the ledger entry, enforces the open cash drawer, and updates
      // the season inventory together.
      const { data, error } = await supabase.rpc("record_expense_v2", {
        p_season_id: seasonId,
        p_category: category,
        p_amount: amount,
        p_description: description || null,
        p_payment_method: "cash",
        p_partner_id: null,
        p_supplier_id: null,
        p_partner_name: null,
        p_creditor_name: null,
      });
      if (error) return errorResult(error.message);
      return textResult({ expense: data, payment_method: "cash" });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
