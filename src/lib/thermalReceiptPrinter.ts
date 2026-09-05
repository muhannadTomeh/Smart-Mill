export interface ThermalReceiptData {
  invoice_number?: string | number;
  customer_name: string;
  customer_phone?: string | null;
  oil_produced: number;
  container_count?: number;
  container_type?: string;
  payment_type: "oil" | "cash" | "mixed" | string;
  oil_amount: number;
  cash_amount: number;
  total_display: string;
  created_at?: string;
  notes?: string;
  season_name?: string;
}

export interface ThermalZReportData {
  report_number?: string | number;
  closing_date: string;
  season_name?: string;
  cashier_name: string;
  opening_cash: number;
  // Inflows
  invoices_cash: number;
  invoices_count: number;
  oil_sales_cash: number;
  total_inflows: number;
  // Outflows
  expenses_cash: number;
  oil_purchases_cash: number;
  worker_payments_cash: number;
  total_outflows: number;
  // Reconciliation
  net_movement: number;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  notes?: string;
}

const paymentTypeArabic = (type: string) => {
  if (type === "oil") return "دفع بالزيت (رد عيني)";
  if (type === "cash") return "دفع نقدي (رد كاش)";
  return "دفع مختلط (زيت + كاش)";
};

function printHtmlViaIframe(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    console.error("Failed to access print iframe document");
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Printing failed:", e);
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  }, 250);
}

