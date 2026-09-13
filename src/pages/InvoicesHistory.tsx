import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";
import { formatDate } from "@/lib/formatters";
import { useCurrency } from "@/hooks/useCurrency";
import { useNavigate } from "react-router-dom";
import { 
  FileText, Search, Calendar, Eye, Printer, Filter, 
  Receipt, Droplets, Wallet, Layers, ArrowUpDown, Trash2
} from "lucide-react";
import { DeletedInvoicesDialog } from "@/components/invoices/DeletedInvoicesDialog";
import { useDeletedInvoices } from "@/hooks/useDeletedInvoices";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/contexts/RoleContext";

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
  voided_at?: string | null;
}

interface ReceivableMovement {
  id: string;
  invoice_id: string;
  amount: number;
  movement_type: string;
  reversal_of?: string | null;
  created_at: string;
}

export default function InvoicesHistory() {
  const { user, millId, profile } = useAuth();
  const { activeSeason } = useSeason();
  const { currency } = useCurrency();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isEmployee } = useRole();

  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false);
  const { count: deletedCount } = useDeletedInvoices();

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);
  const [cancellingInvoiceId, setCancellingInvoiceId] = useState<string | null>(null);
  const [receivableMovements, setReceivableMovements] = useState<ReceivableMovement[]>([]);
  const [receivableHistoryInvoice, setReceivableHistoryInvoice] = useState<InvoiceRecord | null>(null);
  const [collectingInvoiceId, setCollectingInvoiceId] = useState<string | null>(null);

  const cancelInvoice = async (invoice: InvoiceRecord) => {
    const reason = window.prompt("سبب إلغاء الفاتورة:");
    if (!reason?.trim()) return;
    setCancellingInvoiceId(invoice.id);
    try {
      const { error } = await supabase.rpc("cancel_invoice_lifecycle_command" as any, {
        p_invoice_id: invoice.id,
        p_reason: reason.trim(),
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      toast({ title: "تم إلغاء الفاتورة", description: "عُكست آثار الكاش والزيت والعبوات من المصدر بأمان." });
      await fetchInvoices();
    } catch (err: any) {
      toast({ title: "تعذر إلغاء الفاتورة", description: err.message || "تعذرت العملية", variant: "destructive" });
    } finally {
      setCancellingInvoiceId(null);
    }
  };

  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";

  const fetchInvoices = async () => {
    if (!activeSeason) return;
    setLoading(true);
    try {
      let query = supabase
        .from("invoices")
        .select("*")
        .eq("season_id", activeSeason.id);

      if (millId || activeSeason.mill_id) {
        query = query.eq("mill_id", millId || activeSeason.mill_id);
      } else if (user?.id) {
        query = query.eq("user_id", user.id);
      }

      const [invoiceResult, receivableResult] = await Promise.all([
        query.order("created_at", { ascending: false }),
        supabase.from("receivable_movements" as any).select("id, invoice_id, amount, movement_type, reversal_of, created_at").eq("season_id", activeSeason.id).order("created_at", { ascending: false }),
      ]);
      const { data } = invoiceResult;
      setInvoices((data as InvoiceRecord[]) || []);
      setReceivableMovements((receivableResult.data || []) as ReceivableMovement[]);
    } catch (err) {
      console.error("Error fetching invoices:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSeason) {
      fetchInvoices();
    }
  }, [activeSeason?.id, millId, user?.id]);

  const receivableBalance = (invoiceId: string) => receivableMovements
    .filter((movement) => movement.invoice_id === invoiceId)
    .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);

  const collectReceivable = async (invoice: InvoiceRecord) => {
    const outstanding = receivableBalance(invoice.id);
    const amountInput = window.prompt(`مبلغ التحصيل (المتبقي ${outstanding.toLocaleString()} ${currency}):`, String(outstanding));
    if (!amountInput) return;
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) {
      toast({ title: "مبلغ غير صالح", description: "أدخل مبلغًا لا يتجاوز الرصيد المتبقي.", variant: "destructive" });
      return;
    }
    const notes = window.prompt("ملاحظات التحصيل (اختياري):") || null;
    setCollectingInvoiceId(invoice.id);
    try {
      const { error } = await supabase.rpc("collect_invoice_receivable_lifecycle_command" as any, {
        p_invoice_id: invoice.id,
        p_amount: amount,
        p_notes: notes,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      toast({ title: "تم التحصيل", description: "سُجل القبض وربط بالفاتورة والذمة." });
      await fetchInvoices();
    } catch (err: any) {
      toast({ title: "تعذر التحصيل", description: err.message || "تعذرت العملية", variant: "destructive" });
    } finally {
      setCollectingInvoiceId(null);
    }
  };

  const reverseCollection = async (movement: ReceivableMovement) => {
    const reason = window.prompt("سبب عكس التحصيل:");
    if (!reason?.trim()) return;
    try {
      const { error } = await supabase.rpc("reverse_invoice_collection_lifecycle_command" as any, {
        p_movement_id: movement.id,
        p_reason: reason.trim(),
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      toast({ title: "تم عكس التحصيل", description: "عاد الرصيد المستحق والكاش إلى حالتهما الصحيحة." });
      await fetchInvoices();
    } catch (err: any) {
      toast({ title: "تعذر عكس التحصيل", description: err.message || "تعذرت العملية", variant: "destructive" });
    }
  };


  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch = !searchTerm || inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase().trim());
      const matchesFilter = paymentFilter === "all" || inv.payment_type === paymentFilter;
      return matchesSearch && matchesFilter;
    });
  }, [invoices, searchTerm, paymentFilter]);

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

        {/* Action: الفواتير المحذوفة */}
        <Button
          variant="outline"
          onClick={() => setDeletedDialogOpen(true)}
          className="gap-2 border-border hover:bg-destructive/5 hover:border-destructive/30 hover:text-destructive transition-colors relative"
          title="عرض الفواتير والأدوار المحذوفة خلال الـ 24 ساعة الماضية"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
          <span>الفواتير المحذوفة</span>
          {deletedCount > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs font-mono rounded-full">
              {deletedCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Main Table Card */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">قائمة الفواتير الصادرة</CardTitle>
                <Badge variant="secondary" className="text-xs font-mono">
                  {filteredInvoices.length} فاتورة
                </Badge>
              </div>
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
                          <span>{formatDate(inv.created_at)}</span>
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
                          {!isEmployee && !inv.voided_at && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cancellingInvoiceId === inv.id}
                              className="h-8 px-2.5 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                              onClick={() => cancelInvoice(inv)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>إلغاء</span>
                            </Button>
                          )}
                          {!inv.voided_at && receivableBalance(inv.id) > 0 && (
                            <Button size="sm" variant="outline" disabled={collectingInvoiceId === inv.id} className="h-8 px-2.5 text-xs gap-1" onClick={() => collectReceivable(inv)}>
                              <Wallet className="h-3.5 w-3.5" />
                              <span>تحصيل</span>
                            </Button>
                          )}
                          {receivableMovements.some((movement) => movement.invoice_id === inv.id) && (
                            <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setReceivableHistoryInvoice(inv)}>سجل الذمة</Button>
                          )}

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

      <Dialog open={!!receivableHistoryInvoice} onOpenChange={(open) => !open && setReceivableHistoryInvoice(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>سجل ذمة الفاتورة</DialogTitle>
            <DialogDescription>{receivableHistoryInvoice?.customer_name} — الرصيد: {receivableHistoryInvoice ? receivableBalance(receivableHistoryInvoice.id).toLocaleString() : "0"} {currency}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {receivableMovements.filter((movement) => movement.invoice_id === receivableHistoryInvoice?.id).map((movement) => (
              <div key={movement.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div><div className="font-medium">{Number(movement.amount).toLocaleString()} {currency}</div><div className="text-xs text-muted-foreground">{formatDate(movement.created_at)} · {movement.movement_type}</div></div>
                {movement.movement_type === "collection" && !receivableMovements.some((item) => item.reversal_of === movement.id) && !isEmployee && <Button size="sm" variant="outline" onClick={() => reverseCollection(movement)}>عكس</Button>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Deleted Invoices Dialog (Saved for 24 hours) */}
      <DeletedInvoicesDialog
        open={deletedDialogOpen}
        onOpenChange={setDeletedDialogOpen}
        onSelectForInvoice={(item) => {
          navigate("/invoices", {
            state: {
              customerName: item.name,
              customerPhone: item.phone || "",
              queueId: item.id,
            },
          });
        }}
      />
    </div>
  );
}
