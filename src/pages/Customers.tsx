import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, FileText, Phone, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

interface InvoiceRecord {
  id: string;
  customer_name: string;
  oil_produced: number;
  payment_type: string;
  total_display: string;
  created_at: string;
}

const Customers = () => {
  const { user } = useAuth();
  const { activeSeason } = useSeason();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchCustomers();
      fetchInvoices();
    }
  }, [user]);

  const fetchCustomers = async () => {
    const { data } = await supabase.from("customers").select("*").eq("user_id", user!.id).eq("season_id", activeSeason!.id).order("created_at", { ascending: false });
    setCustomers((data as Customer[]) || []);
    setLoading(false);
  };

  const fetchInvoices = async () => {
    const { data } = await supabase.from("invoices").select("*").eq("user_id", user!.id).eq("season_id", activeSeason!.id).order("created_at", { ascending: false });
    setInvoices((data as InvoiceRecord[]) || []);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.includes(searchTerm) || c.phone?.includes(searchTerm)
  );

  const getCustomerInvoices = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return [];
    return invoices.filter(inv => inv.customer_name === customer.name);
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
      <div className="flex items-center gap-3">
        <Users className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">إدارة الزبائن</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الزبائن ({customers.length})</CardTitle>
          <CardDescription>عرض وإدارة جميع الزبائن المسجلين في النظام</CardDescription>
          <div className="flex items-center gap-4 pt-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="البحث باسم الزبون أو رقم الهاتف..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pe-10" />
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
                  const custInvoices = invoices.filter(inv => inv.customer_name === customer.name);
                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="text-right font-medium">{customer.name}</TableCell>
                      <TableCell className="text-right">
                        {customer.phone ? (
                          <div className="flex items-center gap-1"><Phone className="h-4 w-4" />{customer.phone}</div>
                        ) : <span className="text-muted-foreground">غير محدد</span>}
                      </TableCell>
                      <TableCell className="text-right"><Badge variant="outline">{custInvoices.length}</Badge></TableCell>
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
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">كمية الزيت</TableHead>
                    <TableHead className="text-right">طريقة الدفع</TableHead>
                    <TableHead className="text-right">المبلغ الإجمالي</TableHead>
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
