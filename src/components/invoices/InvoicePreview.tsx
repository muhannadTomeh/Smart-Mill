import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Receipt, Printer } from "lucide-react";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";

export interface InvoicePreviewData {
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

const paymentLabel = (type: string) => {
  if (type === "oil") return "دفع بالزيت (رد عيني)";
  if (type === "cash") return "دفع نقدي (رد كاش)";
  return "دفع مختلط (زيت + كاش)";
};

interface Props {
  data: InvoicePreviewData;
  millName?: string;
}

export function InvoicePreview({ data, millName = "المعصرة الذكية" }: Props) {
  const dateStr = data.created_at
    ? new Date(data.created_at).toLocaleString("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleDateString("ar-SA");

  const netOilForCustomer = Math.max(0, data.oil_produced - Number(data.oil_amount || 0));

  const handlePrint = () => {
    printThermalReceipt(data, millName);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="border border-border/80 rounded-2xl p-5 space-y-4 bg-card shadow-sm">
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">فاتورة {millName}</h2>
          </div>
          {data.season_name && (
            <p className="text-xs font-medium text-muted-foreground">موسم: {data.season_name}</p>
          )}
          <p className="text-[11px] text-muted-foreground">{dateStr}</p>
        </div>

        <Separator className="border-dashed" />

        <div className="space-y-2.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">اسم المزارع:</span>
            <span className="font-bold text-foreground text-base">{data.customer_name || "—"}</span>
          </div>

          {data.customer_phone && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">رقم الهاتف:</span>
              <span className="font-medium text-foreground">{data.customer_phone}</span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">طريقة السداد:</span>
            <span className="font-medium">{paymentLabel(data.payment_type)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">إجمالي الزيت المعصور:</span>
            <span className="font-bold text-foreground">{data.oil_produced} كغم</span>
          </div>

          {data.container_count ? (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">التنكات والعبوات:</span>
              <span className="font-medium">
                {data.container_count} ({data.container_type || "عبوة"})
              </span>
            </div>
          ) : null}

          {Number(data.oil_amount) > 0 && (
            <div className="flex justify-between items-center text-amber-700 dark:text-amber-400">
              <span>مستحق المعصرة (رد زيت):</span>
              <span className="font-bold">{Number(data.oil_amount).toFixed(2)} كغم</span>
            </div>
          )}

          {Number(data.cash_amount) > 0 && (
            <div className="flex justify-between items-center text-primary">
              <span>مستحق المعصرة (نقدي):</span>
              <span className="font-bold">{Number(data.cash_amount).toFixed(2)} ₪</span>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center space-y-0.5">
            <div className="text-xs text-muted-foreground font-medium">صافي الزيت المستلم للمزارع</div>
            <div className="text-2xl font-black text-primary">{netOilForCustomer.toFixed(2)} كغم</div>
          </div>

          <div className="flex justify-between items-center text-base font-bold pt-1">
            <span className="text-foreground">المبلغ الإجمالي المستحق:</span>
            <span className="text-primary text-lg">{data.total_display}</span>
          </div>

          {data.notes && (
            <>
              <Separator className="border-dashed" />
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold">ملاحظات: </span>
                <span>{data.notes}</span>
              </div>
            </>
          )}
        </div>

        <Separator className="border-dashed" />
        <p className="text-center text-[11px] text-muted-foreground">
          شكراً لزيارتكم — نتمنى لكم موسماً مباركاً 🫒
        </p>
      </div>

      <Button 
        onClick={handlePrint} 
        className="w-full h-11 text-base font-semibold gap-2 shadow-md hover:shadow-lg transition-all"
      >
        <Printer className="h-5 w-5" />
        طباعة الإيصال الحراري (80mm)
      </Button>
    </div>
  );
}

