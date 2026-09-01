import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listSeasonsTool from "./tools/list-seasons";
import listQueueTool from "./tools/list-queue";
import addToQueueTool from "./tools/add-to-queue";
import updateQueueStatusTool from "./tools/update-queue-status";
import listCustomersTool from "./tools/list-customers";
import listInvoicesTool from "./tools/list-invoices";
import getInventoryTool from "./tools/get-inventory";
import addExpenseTool from "./tools/add-expense";
import listExpensesTool from "./tools/list-expenses";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "olive-flow-manager",
  title: "olive-flow-manager",
  version: "0.1.0",
  instructions:
    "Tools for the olive mill manager app. Read and manage the mill queue, customers, invoices, expenses, and oil/cash inventory for the signed-in user's seasons. Most tools default to the user's active season when season_id is omitted.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listSeasonsTool,
    listQueueTool,
    addToQueueTool,
    updateQueueStatusTool,
    listCustomersTool,
    listInvoicesTool,
    getInventoryTool,
    addExpenseTool,
    listExpensesTool,
  ],
});
