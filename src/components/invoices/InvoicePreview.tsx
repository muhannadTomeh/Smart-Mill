import { Separator } from "@/components/ui/separator";
import { Receipt } from "lucide-react";

export interface InvoicePreviewData {
  customer_name: string;
  oil_produced: number;
  container_count?: number;
  container_type?: string;
  payment_type: "oil" | "cash" | "mixed" | string;
  oil_amount: number;
  cash_amount: number;
  total_display: string;
  created_at?: string;
  notes?: string;
}

const paymentLabel = (type: string) => {
  if (type === "oil") return "دفع بالزيت";
  if (type === "cash") return "دفع نقدي";
  return "دفع مختلط";
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

  return (
    <div className="border rounded-xl p-6 space-y-4 bg-card" dir="rtl">
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">فاتورة {millName}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{dateStr}</p>
      </div>

      <Separator />

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">اسم الزبون:</span>
          <span className="font-medium">{data.customer_name || "—"}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">طريقة الدفع:</span>
          <span className="font-medium">{paymentLabel(data.payment_type)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">إجمالي الزيت المنتج:</span>
          <span className="font-medium">{data.oil_produced} كغم</span>
        </div>

        {data.container_count ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">التنكات:</span>
            <span className="font-medium">
              {data.container_count} ({data.container_type || "—"})
            </span>
          </div>
        ) : null}

        {Number(data.oil_amount) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">مستحق المعصرة (زيت):</span>
            <span className="font-medium">{Number(data.oil_amount).toFixed(2)} كغم</span>
          </div>
        )}

        {Number(data.cash_amount) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">مستحق المعصرة (نقدي):</span>
            <span className="font-medium">{Number(data.cash_amount).toFixed(2)} ₪</span>
          </div>
        )}

        <Separator />

        <div className="flex justify-between text-base font-bold text-primary">
          <span>الإجمالي المستحق:</span>
          <span>{data.total_display}</span>
        </div>

        <div className="flex justify-between text-base font-bold text-foreground">
          <span>صافي الزيت للزبون:</span>
          <span>{netOilForCustomer.toFixed(2)} كغم</span>
        </div>

        {data.notes && (
          <>
            <Separator />
            <div className="text-xs">
              <span className="text-muted-foreground">ملاحظات: </span>
              <span>{data.notes}</span>
            </div>
          </>
        )}
      </div>

      <Separator />
      <p className="text-center text-[11px] text-muted-foreground">
        شكراً لزيارتكم — نتمنى لكم موسماً مباركاً 
      </p>
    </div>
  );
}
