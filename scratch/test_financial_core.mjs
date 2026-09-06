/**
 * Test Suite for Smart Mill Financial Core
 * Validates the business logic, equations, profit calculation,
 * cash flow reconciliation, tenant isolation, and audit trail.
 */

function runTests() {
  console.log("=== بدء تشغيل اختبارات الأساس المالي (Financial Core Test Suite) ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ فشل: ${message}`);
      failed++;
    }
  }

  // --- Scenario State Mock ---
  const state = {
    inventory: { total_cash: 1000, total_oil: 50 }, // Starting snapshot
    financialTransactions: [],
    invoices: [],
    expenses: [],
    oilTransactions: [],
    workRecords: [],
    workerPayments: [],
    customerPayments: [],
    dailyClosings: [],
  };

  // Helper functions simulating the Atomic RPCs & Core Logic
  function recordCashInvoice(millId, seasonId, customerId, customerName, oilProduced, cashAmount) {
    const invId = "inv-" + Math.random().toString(36).slice(2, 8);
    state.invoices.push({
      id: invId,
      mill_id: millId,
      season_id: seasonId,
      customer_id: customerId,
      customer_name: customerName,
      oil_produced: oilProduced,
      payment_type: "cash",
      cash_amount: cashAmount,
      oil_amount: 0,
      unpaid_amount: 0,
    });
    // Atomic Financial Transaction
    state.financialTransactions.push({
      id: "tx-" + Math.random().toString(36).slice(2, 8),
      mill_id: millId,
      season_id: seasonId,
      type: "income",
      category: "pressing_revenue",
      amount: cashAmount,
      direction: "in",
      payment_method: "cash",
      reference_type: "invoice",
      reference_id: invId,
      status: "active",
    });
    // Atomic Inventory Update
    state.inventory.total_cash += cashAmount;
    return invId;
  }

  function recordOilInvoice(millId, seasonId, customerId, customerName, oilProduced, oilReturnKg) {
    const invId = "inv-" + Math.random().toString(36).slice(2, 8);
    state.invoices.push({
      id: invId,
      mill_id: millId,
      season_id: seasonId,
      customer_id: customerId,
      customer_name: customerName,
      oil_produced: oilProduced,
      payment_type: "oil",
      cash_amount: 0,
      oil_amount: oilReturnKg,
      unpaid_amount: 0,
    });
    // Oil return increases oil inventory, cash is unaffected
    state.inventory.total_oil += oilReturnKg;
    return invId;
  }

  function recordMixedInvoice(millId, seasonId, customerId, customerName, oilProduced, cashAmount, oilReturnKg) {
    const invId = "inv-" + Math.random().toString(36).slice(2, 8);
    state.invoices.push({
      id: invId,
      mill_id: millId,
      season_id: seasonId,
      customer_id: customerId,
      customer_name: customerName,
      oil_produced: oilProduced,
      payment_type: "mixed",
      cash_amount: cashAmount,
      oil_amount: oilReturnKg,
      unpaid_amount: 0,
    });
    if (cashAmount > 0) {
      state.financialTransactions.push({
        id: "tx-" + Math.random().toString(36).slice(2, 8),
        mill_id: millId,
        season_id: seasonId,
        type: "income",
        category: "pressing_revenue",
        amount: cashAmount,
        direction: "in",
        payment_method: "mixed",
        reference_type: "invoice",
        reference_id: invId,
        status: "active",
      });
      state.inventory.total_cash += cashAmount;
    }
    state.inventory.total_oil += oilReturnKg;
    return invId;
  }

  function recordExpense(millId, seasonId, category, amount, description) {
    const expId = "exp-" + Math.random().toString(36).slice(2, 8);
    state.expenses.push({ id: expId, mill_id: millId, season_id: seasonId, category, amount });
    state.financialTransactions.push({
      id: "tx-" + Math.random().toString(36).slice(2, 8),
      mill_id: millId,
      season_id: seasonId,
      type: "expense",
      category,
      amount,
      direction: "out",
      payment_method: "cash",
      reference_type: "expense",
      reference_id: expId,
      status: "active",
    });
    state.inventory.total_cash -= amount;
    return expId;
  }

  function recordOilTrade(millId, seasonId, type, amountKg, pricePerKg, partyName) {
    const tradeId = "trade-" + Math.random().toString(36).slice(2, 8);
    const totalPrice = amountKg * pricePerKg;
    state.oilTransactions.push({
      id: tradeId,
      mill_id: millId,
      season_id: seasonId,
      type,
      amount: amountKg,
      price: pricePerKg,
      total_price: totalPrice,
      party_name: partyName,
    });
    if (type === "buy") {
      state.financialTransactions.push({
        id: "tx-" + Math.random().toString(36).slice(2, 8),
        mill_id: millId,
        season_id: seasonId,
        type: "stock_purchase",
        category: "oil_inventory",
        amount: totalPrice,
        direction: "out",
        payment_method: "cash",
        reference_type: "oil_transaction",
        reference_id: tradeId,
        party_type: "supplier",
        party_name: partyName,
        status: "active",
      });
      state.inventory.total_cash -= totalPrice;
      state.inventory.total_oil += amountKg;
    } else {
      state.financialTransactions.push({
        id: "tx-" + Math.random().toString(36).slice(2, 8),
        mill_id: millId,
        season_id: seasonId,
        type: "stock_sale",
        category: "oil_inventory",
        amount: totalPrice,
        direction: "in",
        payment_method: "cash",
        reference_type: "oil_transaction",
        reference_id: tradeId,
        party_type: "customer",
        party_name: partyName,
        status: "active",
      });
      state.inventory.total_cash += totalPrice;
      state.inventory.total_oil -= amountKg;
    }
    return tradeId;
  }

  function recordWorkRecord(millId, seasonId, workerId, hours, earnedAmount) {
    const recId = "work-" + Math.random().toString(36).slice(2, 8);
    state.workRecords.push({ id: recId, worker_id: workerId, hours, amount: earnedAmount });
    // Work record represents EARNED entitlement, NOT cash outflow
    return recId;
  }

  function recordWorkerPayment(millId, seasonId, workerId, workerName, amount) {
    const pmtId = "wp-" + Math.random().toString(36).slice(2, 8);
    state.workerPayments.push({ id: pmtId, worker_id: workerId, amount });
    state.financialTransactions.push({
      id: "tx-" + Math.random().toString(36).slice(2, 8),
      mill_id: millId,
      season_id: seasonId,
      type: "worker_payment",
      category: "wages",
      amount,
      direction: "out",
      payment_method: "cash",
      reference_type: "worker_payment",
      reference_id: pmtId,
      party_type: "worker",
      party_id: workerId,
      party_name: workerName,
      status: "active",
    });
    state.inventory.total_cash -= amount;
    return pmtId;
  }

  function recordCustomerDebtInvoice(millId, seasonId, customerId, customerName, oilProduced, totalFee, unpaidAmount) {
    const invId = "inv-" + Math.random().toString(36).slice(2, 8);
    const paidCash = totalFee - unpaidAmount;
    state.invoices.push({
      id: invId,
      mill_id: millId,
      season_id: seasonId,
      customer_id: customerId,
      customer_name: customerName,
      oil_produced: oilProduced,
      payment_type: "cash",
      cash_amount: totalFee,
      unpaid_amount: unpaidAmount,
    });
    if (paidCash > 0) {
      state.financialTransactions.push({
        id: "tx-" + Math.random().toString(36).slice(2, 8),
        mill_id: millId,
        season_id: seasonId,
        type: "income",
        category: "pressing_revenue",
        amount: paidCash,
        direction: "in",
        payment_method: "cash",
        reference_type: "invoice",
        reference_id: invId,
        status: "active",
      });
      state.inventory.total_cash += paidCash;
    }
    return invId;
  }

  function recordCustomerPayment(millId, seasonId, customerId, customerName, amount, notes) {
    const pmtId = "cp-" + Math.random().toString(36).slice(2, 8);
    state.customerPayments.push({ id: pmtId, customer_id: customerId, amount, notes });
    state.financialTransactions.push({
      id: "tx-" + Math.random().toString(36).slice(2, 8),
      mill_id: millId,
      season_id: seasonId,
      type: "customer_payment",
      category: "debt_settlement",
      amount,
      direction: "in",
      payment_method: "cash",
      reference_type: "customer_payment",
      reference_id: pmtId,
      party_type: "customer",
      party_id: customerId,
      party_name: customerName,
      status: "active",
    });
    state.inventory.total_cash += amount;
    return pmtId;
  }

  function voidTransaction(txId, reason) {
    const tx = state.financialTransactions.find(t => t.id === txId);
    if (!tx) throw new Error("Transaction not found");
    tx.status = "voided";
    tx.void_reason = reason;
    // Reversal of inventory balance
    if (tx.direction === "in") {
      state.inventory.total_cash -= tx.amount;
    } else if (tx.direction === "out") {
      state.inventory.total_cash += tx.amount;
    }
  }

  function computeFinancialReport(millId, seasonId) {
    const activeTx = state.financialTransactions.filter(
      t => t.mill_id === millId && t.season_id === seasonId && t.status === "active"
    );

    let pressingRevenue = 0;
    let oilSalesRevenue = 0;
    let operationalExpenses = 0;
    let workerWagesPaid = 0;
    let stockPurchasesCash = 0;
    let customerPaymentsCollected = 0;
    let cashInflows = 0;
    let cashOutflows = 0;

    activeTx.forEach(tx => {
      const amt = tx.amount;
      if (tx.direction === "in") cashInflows += amt;
      if (tx.direction === "out") cashOutflows += amt;

      switch (tx.type) {
        case "income":
          pressingRevenue += amt;
          break;
        case "stock_sale":
          oilSalesRevenue += amt;
          break;
        case "expense":
          operationalExpenses += amt;
          break;
        case "worker_payment":
          workerWagesPaid += amt;
          break;
        case "stock_purchase":
          // Crucial: Stock purchase is an asset purchase, NOT operating expense!
          stockPurchasesCash += amt;
          break;
        case "customer_payment":
          customerPaymentsCollected += amt;
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
      stockPurchasesCash,
      customerPaymentsCollected,
      cashInflows,
      cashOutflows,
      netCashFlow,
    };
  }

  const MILL_A = "mill-alpha-111";
  const MILL_B = "mill-beta-222";
  const SEASON_1 = "season-2025";
  const SEASON_2 = "season-2026";

  console.log("--- 1. اختبار فاتورة عصر نقدية ---");
  const initCash = state.inventory.total_cash;
  recordCashInvoice(MILL_A, SEASON_1, "c1", "أحمد علي", 100, 150);
  assert(state.inventory.total_cash === initCash + 150, "الكاش زاد بـ 150 شيكل بدقة");
  assert(state.inventory.total_oil === 50, "مخزون الزيت لم يتغير في الفاتورة النقدية");

  console.log("\n--- 2. اختبار فاتورة رد زيت (عيني) ---");
  const cashBeforeOilInv = state.inventory.total_cash;
  const oilBeforeOilInv = state.inventory.total_oil;
  recordOilInvoice(MILL_A, SEASON_1, "c2", "خالد عمر", 200, 12);
  assert(state.inventory.total_cash === cashBeforeOilInv, "الكاش لم يتغير في فاتورة رد الزيت (فصل الكاش عن الزيت)");
  assert(state.inventory.total_oil === oilBeforeOilInv + 12, "مخزون الزيت زاد بـ 12 كغم رد معصرة");

  console.log("\n--- 3. اختبار فاتورة مختلطة (كاش + زيت) ---");
  const cashBeforeMixed = state.inventory.total_cash;
  const oilBeforeMixed = state.inventory.total_oil;
  recordMixedInvoice(MILL_A, SEASON_1, "c3", "سامر زيد", 300, 50, 8);
  assert(state.inventory.total_cash === cashBeforeMixed + 50, "الكاش زاد بالمبلغ النقدي فقط (50 ₪)");
  assert(state.inventory.total_oil === oilBeforeMixed + 8, "الزيت زاد بكمية الرد العيني فقط (8 كغم)");

  console.log("\n--- 4. اختبار إضافة مصروف تشغيلي ---");
  const cashBeforeExp = state.inventory.total_cash;
  recordExpense(MILL_A, SEASON_1, "صيانة", 70, "صيانة فلاتر");
  assert(state.inventory.total_cash === cashBeforeExp - 70, "تم خصم المصروف من الكاش ذرياً");

  console.log("\n--- 5. اختبار شراء مخزون زيت (أصل وليس خسارة) ---");
  const cashBeforeBuy = state.inventory.total_cash;
  const oilBeforeBuy = state.inventory.total_oil;
  recordOilTrade(MILL_A, SEASON_1, "buy", 20, 25, "مورد زيت أبو حسن");
  assert(state.inventory.total_cash === cashBeforeBuy - 500, "خرج 500 شيكل لشراء الزيت");
  assert(state.inventory.total_oil === oilBeforeBuy + 20, "زاد مخزون الزيت بـ 20 كغم");

  console.log("\n--- 6. اختبار بيع مخزون زيت ---");
  const cashBeforeSell = state.inventory.total_cash;
  const oilBeforeSell = state.inventory.total_oil;
  recordOilTrade(MILL_A, SEASON_1, "sell", 10, 30, "مشتري تجاري");
  assert(state.inventory.total_cash === cashBeforeSell + 300, "دخل 300 شيكل من بيع الزيت");
  assert(state.inventory.total_oil === oilBeforeSell - 10, "نقص مخزون الزيت بـ 10 كغم");

  console.log("\n--- 7. اختبار استحقاق عمل عامل مقابل دفع الأجر ---");
  recordWorkRecord(MILL_A, SEASON_1, "w1", 10, 200); // Earned 200
  const cashBeforeWorkerPay = state.inventory.total_cash;
  recordWorkerPayment(MILL_A, SEASON_1, "w1", "محمود العامل", 120); // Paid 120
  assert(state.inventory.total_cash === cashBeforeWorkerPay - 120, "تم صرف 120 شيكل دفعة للعامل");

  console.log("\n--- 8. اختبار تسجيل دين عميل وتحصيله (ذمم الزبائن) ---");
  const cashBeforeDebt = state.inventory.total_cash;
  recordCustomerDebtInvoice(MILL_A, SEASON_1, "c4", "يوسف الدائن", 150, 100, 100); // 100 unpaid
  assert(state.inventory.total_cash === cashBeforeDebt, "الفاتورة الآجلة لم تُدخل كاش وهمي للصندوق");
  
  // Later collection:
  recordCustomerPayment(MILL_A, SEASON_1, "c4", "يوسف الدائن", 60, "سداد دفعة تحت الحساب");
  assert(state.inventory.total_cash === cashBeforeDebt + 60, "سداد الدين أدخل 60 شيكل كاش حقيقي للصندوق");

  console.log("\n--- 9. اختبار صحة معادلة الربح التشغيلي vs التدفق النقدي ---");
  const report = computeFinancialReport(MILL_A, SEASON_1);
  console.log("  -> إجمالي الإيرادات التشغيلية:", report.totalOperatingRevenue, "₪ (عصر 200 + مبيعات زيت 300)");
  console.log("  -> إجمالي المصروفات التشغيلية:", report.totalOperatingExpenses, "₪ (مصاريف 70 + أجور 120)");
  console.log("  -> صافي الربح التشغيلي الحقيقي:", report.operatingProfit, "₪");
  console.log("  -> مشتريات مخزون الزيت:", report.stockPurchasesCash, "₪ (أصل رأس مال، لم يخصم كخسارة تشغيلية)");
  console.log("  -> صافي التدفق النقدي للصندوق:", report.netCashFlow, "₪");

  assert(report.totalOperatingRevenue === 500, "الإيراد التشغيلي = 200 (عصر) + 300 (بيع زيت) = 500");
  assert(report.totalOperatingExpenses === 190, "المصروف التشغيلي = 70 (صيانة) + 120 (أجور) = 190");
  assert(report.operatingProfit === 310, "الربح التشغيلي = 500 - 190 = 310 شيكل (شراء المخزون لم يُعتبر خسارة)");
  assert(report.stockPurchasesCash === 500, "مشتريات الزيت 500 شيكل محفوظة كأصل مخزون منفصل");

  console.log("\n--- 10. اختبار الإغلاق اليومي ومطابقة الصندوق ---");
  const expectedCashAtClosing = state.inventory.total_cash;
  const countedCash = expectedCashAtClosing - 10; // عجز 10 شيكل
  const closingDifference = countedCash - expectedCashAtClosing; // -10
  assert(closingDifference === -10, "تم كشف عجز الصندوق بدقة (-10 ₪)");
  
  // Record adjustment transaction
  state.financialTransactions.push({
    id: "tx-closing-adj",
    mill_id: MILL_A,
    season_id: SEASON_1,
    type: "adjustment",
    category: "cash_reconciliation",
    amount: 10,
    direction: "out",
    payment_method: "cash",
    reference_type: "daily_closing",
    status: "active",
  });
  state.inventory.total_cash += closingDifference;
  assert(state.inventory.total_cash === countedCash, "تم تعديل رصيد الصندوق بعد الإغلاق ليطابق الجرد الفعلي");

  console.log("\n--- 11. اختبار إلغاء حركة مالية (Void / Auditability) ---");
  const expToVoid = state.financialTransactions.find(t => t.type === "expense");
  const cashBeforeVoid = state.inventory.total_cash;
  voidTransaction(expToVoid.id, "خطأ في تسجيل المصروف المكرر");
  assert(expToVoid.status === "voided", "تم وسم الحركة كـ voided مع سبب الإلغاء بدون حذف السجل من قاعدة البيانات");
  assert(state.inventory.total_cash === cashBeforeVoid + expToVoid.amount, "تم عكس الأثر المالي في الكاش بدقة");

  console.log("\n--- 12. اختبار عزل المعاصر (Multi-Tenant Isolation) ---");
  recordCashInvoice(MILL_B, SEASON_1, "cb1", "زبون معصرة أخرى", 50, 80);
  const reportMillA = computeFinancialReport(MILL_A, SEASON_1);
  const reportMillB = computeFinancialReport(MILL_B, SEASON_1);
  assert(reportMillB.pressingRevenue === 80, "معصرة B سجلت إيرادها الخاص (80 ₪)");
  assert(reportMillA.pressingRevenue === 200, "معصرة A لم تتأثر إطلاقاً بحركات معصرة B (عزل تام)");

  console.log("\n--- 13. اختبار عزل المواسم (Season Isolation) ---");
  recordCashInvoice(MILL_A, SEASON_2, "c_s2", "زبون الموسم القادم", 50, 95);
  const reportSeason1 = computeFinancialReport(MILL_A, SEASON_1);
  const reportSeason2 = computeFinancialReport(MILL_A, SEASON_2);
  assert(reportSeason2.pressingRevenue === 95, "الموسم الجديد سجل إيراده المستقل (95 ₪)");
  assert(reportSeason1.pressingRevenue === 200, "الموسم السابق لم يتأثر بإيراد الموسم الجديد");

  console.log("\n=======================================================");
  console.log(`نتائج الاختبارات: ${passed} اجتياز | ${failed} إخفاق`);
  if (failed === 0) {
    console.log("✓ جميع سيناريوهات الأساس المالي (Financial Core) تعمل بنجاح 100%!");
  } else {
    process.exit(1);
  }
}

runTests();
