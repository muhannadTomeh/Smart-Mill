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
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          user_id: ctx.getUserId(),
          season_id: seasonId,
          amount,
          category,
          description: description || null,
        })
        .select()
        .single();
      if (error) return errorResult(error.message);
      return textResult({ expense: data });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
