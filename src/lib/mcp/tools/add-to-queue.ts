import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveSeasonId, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "add_to_queue",
  title: "Add customer to queue",
  description: "Add a customer to the end of the mill queue for a season.",
  inputSchema: {
    name: z.string().trim().min(1).describe("Customer name."),
    bags: z.number().int().min(1).describe("Number of olive bags."),
    phone: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    season_id: z.string().uuid().optional().describe("Season id. Defaults to the active season."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, bags, phone, notes, season_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    try {
      const seasonId = await resolveSeasonId(supabase, season_id);
      const { data, error } = await supabase
        .from("queue")
        .insert({
          user_id: ctx.getUserId(),
          season_id: seasonId,
          name,
          bags,
          phone: phone || null,
          notes: notes || null,
          status: "waiting",
        })
        .select()
        .single();
      if (error) return errorResult(error.message);
      return textResult({ entry: data });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
