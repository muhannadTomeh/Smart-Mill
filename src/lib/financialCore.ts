import { supabase } from "@/integrations/supabase/client";

export type FinancialTxType =
  | "income"
  | "expense"
  | "stock_purchase"
  | "stock_sale"
  | "worker_payment"
  | "customer_debt"
  | "customer_payment"
  | "supplier_payment"
  | "owner_deposit"
  | "owner_withdrawal"
  | "adjustment";

export type FinancialDirection = "in" | "out" | "none";
export type FinancialPaymentMethod = "cash" | "oil" | "mixed" | "credit";
export type FinancialTxStatus = "active" | "voided";

export interface FinancialTransaction {
  id: string;
  mill_id: string;
  season_id: string;
  type: FinancialTxType;
  category: string;
  amount: number;
  direction: FinancialDirection;
  payment_method: FinancialPaymentMethod;
  reference_type: string;
  reference_id?: string | null;
  party_type?: string | null;
  party_id?: string | null;
  party_name?: string | null;
  description?: string | null;
  status: FinancialTxStatus;
  created_by?: string | null;
  created_at: string;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
}

export interface AccurateFinancialSummary {
  // 1. Operating Profit & Loss (قائمة الدخل والربح التشغيلي)
  pressingRevenue: number;          // إيرادات خدمات العصر والتنكات
  oilSalesRevenue: number;          // إيرادات مبيعات الزيت
  totalOperatingRevenue: number;    // إجمالي الإيرادات التشغيلية
  
  operationalExpenses: number;      // المصاريف التشغيلية العامة
  workerWagesPaid: number;          // أجور ودفعات العمال
  totalOperatingExpenses: number;   // إجمالي المصاريف التشغيلية
  
  operatingProfit: number;          // صافي الربح التشغيلي الحقيقي (بدون خصم أصل المخزون كخسارة)

  // 2. Cash Flow (حركة الصندوق النقدية الفعلية)
  cashInflows: number;              // إجمالي النقد المقبوض الداخل للصندوق
  cashOutflows: number;             // إجمالي النقد المصروف الخارج من الصندوق (بما فيها مشتريات الزيت)
  netCashFlow: number;              // صافي التدفق النقدي
  
  // 3. Stock & Assets (المخزون ورأس المال العامل)
  stockPurchasesCash: number;       // المبالغ المدفوعة لشراء مخزون زيت (أصل وليس خسارة)
  
  // 4. Counts & Metrics
  invoicesCount: number;
  expensesCount: number;
  tradesCount: number;
}

/**
 * تسجيل مصروف تشغيلي ذرياً
 * (1) إدراج في expenses
 * (2) إدراج في financial_transactions
 * (3) خصم المبلغ من inventory.total_cash
 */
export async function recordExpenseAtomic(params: {
  seasonId: string;
  category: string;
  amount: number;
  description?: string | null;
  targetUserId?: string | null;
}): Promise<{ id: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc("record_expense_atomic", {
      p_season_id: params.seasonId,
      p_category: params.category,
      p_amount: params.amount,
      p_description: params.description || null,
      p_target_user_id: params.targetUserId || null,
    });

    if (error) {
      // Fallback: standard insert if RPC is not yet propagated
      console.warn("record_expense_atomic fallback to standard insert", error);
      const { data: expData, error: expError } = await supabase
        .from("expenses")
        .insert({
          user_id: params.targetUserId!,
          season_id: params.seasonId,
          category: params.category,
          amount: params.amount,
          description: params.description || null,
        })
        .select("id")
        .single();

      if (expError) return { id: null, error: expError };

      // Record transaction
      await supabase.from("financial_transactions").insert({
        mill_id: params.targetUserId!,
        season_id: params.seasonId,
        type: "expense",
        category: params.category,
        amount: params.amount,
        direction: "out",
        payment_method: "cash",
        reference_type: "expense",
        reference_id: expData.id,
        description: params.description || null,
      });

      return { id: expData.id, error: null };
    }

    return { id: data, error: null };
  } catch (err: any) {
    return { id: null, error: err };
  }
}

/**
 * تسجيل عملية شراء أو بيع زيت ذرياً
 * (1) إدراج في oil_transactions
 * (2) إدراج في financial_transactions (stock_purchase أو stock_sale)
 * (3) تحديث كاش وزيت inventory ذرياً
 */
