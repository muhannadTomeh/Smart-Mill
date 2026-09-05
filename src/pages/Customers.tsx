import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, FileText, Phone, Calendar, UserPlus, UserCheck, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

interface InvoiceRecord {
  id: string;
  customer_id?: string | null;
  customer_name: string;
  oil_produced: number;
  payment_type: string;
  total_display: string;
  created_at: string;
}

const Customers = () => {
  const { user, effectiveUserId } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // New Customer Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [savingNewCust, setSavingNewCust] = useState(false);

  useEffect(() => {
    if (targetUserId && activeSeason) {
      fetchCustomers();
      fetchInvoices();
    }
  }, [targetUserId, activeSeason]);

  const fetchCustomers = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false });
    setCustomers((data as Customer[]) || []);
    setLoading(false);
  };

  const fetchInvoices = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("invoices")
      .select("id, customer_id, customer_name, oil_produced, payment_type, total_display, created_at")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false });
    setInvoices((data as InvoiceRecord[]) || []);
  };

  const handleCreateCustomer = async () => {
    if (!newCustName.trim()) {
      toast({ title: "تنبيه", description: "يرجى كتابة اسم الزبون", variant: "destructive" });
      return;
    }
    setSavingNewCust(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          user_id: targetUserId!,
          season_id: activeSeason!.id,
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "تمت الإضافة بنجاح", description: `تمت إضافة الزبون "${newCustName}" بنجاح` });
      setNewCustName("");
      setNewCustPhone("");
      setAddDialogOpen(false);
      await fetchCustomers();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر إضافة الزبون", variant: "destructive" });
    } finally {
      setSavingNewCust(false);
    }
  };

  const separateInvoiceToNewCustomer = async (inv: InvoiceRecord) => {
    if (!activeSeason || !targetUserId) return;
    try {
      // 1. Create a distinct customer for this invoice
      const { data: newCust, error: cErr } = await supabase
        .from("customers")
        .insert({
          user_id: targetUserId,
          season_id: activeSeason.id,
          name: inv.customer_name,
          phone: selectedCustomer?.phone || null,
          created_at: inv.created_at,
        })
        .select("id")
        .single();

      if (cErr || !newCust) throw cErr || new Error("تعذر إنشاء زبون جديد");

      // 2. Link this specific invoice to the new customer
      const { error: invErr } = await supabase
        .from("invoices")
        .update({ customer_id: newCust.id })
        .eq("id", inv.id);

      if (invErr) throw invErr;

      toast({
        title: "تم الفصل بنجاح",
        description: `تم فصل الفاتورة وإنشاء سجل زبون مستقل لـ "${inv.customer_name}"`,
      });

      await fetchCustomers();
      await fetchInvoices();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر فصل الفاتورة", variant: "destructive" });
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.includes(searchTerm) || c.phone?.includes(searchTerm)
  );

  const getCustomerInvoices = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return [];
    return invoices.filter(inv =>
      (inv.customer_id && inv.customer_id === customer.id) ||
      (!inv.customer_id && inv.customer_name === customer.name)
    );
  };

  const getPaymentText = (type: string) => {
    switch (type) {
      case 'oil': return 'زيت فقط';
      case 'cash': return 'نقدي فقط';
      case 'mixed': return 'مختلط';
      default: return type;
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const customerInvoices = selectedCustomerId ? getCustomerInvoices(selectedCustomerId) : [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">إدارة الزبائن</h1>
        </div>

        <Button
          onClick={() => setAddDialogOpen(true)}
          className="gap-2 bg-primary text-primary-foreground font-bold shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>+ إضافة زبون جديد</span>
        </Button>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <UserPlus className="h-5 w-5 text-primary" />
              إضافة زبون جديد للنظام
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              تسجيل زبون جديد في سجلات الموسم الحالي
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                اسم الزبون <span className="text-destructive">*</span>
              </Label>
              <Input
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="مثال: اوس أحمد"
                className="text-sm font-medium"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCustomer();
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">رقم الهاتف (اختياري)</Label>
              <Input
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="مثال: 0599123456"
                className="text-sm font-medium"
                dir="ltr"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCustomer();
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleCreateCustomer}
              disabled={savingNewCust || !newCustName.trim()}
              className="gap-1.5 font-bold"
            >
              <Plus className="h-4 w-4" />
              {savingNewCust ? "جارٍ الحفظ..." : "حفظ الزبون"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الزبائن ({customers.length})</CardTitle>
          <CardDescription>عرض وإدارة جميع الزبائن المسجلين في النظام</CardDescription>
          <div className="flex items-center gap-4 pt-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث باسم الزبون أو رقم الهاتف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pe-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">جارٍ التحميل...</p>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">لا يوجد زبائن</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">رقم الهاتف</TableHead>
                  <TableHead className="text-right">عدد الفواتير</TableHead>
                  <TableHead className="text-right">تاريخ التسجيل</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => {
                  const custInvoices = invoices.filter(inv =>
                    (inv.customer_id && inv.customer_id === customer.id) ||
                    (!inv.customer_id && inv.customer_name === customer.name)
                  );
                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="text-right font-medium">{customer.name}</TableCell>
                      <TableCell className="text-right">
                        {customer.phone ? (
                          <div className="flex items-center gap-1"><Phone className="h-4 w-4" />{customer.phone}</div>
                        ) : <span className="text-muted-foreground">غير محدد</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="font-bold">
                          {custInvoices.length}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(customer.created_at).toLocaleDateString('ar-SA')}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedCustomerId(customer.id)}>
                          <FileText className="h-4 w-4 me-1" />التفاصيل
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedCustomerId} onOpenChange={(open) => !open && setSelectedCustomerId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              سجل فواتير {selectedCustomer?.name}
            </DialogTitle>
            {selectedCustomer?.phone && (
              <DialogDescription className="text-right">
                📱 {selectedCustomer.phone}
              </DialogDescription>
            )}
          </DialogHeader>

          {customerInvoices.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">لا توجد فواتير لهذا الزبون</p>
          ) : (
            <div className="mt-4 space-y-3">
              {customerInvoices.length > 1 && (
                <div className="p-3 rounded-lg bg-muted/40 border text-xs text-muted-foreground">
                  💡 إذا كانت إحدى هذه الفواتير لزبون آخر يحمل نفس الاسم، يمكنك الضغط على <strong>"فصل كزبون جديد"</strong> لإنشاء سجل مستقل له.
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">كمية الزيت</TableHead>
                    <TableHead className="text-right">طريقة الدفع</TableHead>
                    <TableHead className="text-right">المبلغ الإجمالي</TableHead>
                    {customerInvoices.length > 1 && <TableHead className="text-right">إجراء</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-right">{new Date(inv.created_at).toLocaleDateString('ar-SA')}</TableCell>
                      <TableCell className="text-right">{inv.oil_produced} كغم</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={inv.payment_type === 'oil' ? 'default' : inv.payment_type === 'cash' ? 'secondary' : 'outline'}>
                          {getPaymentText(inv.payment_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{inv.total_display}</TableCell>
                      {customerInvoices.length > 1 && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                            onClick={() => separateInvoiceToNewCustomer(inv)}
                            title="فصل هذه الفاتورة وإنشاء زبون مستقل لها"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            فصل كزبون جديد
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
