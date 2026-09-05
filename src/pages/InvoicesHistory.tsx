import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";
import { 
  FileText, Search, Calendar, Eye, Printer, Filter, 
  Receipt, Droplets, Wallet, Layers, ArrowUpDown
} from "lucide-react";

interface InvoiceRecord {
  id: string;
  customer_name: string;
  oil_produced: number;
  container_count: number;
  container_type: string;
  payment_type: string;
  oil_amount: number;
  cash_amount: number;
  total_display: string;
  created_at: string;
  notes?: string | null;
}

export default function InvoicesHistory() {
  const { user, effectiveUserId, profile } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { activeSeason } = useSeason();

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);

  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";

  const fetchInvoices = async () => {
    if (!targetUserId || !activeSeason) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("season_id", activeSeason.id)
        .order("created_at", { ascending: false });
      setInvoices((data as InvoiceRecord[]) || []);
    } catch (err) {
      console.error("Error fetching invoices:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (targetUserId && activeSeason) {
      fetchInvoices();
    }
  }, [targetUserId, activeSeason]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch = !searchTerm || inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase().trim());
      const matchesFilter = paymentFilter === "all" || inv.payment_type === paymentFilter;
      return matchesSearch && matchesFilter;
    });
  }, [invoices, searchTerm, paymentFilter]);

  const totals = useMemo(() => {
    return filteredInvoices.reduce(
      (acc, inv) => {
        acc.count += 1;
        acc.totalOil += inv.oil_produced || 0;
        acc.oilFees += inv.oil_amount || 0;
        acc.cashFees += inv.cash_amount || 0;
        return acc;
      },
      { count: 0, totalOil: 0, oilFees: 0, cashFees: 0 }
    );
  }, [filteredInvoices]);

  const paymentLabel = (type: string) => {
    switch (type) {
      case "oil": return "زيت فقط";
      case "cash": return "نقدي فقط";
      case "mixed": return "دفع مختلط";
      default: return type;
    }
  };

  const paymentBadge = (type: string) => {
    switch (type) {
      case "oil":
        return <Badge className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300">زيت فقط</Badge>;
      case "cash":
        return <Badge className="bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300">نقدي فقط</Badge>;
      case "mixed":
        return <Badge className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300">دفع مختلط</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <FileText className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">سجل الفواتير</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              عرض وإدارة جميع فواتير الزبائن الصادرة والمطبوعة في هذا الموسم
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-card border-muted">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">عدد الفواتير</p>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold mt-1 text-foreground">{totals.count}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">فاتورة صادرة</p>
        </Card>

        <Card className="p-4 bg-card border-muted">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">إجمالي الزيت المعصور</p>
            <Droplets className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold mt-1 text-emerald-600">
            {totals.totalOil.toLocaleString("en-US", { maximumFractionDigits: 1 })}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">كغم زيت صافي</p>
        </Card>

        <Card className="p-4 bg-card border-muted">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">زيت الرد المحصل</p>
            <Droplets className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold mt-1 text-amber-600">
            {totals.oilFees.toLocaleString("en-US", { maximumFractionDigits: 1 })}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">كغم للمخزن</p>
        </Card>

        <Card className="p-4 bg-card border-muted">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">النقد المحصل</p>
            <Wallet className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold mt-1 text-blue-600">
            {totals.cashFees.toLocaleString("en-US", { maximumFractionDigits: 1 })} ₪
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">شيكل بالصندوق</p>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">قائمة الفواتير الصادرة</CardTitle>
              <CardDescription className="text-xs">
                انقر على معاينة لعرض تفاصيل الفاتورة أو طباعة لإصدار إيصال حراري 80mm
              </CardDescription>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم الزبون..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pe-9 text-xs h-9"
                />
              </div>

              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-9 w-full sm:w-36 text-xs gap-1">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="طريقة الدفع" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل طرق الدفع</SelectItem>
                  <SelectItem value="oil">زيت فقط</SelectItem>
                  <SelectItem value="cash">نقدي فقط</SelectItem>
                  <SelectItem value="mixed">دفع مختلط</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">جارٍ تحميل سجل الفواتير...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Receipt className="h-16 w-16 mx-auto mb-3 opacity-30 text-primary" />
              <p className="text-base font-bold text-foreground">لا توجد فواتير مطابقة</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchTerm || paymentFilter !== "all" 
                  ? "جرب تعديل عبارة البحث أو تغيير فلتر الدفع" 
                  : "لم يتم إصدار فواتير في هذا الموسم بعد"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right">التاريخ والوقت</TableHead>
                    <TableHead className="text-right">اسم الزبون</TableHead>
                    <TableHead className="text-right">كمية الزيت</TableHead>
                    <TableHead className="text-right">التنكات</TableHead>
                    <TableHead className="text-right">طريقة الدفع</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-center w-36">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-muted/20">
                      <TableCell className="text-right text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-mono">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{new Date(inv.created_at).toLocaleDateString("ar-EG")}</span>
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-bold text-sm text-foreground">
                        {inv.customer_name}
                      </TableCell>

                      <TableCell className="text-right font-semibold text-sm">
                        {inv.oil_produced} كغم
                      </TableCell>

                      <TableCell className="text-right text-xs text-muted-foreground">
                        {inv.container_count > 0 ? `${inv.container_count} (${inv.container_type})` : "بدون تنكات"}
                      </TableCell>

                      <TableCell className="text-right">
                        {paymentBadge(inv.payment_type)}
                      </TableCell>

                      <TableCell className="text-right font-bold text-sm text-primary">
                        {inv.total_display}
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="flex items-center gap-1.5 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs gap-1"
                            onClick={() => setPreviewInvoice(inv)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>معاينة</span>
                          </Button>

                          <Button
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1 shadow-sm"
                            onClick={() =>
                              printThermalReceipt(
                                {
                                  customer_name: inv.customer_name,
                                  oil_produced: inv.oil_produced,
                                  container_count: inv.container_count,
                                  container_type: inv.container_type,
                                  payment_type: inv.payment_type,
                                  oil_amount: inv.oil_amount,
                                  cash_amount: inv.cash_amount,
                                  total_display: inv.total_display,
                                  created_at: inv.created_at,
                                  season_name: activeSeason?.name,
                                },
                                millName
                              )
                            }
                            title="طباعة إيصال حراري (80mm)"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span>طباعة</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Preview Modal */}
      <Dialog open={!!previewInvoice} onOpenChange={(o) => !o && setPreviewInvoice(null)}>
        <DialogContent dir="rtl" className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b bg-muted/30">
            <DialogTitle className="text-right text-base font-bold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <span>معاينة تفاصيل الفاتورة — {previewInvoice?.customer_name}</span>
            </DialogTitle>
          </DialogHeader>
          {previewInvoice && (
            <div className="p-4 space-y-4">
              <InvoicePreview
                millName={millName}
                data={{
                  ...previewInvoice,
                  season_name: activeSeason?.name,
                }}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewInvoice(null)}>
                  إغلاق
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    printThermalReceipt(
                      {
                        customer_name: previewInvoice.customer_name,
                        oil_produced: previewInvoice.oil_produced,
                        container_count: previewInvoice.container_count,
                        container_type: previewInvoice.container_type,
                        payment_type: previewInvoice.payment_type,
                        oil_amount: previewInvoice.oil_amount,
                        cash_amount: previewInvoice.cash_amount,
                        total_display: previewInvoice.total_display,
                        created_at: previewInvoice.created_at,
                        season_name: activeSeason?.name,
                      },
                      millName
                    )
                  }
                >
                  <Printer className="h-4 w-4" />
                  <span>طباعة إيصال حراري</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