export function printThermalReceipt(data: ThermalReceiptData, millName = "المعصرة الذكية") {
  const dateObj = data.created_at ? new Date(data.created_at) : new Date();
  const formattedDate = dateObj.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const formattedTime = dateObj.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const netOilForCustomer = Math.max(0, data.oil_produced - Number(data.oil_amount || 0));

  const receiptHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>إيصال - ${millName}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, -apple-system, BlinkMacSystemFont;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: 78mm;
      max-width: 78mm;
      margin: 0 auto;
      padding: 3mm 2mm 8mm 2mm;
      font-size: 12px;
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .bold { font-weight: 700; }
    
    .header {
      text-align: center;
      padding-bottom: 4px;
    }
    .mill-title {
      font-size: 17px;
      font-weight: 900;
      letter-spacing: -0.5px;
      margin-bottom: 2px;
    }
    .subtitle {
      font-size: 11px;
      color: #333;
    }
    
    .divider {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    .divider-double {
      border-top: 2px solid #000;
      margin: 6px 0;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5px 0;
      font-size: 11.5px;
    }
    .info-label {
      color: #333;
    }
    .info-value {
      font-weight: 600;
      text-align: left;
    }

    .highlight-box {
      border: 1.5px solid #000;
      padding: 4px 6px;
      margin: 5px 0;
      border-radius: 4px;
      text-align: center;
    }
    .highlight-label {
      font-size: 11px;
      font-weight: 600;
    }
    .highlight-val {
      font-size: 16px;
      font-weight: 900;
      margin-top: 1px;
    }

    .total-section {
      background: #f0f0f0;
      border: 1px solid #ddd;
      padding: 4px 6px;
      border-radius: 4px;
      margin: 5px 0;
    }

    .footer {
      text-align: center;
      margin-top: 8px;
      font-size: 10.5px;
      color: #444;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="mill-title">🫒 ${millName}</div>
    ${data.season_name ? `<div class="subtitle">موسم: ${data.season_name}</div>` : ''}
    <div class="subtitle">إيصال عصر الزيتون</div>
  </div>

  <div class="divider"></div>

  <div class="info-row">
    <span class="info-label">التاريخ:</span>
    <span class="info-value">${formattedDate} - ${formattedTime}</span>
  </div>
  ${data.invoice_number ? `
  <div class="info-row">
    <span class="info-label">رقم الإيصال:</span>
    <span class="info-value">#${data.invoice_number}</span>
  </div>` : ''}
  <div class="info-row">
    <span class="info-label">اسم المزارع:</span>
    <span class="info-value bold" style="font-size: 13px;">${data.customer_name || "زبون نقدي"}</span>
  </div>
  ${data.customer_phone ? `
  <div class="info-row">
    <span class="info-label">رقم الهاتف:</span>
    <span class="info-value">${data.customer_phone}</span>
  </div>` : ''}

  <div class="divider"></div>

  <div class="info-row">
    <span class="info-label">إجمالي الزيت المعصور:</span>
    <span class="info-value bold">${Number(data.oil_produced).toFixed(2)} كغم</span>
  </div>

  ${data.container_count ? `
  <div class="info-row">
    <span class="info-label">التنكات (${data.container_type || "عبوات"}):</span>
    <span class="info-value">${data.container_count} عبوة</span>
  </div>` : ''}

  <div class="info-row">
    <span class="info-label">طريقة السداد:</span>
    <span class="info-value">${paymentTypeArabic(data.payment_type)}</span>
  </div>

  ${Number(data.oil_amount) > 0 ? `
  <div class="info-row">
    <span class="info-label">مستحق المعصرة (رد زيت):</span>
    <span class="info-value bold">${Number(data.oil_amount).toFixed(2)} كغم</span>
  </div>` : ''}

  ${Number(data.cash_amount) > 0 ? `
  <div class="info-row">
    <span class="info-label">مستحق المعصرة (نقدي):</span>
    <span class="info-value bold">${Number(data.cash_amount).toFixed(2)} ₪</span>
  </div>` : ''}

  <!-- صافي الزيت المستلم للزبون -->
  <div class="highlight-box">
    <div class="highlight-label">صافي الزيت للزبون</div>
    <div class="highlight-val">${netOilForCustomer.toFixed(2)} كغم زيت</div>
  </div>

  <!-- المبلغ الإجمالي المستحق -->
  <div class="total-section">
    <div class="info-row" style="font-size: 13px;">
      <span class="info-label bold">الإجمالي المستحق:</span>
      <span class="info-value bold">${data.total_display}</span>
    </div>
  </div>

  ${data.notes ? `
  <div class="info-row" style="font-size: 10px; margin-top: 3px;">
    <span class="info-label">ملاحظات:</span>
    <span class="info-value">${data.notes}</span>
  </div>` : ''}

  <div class="divider-double"></div>

  <div class="footer">
    <div>شكراً لزيارتكم ونتمنى لكم موسماً مباركاً</div>
    <div style="font-size: 9px; margin-top: 3px; color: #777;">نظام المعصرة الذكية</div>
  </div>
</body>
</html>
  `;

  printHtmlViaIframe(receiptHtml);
}

export function printThermalZReport(data: ThermalZReportData, millName = "المعصرة الذكية") {
  const dateObj = data.closing_date ? new Date(data.closing_date) : new Date();
  const formattedDate = dateObj.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const formattedTime = dateObj.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const diffStatus = 
    Math.abs(data.difference) < 0.01 
      ? "مطابق تماماً (0 ₪)" 
      : data.difference > 0 
      ? `فائض (+${data.difference.toFixed(2)} ₪)` 
      : `عجز (${data.difference.toFixed(2)} ₪)`;

  const zReportHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تقرير Z - إغلاق الصندوق - ${millName}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, -apple-system, BlinkMacSystemFont;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: 78mm;
      max-width: 78mm;
      margin: 0 auto;
      padding: 3mm 2mm 8mm 2mm;
      font-size: 11.5px;
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    .text-center { text-align: center; }
    .bold { font-weight: 700; }
    
    .header {
      text-align: center;
      padding-bottom: 4px;
    }
    .mill-title {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: -0.5px;
      margin-bottom: 2px;
    }
    .report-title {
      font-size: 13px;
      font-weight: 800;
      background: #000;
      color: #fff;
      display: inline-block;
      padding: 2px 10px;
      border-radius: 3px;
      margin: 3px 0;
    }
    .subtitle {
      font-size: 11px;
      color: #333;
    }
    
    .divider {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    .divider-double {
      border-top: 2px solid #000;
      margin: 6px 0;
    }

    .section-title {
      font-weight: 800;
      font-size: 12px;
      margin: 4px 0 2px 0;
      text-decoration: underline;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5px 0;
    }
    .info-label {
      color: #333;
    }
    .info-value {
      font-weight: 600;
      text-align: left;
    }

    .summary-box {
      border: 1.5px solid #000;
      padding: 5px 6px;
      margin: 6px 0;
      border-radius: 4px;
      background: #fafafa;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      padding: 2px 0;
    }

    .difference-box {
      border: 2px solid #000;
      padding: 4px;
      margin: 6px 0;
      text-align: center;
      font-size: 13px;
      font-weight: 900;
    }

    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 14px;
      padding-top: 6px;
      border-top: 1px dashed #777;
    }
    .sig-col {
      text-align: center;
      width: 48%;
      font-size: 10.5px;
    }
    .sig-line {
      margin-top: 18px;
      border-top: 1px solid #000;
    }

    .footer {
      text-align: center;
      margin-top: 10px;
      font-size: 9.5px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="mill-title">🫒 ${millName}</div>
    ${data.season_name ? `<div class="subtitle">موسم: ${data.season_name}</div>` : ''}
    <div class="report-title">تقرير Z — إغلاق الصندوق</div>
    ${data.report_number ? `<div class="subtitle">رقم التقرير: #${data.report_number}</div>` : ''}
  </div>

  <div class="divider"></div>

  <div class="info-row">
    <span class="info-label">تاريخ ووقت الإغلاق:</span>
    <span class="info-value">${formattedDate} - ${formattedTime}</span>
  </div>
  <div class="info-row">
    <span class="info-label">مسؤول الصندوق/الكاشير:</span>
    <span class="info-value bold">${data.cashier_name}</span>
  </div>

  <div class="divider"></div>

  <!-- المقبوضات النقدية -->
  <div class="section-title">المقبوضات النقدية (+)</div>
  <div class="info-row">
    <span class="info-label">فواتير العصر (${data.invoices_count} فاتورة):</span>
    <span class="info-value">${data.invoices_cash.toFixed(2)} ₪</span>
  </div>
  <div class="info-row">
    <span class="info-label">مبيعات الزيت النقدية:</span>
    <span class="info-value">${data.oil_sales_cash.toFixed(2)} ₪</span>
  </div>
  <div class="info-row bold" style="border-top: 1px dashed #ccc; margin-top: 2px; padding-top: 2px;">
    <span>إجمالي المقبوضات:</span>
    <span>+${data.total_inflows.toFixed(2)} ₪</span>
  </div>

  <div class="divider"></div>

  <!-- المدفوعات النقدية -->
  <div class="section-title">المدفوعات والمصروفات النقدية (-)</div>
  <div class="info-row">
    <span class="info-label">المصاريف التشغيلية:</span>
    <span class="info-value">${data.expenses_cash.toFixed(2)} ₪</span>
  </div>
  <div class="info-row">
    <span class="info-label">مشتريات الزيت النقدية:</span>
    <span class="info-value">${data.oil_purchases_cash.toFixed(2)} ₪</span>
  </div>
  <div class="info-row">
    <span class="info-label">دفعات وأجور العمال:</span>
    <span class="info-value">${data.worker_payments_cash.toFixed(2)} ₪</span>
  </div>
  <div class="info-row bold" style="border-top: 1px dashed #ccc; margin-top: 2px; padding-top: 2px;">
    <span>إجمالي المدفوعات:</span>
    <span>-${data.total_outflows.toFixed(2)} ₪</span>
  </div>

  <div class="divider-double"></div>

  <!-- مطابقة الصندوق -->
  <div class="summary-box">
    <div class="summary-row">
      <span>الرصيد الافتتاحي (العهدة):</span>
      <span class="bold">${data.opening_cash.toFixed(2)} ₪</span>
    </div>
    <div class="summary-row">
      <span>صافي حركة الوردية:</span>
      <span class="bold">${data.net_movement >= 0 ? `+${data.net_movement.toFixed(2)}` : data.net_movement.toFixed(2)} ₪</span>
    </div>
    <div class="divider" style="margin: 3px 0;"></div>
    <div class="summary-row" style="font-size: 13px;">
      <span class="bold">النقد المفترض بالدرج:</span>
      <span class="bold" style="font-size: 14px;">${data.expected_cash.toFixed(2)} ₪</span>
    </div>
    <div class="summary-row" style="font-size: 13px;">
      <span class="bold">النقد الفعلي المعدود:</span>
      <span class="bold" style="font-size: 14px;">${data.actual_cash.toFixed(2)} ₪</span>
    </div>
  </div>

  <div class="difference-box">
    حالة المطابقة: ${diffStatus}
  </div>

  ${data.notes ? `
  <div class="info-row" style="font-size: 10px; margin-top: 3px;">
    <span class="info-label">ملاحظات:</span>
    <span class="info-value">${data.notes}</span>
  </div>` : ''}

  <!-- التواقيع -->
  <div class="signatures">
    <div class="sig-col">
      <div>توقيع الكاشير</div>
      <div class="sig-line"></div>
    </div>
    <div class="sig-col">
      <div>توقيع الإدارة / المحاسب</div>
      <div class="sig-line"></div>
    </div>
  </div>

  <div class="footer">
    <div>تم إغلاق الصندوق وترحيل الحسابات بنجاح</div>
    <div>نظام المعصرة الذكية — Z-Report POS</div>
  </div>
</body>
</html>
  `;

  printHtmlViaIframe(zReportHtml);
}