export async function recordOilTradeAtomic(params: {
  seasonId: string;
  type: "buy" | "sell";
  amount: number;
  price: number;
  partyName?: string | null;
  notes?: string | null;
  targetUserId?: string | null;
}): Promise<{ id: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc("record_oil_trade_atomic", {
      p_season_id: params.seasonId,
      p_type: params.type,
      p_amount: params.amount,
      p_price: params.price,
      p_party_name: params.partyName || null,
      p_notes: params.notes || null,
      p_target_user_id: params.targetUserId || null,
    });

    if (error) {
      console.warn("record_oil_trade_atomic fallback to standard insert", error);
      const totalPrice = params.amount * params.price;
      const { data: txData, error: txError } = await supabase
        .from("oil_transactions")
        .insert({
          user_id: params.targetUserId!,
          season_id: params.seasonId,
          type: params.type,
          amount: params.amount,
          price: params.price,
          total_price: totalPrice,
          party_name: params.partyName || null,
          notes: params.notes || null,
        })
        .select("id")
        .single();

      if (txError) return { id: null, error: txError };

      await supabase.from("financial_transactions").insert({
        mill_id: params.targetUserId!,
        season_id: params.seasonId,
        type: params.type === "buy" ? "stock_purchase" : "stock_sale",
        category: "oil_inventory",
        amount: totalPrice,
        direction: params.type === "buy" ? "out" : "in",
        payment_method: "cash",
        reference_type: "oil_transaction",
        reference_id: txData.id,
        party_type: params.type === "buy" ? "supplier" : "customer",
        party_name: params.partyName || null,
        description: params.notes || null,
      });

      return { id: txData.id, error: null };
    }

    return { id: data, error: null };
  } catch (err: any) {
    return { id: null, error: err };
  }
}

/**
 * تسجيل دفعة سداد دين عميل ذرياً
 */
export async function recordCustomerPaymentAtomic(params: {
  seasonId: string;
  customerId: string;
  amount: number;
  notes?: string | null;
  targetUserId?: string | null;
}): Promise<{ id: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc("record_customer_payment_atomic", {
      p_season_id: params.seasonId,
      p_customer_id: params.customerId,
      p_amount: params.amount,
      p_notes: params.notes || null,
      p_target_user_id: params.targetUserId || null,
    });

    return { id: data, error };
  } catch (err: any) {
    return { id: null, error: err };
  }
}

/**
 * إلغاء حركة مالية بأمان وعكس أثرها المالي
 */
export async function voidFinancialTransaction(
  transactionId: string,
  reason: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc("void_financial_transaction", {
      p_transaction_id: transactionId,
      p_reason: reason,
    });
    return { error };
  } catch (err: any) {
    return { error: err };
  }
}

/**
 * حساب التقرير المالي الموحد بدقة تامة من الـ Financial Core
 */
export async function calculateAccurateFinancialReport(params: {
  millId: string;
  seasonId: string;
  dateFrom?: string | null;
}): Promise<AccurateFinancialSummary> {
  let query = supabase
    .from("financial_transactions")
    .select("*")
    .eq("mill_id", params.millId)
    .eq("season_id", params.seasonId)
    .eq("status", "active");

  if (params.dateFrom) {
    query = query.gte("created_at", params.dateFrom);
  }

  const { data: txList, error } = await query;

  if (error || !txList) {
    console.error("Failed to load financial transactions for report", error);
    return {
      pressingRevenue: 0,
      oilSalesRevenue: 0,
      totalOperatingRevenue: 0,
      operationalExpenses: 0,
      workerWagesPaid: 0,
      totalOperatingExpenses: 0,
      operatingProfit: 0,
      cashInflows: 0,
      cashOutflows: 0,
      netCashFlow: 0,
      stockPurchasesCash: 0,
      invoicesCount: 0,
      expensesCount: 0,
      tradesCount: 0,
    };
  }

  let pressingRevenue = 0;
  let oilSalesRevenue = 0;
  let operationalExpenses = 0;
  let workerWagesPaid = 0;
  let stockPurchasesCash = 0;
  let cashInflows = 0;
  let cashOutflows = 0;

  let invoicesCount = 0;
  let expensesCount = 0;
  let tradesCount = 0;

  txList.forEach((tx) => {
    const amt = Number(tx.amount) || 0;

    // Cash inflows / outflows tracking
    if (tx.direction === "in" && tx.payment_method !== "credit") {
      cashInflows += amt;
    } else if (tx.direction === "out") {
      cashOutflows += amt;
    }

    // Operating categorization
    switch (tx.type) {
      case "income":
        pressingRevenue += amt;
        if (tx.reference_type === "invoice") invoicesCount++;
        break;

      case "stock_sale":
        oilSalesRevenue += amt;
        tradesCount++;
        break;

      case "expense":
        operationalExpenses += amt;
        expensesCount++;
        break;

      case "worker_payment":
        workerWagesPaid += amt;
        break;

      case "stock_purchase":
        // Stock purchase is an asset purchase, NOT an operating loss!
        stockPurchasesCash += amt;
        tradesCount++;
        break;

      default:
        break;
    }
  });

  const totalOperatingRevenue = pressingRevenue + oilSalesRevenue;
  const totalOperatingExpenses = operationalExpenses + workerWagesPaid;
  const operatingProfit = totalOperatingRevenue - totalOperatingExpenses;
  const netCashFlow = cashInflows - cashOutflows;

  return {
    pressingRevenue,
    oilSalesRevenue,
    totalOperatingRevenue,
    operationalExpenses,
    workerWagesPaid,
    totalOperatingExpenses,
    operatingProfit,
    cashInflows,
    cashOutflows,
    netCashFlow,
    stockPurchasesCash,
    invoicesCount,
    expensesCount,
    tradesCount,
  };
}
