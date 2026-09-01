import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_seasons",
  title: "List seasons",
  description: "List the olive mill seasons owned by the signed-in user, including pricing settings.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("seasons")
      .select("id,name,status,start_date,end_date,return_percent,oil_buy_price,oil_sell_price,cash_return_cost,plastic_container_price,metal_container_price")
      .order("created_at", { ascending: false });
    if (error) return errorResult(error.message);
    return textResult({ seasons: data ?? [] });
  },
});
