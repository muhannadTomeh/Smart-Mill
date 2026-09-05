import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, FileText, Calendar, CheckCircle, Eye, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useInventory } from "@/hooks/useInventory";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useLocation } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import { calculatePaymentOptions, type PaymentBreakdown } from "@/lib/invoiceCalculations";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";

interface PaymentMethod extends PaymentBreakdown {
  total: string;
}

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
}

interface ContainerType {
  id: string;
  name: string;
  price: number;
}

const paymentLabel = (type: string) => {
  if (type === 'oil') return 'دفع بالزيت';
  if (type === 'cash') return 'دفع نقدي';
  return 'دفع مختلط';
};

const Invoices = () => {
  const { user, effectiveUserId, profile } = useAuth();
  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";
  const { activeSeason } = useSeason();
  const { settings } = useSettings();
  const { refetch: refetchInventory } = useInventory();
  const location = useLocation();
  const { toast } = useToast();

  const targetUserId = effectiveUserId || user?.id;

  const [invoiceData, setInvoiceData] = useState({
    customerName: "",
    customerPhone: "",
    oilProduced: 0,
    notes: "",
  });
  const [containerCounts, setContainerCounts] = useState<Record<string, number>>({});
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [queueCustomers, setQueueCustomers] = useState<{ id: string; name: string; phone: string | null; position: number }[]>([]);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);

  useEffect(() => {
    if (location.state) {
      const s = location.state as any;
      if (s.customerName) setInvoiceData(p => ({ ...p, customerName: s.customerName, customerPhone: s.customerPhone || "" }));
      if (s.queueId) setQueueId(s.queueId);
    }
  }, [location.state]);

  useEffect(() => {
    if (targetUserId && activeSeason) {
      fetchInvoices();
      fetchQueueCustomers();
      fetchContainerTypes();
    }
  }, [targetUserId, activeSeason]);

  // Auto-calculate payment methods whenever oil or containers change
  useEffect(() => {
    if (!invoiceData.oilProduced) {
      setPaymentMethods([]);
      setSelectedPayment(null);
      return;
    }
    const totalContainerCost = getTotalContainerCost();
    const opts = calculatePaymentOptions(invoiceData.oilProduced, totalContainerCost, settings);

    const methods: PaymentMethod[] = [
      { ...opts.oil, total: `${opts.oil.oilAmount.toFixed(2)} كغم زيت` },
      { ...opts.cash, total: `${opts.cash.cashAmount.toFixed(2)} شيكل` },
      { ...opts.mixed, total: `${opts.mixed.oilAmount.toFixed(2)} كغم زيت + ${opts.mixed.cashAmount.toFixed(2)} شيكل` },
    ];
    setPaymentMethods(methods);
    // Keep selection if still valid
    if (selectedPayment) {
      const updated = methods.find(m => m.type === selectedPayment.type);
      setSelectedPayment(updated || null);
    }
  }, [invoiceData.oilProduced, containerCounts, settings]);

  const fetchContainerTypes = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("container_types")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: true });
    const types = (data as ContainerType[]) || [];
    setContainerTypes(types);
    const counts: Record<string, number> = {};
    types.forEach(t => { counts[t.id] = 0; });
    setContainerCounts(prev => {
      const merged = { ...counts };
      Object.keys(prev).forEach(k => { if (merged[k] !== undefined) merged[k] = prev[k]; });
      return merged;
    });
  };

  const fetchQueueCustomers = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("queue")
      .select("id, name, phone, position")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .neq("status", "done")
      .order("position", { ascending: true });
    setQueueCustomers(data || []);
  };

  const fetchInvoices = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false });
    setInvoices((data as InvoiceRecord[]) || []);
  };

  const getTotalContainerCost = () => {
    let total = 0;
    containerTypes.forEach(ct => {
      total += (containerCounts[ct.id] || 0) * ct.price;
    });
    return total;
  };

  const getTotalContainerCount = () => {
    return Object.values(containerCounts).reduce((s, v) => s + v, 0);
  };

  const getContainerSummary = () => {
    return containerTypes
      .filter(ct => (containerCounts[ct.id] || 0) > 0)
      .map(ct => `${containerCounts[ct.id]} ${ct.name}`)
      .join(" + ");
  };


  const confirmInvoice = async (shouldPrint = false) => {
    if (!selectedPayment) return;
    if (!invoiceData.customerName) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم الزبون", variant: "destructive" });
      return;
    }

    let customerId: string | null = null;
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", targetUserId!)
      .eq("season_id", activeSeason!.id)
      .eq("name", invoiceData.customerName)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: newCust } = await supabase
        .from("customers")
        .insert({ user_id: targetUserId!, season_id: activeSeason!.id, name: invoiceData.customerName, phone: invoiceData.customerPhone || null })
        .select("id")
        .single();
      if (newCust) customerId = newCust.id;
    }

    const containerSummary = getContainerSummary() || "بدون تنكات";

    const { error } = await supabase.rpc("create_invoice_and_settle", {
      p_season_id: activeSeason!.id,
      p_customer_id: customerId,
      p_customer_name: invoiceData.customerName,
      p_oil_produced: invoiceData.oilProduced,
      p_container_count: getTotalContainerCount(),
      p_container_type: containerSummary,
      p_payment_type: selectedPayment.type,
      p_oil_amount: selectedPayment.oilAmount,
      p_cash_amount: selectedPayment.cashAmount,
      p_total_display: selectedPayment.total,
      p_queue_id: queueId && queueId !== "manual" ? queueId : null,
    });

    if (error) {
      console.error("create_invoice_and_settle error", error);
      toast({ title: "خطأ", description: error.message || "حدث خطأ أثناء حفظ الفاتورة", variant: "destructive" });
      return;
    }

    if (shouldPrint) {
      printThermalReceipt({
        customer_name: invoiceData.customerName,
        customer_phone: invoiceData.customerPhone || null,
        oil_produced: invoiceData.oilProduced,
        container_count: getTotalContainerCount(),
        container_type: containerSummary,
        payment_type: selectedPayment.type,
        oil_amount: selectedPayment.oilAmount,
        cash_amount: selectedPayment.cashAmount,
        total_display: selectedPayment.total,
        notes: invoiceData.notes || undefined,
        season_name: activeSeason?.name,
      }, millName);
    }

    if (queueId && queueId !== "manual") {
      const { error: qErr } = await supabase.from("queue").update({ status: "done" }).eq("id", queueId);
      if (qErr) {
        await supabase.from("queue").delete().eq("id", queueId);
      }
      setQueueId(null);
    }

    toast({ 
      title: shouldPrint ? "تم تأكيد الفاتورة وإرسال أمر الطباعة" : "تم تأكيد الفاتورة", 
      description: `تم إنشاء فاتورة لـ ${invoiceData.customerName}` 
    });
    setInvoiceData({ customerName: "", customerPhone: "", oilProduced: 0, notes: "" });
    const resetCounts: Record<string, number> = {};
    containerTypes.forEach(ct => { resetCounts[ct.id] = 0; });
    setContainerCounts(resetCounts);
    setPaymentMethods([]);
    setSelectedPayment(null);
    fetchInvoices();
    fetchQueueCustomers();
    refetchInventory();
  };

  const filteredInvoices = invoices.filter(inv =>
    inv.customer_name.includes(searchTerm)
  );

  const today = new Date().toLocaleDateString('ar-SA');

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Receipt className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">حساب الرد</h1>
      </div>

      <Tabs defaultValue="create" className="w-full" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">إنشاء فاتورة جديدة</TabsTrigger>
          <TabsTrigger value="history">سجل الفواتير</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Right: Invoice Data Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  بيانات الفاتورة
                </CardTitle>
                <CardDescription>أدخل بيانات الإنتاج لحساب الفاتورة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>اسم الزبون</Label>
                  <Select
                    value={queueId || "manual"}
                    onValueChange={(val) => {
                      if (val === "manual") {
                        setQueueId(null);
                        setInvoiceData(p => ({ ...p, customerName: "", customerPhone: "" }));
                      } else {
                        const c = queueCustomers.find(q => q.id === val);
                        if (c) {
                          setQueueId(c.id);
                          setInvoiceData(p => ({ ...p, customerName: c.name, customerPhone: c.phone || "" }));
                        }
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر زبون من الطابور" />
                    </SelectTrigger>
                    <SelectContent>
                      {queueCustomers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          #{c.position} - {c.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="manual">إدخال يدوي</SelectItem>
                    </SelectContent>
                  </Select>
                  {(!queueId || queueId === "manual") && (
                    <Input className="mt-2" value={invoiceData.customerName} onChange={(e) => setInvoiceData(p => ({ ...p, customerName: e.target.value }))} placeholder="أدخل اسم الزبون يدوياً" />
                  )}
                </div>

                <div>
                  <Label htmlFor="oilProduced">كمية الزيت المنتج (كغم)</Label>
                  <Input id="oilProduced" type="number" value={invoiceData.oilProduced || ""} onChange={(e) => setInvoiceData(p => ({ ...p, oilProduced: parseFloat(e.target.value) || 0 }))} placeholder="كمية الزيت بالكيلوغرام" min="0" step="0.1" />
                </div>

                {containerTypes.length > 0 && (
                  <div className="space-y-3">
                    <Label>عدد التنكات لكل نوع</Label>
                    {containerTypes.map(ct => (
                      <div key={ct.id} className="flex items-center gap-3">
                        <Label className="w-40 text-sm">{ct.name}:</Label>
                        <Input
                          type="number"
                          className="w-24"
                          value={containerCounts[ct.id] ?? 0}
                          onChange={(e) => {
                            const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                            setContainerCounts(p => ({ ...p, [ct.id]: isNaN(val) ? 0 : val }));
                          }}
                          min="0"
                          onFocus={(e) => e.target.select()}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {containerTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground">لم يتم إضافة أنواع تنكات بعد. أضفها من الإعدادات.</p>
                )}

                <div>
                  <Label>ملاحظات</Label>
                  <Textarea value={invoiceData.notes} onChange={(e) => setInvoiceData(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات إضافية (اختياري)" rows={2} />
                </div>


                {/* Payment methods inside form card */}
                {paymentMethods.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <Separator />
                    <Label className="text-base font-semibold">طرق الدفع المتاحة</Label>
                    {paymentMethods.map((method) => (
                      <div
                        key={method.type}
                        className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedPayment?.type === method.type ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:bg-accent/50'}`}
                        onClick={() => setSelectedPayment(method)}
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant={method.type === 'oil' ? 'default' : method.type === 'cash' ? 'secondary' : 'outline'}>
                            {paymentLabel(method.type)}
                          </Badge>
                          {selectedPayment?.type === method.type && <CheckCircle className="h-5 w-5 text-primary" />}
                        </div>
                        <p className="text-sm font-semibold text-primary mt-2">{method.total}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Left: Invoice Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  معاينة الفاتورة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg p-6 space-y-4 bg-card">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-bold text-foreground">فاتورة المعصرة الذكية</h2>
                    <p className="text-sm text-muted-foreground">{today}</p>
                  </div>

                  <Separator />

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">اسم الزبون:</span>
                      <span className="font-medium">{invoiceData.customerName || "—"}</span>
                    </div>

                    {selectedPayment && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">طريقة الدفع:</span>
                        <span className="font-medium">{paymentLabel(selectedPayment.type)}</span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">إجمالي الزيت المنتج:</span>
                      <span className="font-medium">{invoiceData.oilProduced ? `${invoiceData.oilProduced} كغم` : "—"}</span>
                    </div>

                    {getTotalContainerCount() > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">عدد التنكات:</span>
                        <span className="font-medium">{getContainerSummary()}</span>
                      </div>
                    )}

                    {selectedPayment && (
                      <>
                        <Separator />

                        {selectedPayment.type === 'oil' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">الرد (زيت):</span>
                              <span className="font-medium">{selectedPayment.oilReturn.toFixed(2)} كغم</span>
                            </div>
                            {selectedPayment.containerOilEquiv > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">ثمن التنكات (زيت):</span>
                                <span className="font-medium">{selectedPayment.containerOilEquiv.toFixed(2)} كغم</span>
                              </div>
                            )}
                          </>
                        )}

                        {selectedPayment.type === 'cash' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">الرد (نقدي):</span>
                              <span className="font-medium">{selectedPayment.cashReturn.toFixed(2)} شيكل</span>
                            </div>
                            {selectedPayment.containerCashCost > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">ثمن التنكات:</span>
                                <span className="font-medium">{selectedPayment.containerCashCost.toFixed(2)} شيكل</span>
                              </div>
                            )}
                          </>
                        )}

                        {selectedPayment.type === 'mixed' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">الرد (زيت):</span>
                              <span className="font-medium">{selectedPayment.oilReturn.toFixed(2)} كغم</span>
                            </div>
                            {selectedPayment.containerCashCost > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">ثمن التنكات (نقدي):</span>
                                <span className="font-medium">{selectedPayment.containerCashCost.toFixed(2)} شيكل</span>
                              </div>
                            )}
                          </>
                        )}

                        <Separator />

                        <div className="flex justify-between text-base font-bold text-primary">
                          <span>الإجمالي:</span>
                          <span>{selectedPayment.total}</span>
                        </div>

                        <div className="flex justify-between text-base font-bold text-accent-foreground">
                          <span>صافي الزيت للزبون:</span>
                          <span>{(invoiceData.oilProduced - selectedPayment.oilAmount).toFixed(2)} كغم</span>
                        </div>
                      </>
                    )}

                    {invoiceData.notes && (
                      <>
                        <Separator />
                        <div>
                          <span className="text-muted-foreground">ملاحظات: </span>
                          <span className="font-medium">{invoiceData.notes}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => confirmInvoice(false)}
                    disabled={!selectedPayment || !invoiceData.customerName}
                    className="sm:w-auto h-12 text-base font-semibold"
                    size="lg"
                  >
                    <CheckCircle className="h-5 w-5 me-2" />
                    تأكيد فقط
                  </Button>
                  <Button
                    onClick={() => confirmInvoice(true)}
                    disabled={!selectedPayment || !invoiceData.customerName}
                    className="flex-1 h-12 text-base font-bold shadow-md hover:shadow-lg transition-all"
                    size="lg"
                  >
                    <Printer className="h-5 w-5 me-2" />
                    تأكيد وطباعة الإيصال (80mm)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>سجل الفواتير</CardTitle>
              <CardDescription>عرض وإدارة جميع الفواتير السابقة</CardDescription>
              <div className="pt-4">
                <Input placeholder="البحث باسم الزبون..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-md" />
              </div>
            </CardHeader>
            <CardContent>
              {filteredInvoices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">لا توجد فواتير</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">اسم الزبون</TableHead>
                      <TableHead className="text-right">كمية الزيت</TableHead>
                      <TableHead className="text-right">التنكات</TableHead>
                      <TableHead className="text-right">طريقة الدفع</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-right">الفاتورة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(inv.created_at).toLocaleDateString('ar-SA')}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{inv.customer_name}</TableCell>
                        <TableCell className="text-right">{inv.oil_produced} كغم</TableCell>
                        <TableCell className="text-right">{inv.container_count} ({inv.container_type})</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={inv.payment_type === 'oil' ? 'default' : inv.payment_type === 'cash' ? 'secondary' : 'outline'}>
                            {paymentLabel(inv.payment_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{inv.total_display}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <Button size="sm" variant="outline" onClick={() => setPreviewInvoice(inv)}>
                              <Eye className="h-4 w-4 me-1" />
                              معاينة
                            </Button>
                            <Button 
                              size="sm" 
                              className="gap-1 shadow-sm"
                              onClick={() => printThermalReceipt({
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
                              }, millName)}
                              title="طباعة إيصال حراري (80mm)"
                            >
                              <Printer className="h-4 w-4" />
                              طباعة
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewInvoice} onOpenChange={(o) => !o && setPreviewInvoice(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>الفاتورة</DialogTitle>
          </DialogHeader>
          {previewInvoice && (
            <InvoicePreview 
              millName={millName}
              data={{
                ...previewInvoice,
                season_name: activeSeason?.name,
              }} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;
