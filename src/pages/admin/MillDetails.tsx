import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Info, ArrowRight, Receipt, Package, Calendar, ShieldCheck, ShieldAlert, 
  Save, Plus, History, Banknote, Building2, MapPin, Phone, User, Globe, 
  Clock, UserCheck, ShoppingCart, Wallet, Lock, Mail, Users, CheckCircle2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { normalizeUsernameToEmail, getDisplayUsername } from "@/lib/authUtils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function MillDetails() {
  const { id: millId } = useParams();
  const navigate = useNavigate();
  const [millData, setMillData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [notes, setNotes] = useState("");
  const [monthlyFee, setMonthlyFee] = useState<string>("0");
  const [payments, setPayments] = useState<any[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
  
  // Activities and Cashier accounts state
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [oilTransactions, setOilTransactions] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  // New Employee Modal
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: "", username: "", password: "" });
  const [creatingEmployee, setCreatingEmployee] = useState(false);

  const { toast } = useToast();

  const fetchData = async () => {
    if (!millId) return;
    setLoading(true);
    try {
      // Log administrative access
      await supabase.rpc('log_admin_access', {
        target_user_id: millId,
        admin_action: 'viewed_mill_details'
      });

      // Fetch profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", millId)
        .single();

      // Fetch current season
      const { data: seasons } = await supabase
        .from("seasons")
        .select("*")
        .eq("user_id", millId)
        .eq("status", "active")
        .limit(1);

      const currentSeason = seasons?.[0] || null;

      // Fetch all invoices for activity log
      const { data: invoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", millId)
        .order("created_at", { ascending: false });

      // Fetch queue entries
      const { data: queue } = await supabase
        .from("queue")
        .select("*")
        .eq("user_id", millId)
        .order("created_at", { ascending: false });

      // Fetch expenses
      const { data: expensesData } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", millId)
        .order("created_at", { ascending: false });

      // Fetch oil transactions
      const { data: oilData } = await supabase
        .from("oil_transactions")
        .select("*")
        .eq("user_id", millId)
        .order("created_at", { ascending: false });

      // Fetch sub-account employees
      const { data: employeesData } = await supabase
        .from("profiles")
        .select("*")
        .eq("parent_mill_id", millId)
        .order("created_at", { ascending: false });

      // Fetch inventory
      const { data: inventory } = await supabase
        .from("inventory")
        .select("*")
        .eq("user_id", millId)
        .limit(1);

      // Fetch subscription payments
      const { data: paymentsData } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("mill_user_id", millId)
        .order("payment_date", { ascending: false });

      setMillData({
        profile,
        currentSeason,
        invoices: invoices || [],
        inventory: inventory?.[0] || null
      });
      setQueueItems(queue || []);
      setExpenses(expensesData || []);
      setOilTransactions(oilData || []);
      setEmployees(employeesData || []);
      setPayments(paymentsData || []);

      if (profile) {
        setNotes(profile.subscription_notes || "");
        setMonthlyFee(profile.monthly_fee?.toString() || "0");
      }
    } catch (error) {
      console.error("Error fetching mill details:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [millId]);

  const updateSubscription = async (status: 'active' | 'suspended' | 'pending') => {
    if (!millId) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ subscription_status: status })
        .eq("user_id", millId);

      if (error) throw error;

      await supabase.rpc('log_admin_access', {
        target_user_id: millId,
        admin_action: `updated_subscription_status_to_${status}`
      });

      setMillData((prev: any) => ({
        ...prev,
        profile: { ...prev.profile, subscription_status: status }
      }));

      toast({
        title: "تم التحديث",
        description: `تم تغيير حالة الاشتراك إلى ${status === 'active' ? 'نشط' : status === 'suspended' ? 'موقف' : 'قيد الانتظار'}`,
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "فشل تحديث حالة الاشتراك",
      });
    } finally {
      setUpdating(false);
    }
  };

  const saveNotes = async () => {
    if (!millId) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ subscription_notes: notes })
        .eq("user_id", millId);

      if (error) throw error;

      await supabase.rpc('log_admin_access', {
        target_user_id: millId,
        admin_action: 'updated_subscription_notes'
      });

      toast({
        title: "تم الحفظ",
        description: "تم حفظ ملاحظات الاشتراك بنجاح",
      });
    } catch (error) {
      console.error("Error saving notes:", error);
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "فشل حفظ الملاحظات",
      });
    } finally {
      setUpdating(false);
    }
  };

  const saveMonthlyFee = async () => {
    if (!millId) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ monthly_fee: parseFloat(monthlyFee) || 0 })
        .eq("user_id", millId);

      if (error) throw error;

      await supabase.rpc('log_admin_access', {
        target_user_id: millId,
        admin_action: 'updated_monthly_fee'
      });

      toast({
        title: "تم الحفظ",
        description: "تم تحديث قيمة الاشتراك الشهري",
      });
    } catch (error) {
      console.error("Error saving fee:", error);
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "فشل حفظ قيمة الاشتراك",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleAddPayment = async () => {
    if (!millId) return;
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("subscription_payments")
        .insert({
          mill_user_id: millId,
          amount: parseFloat(newPayment.amount),
          payment_date: newPayment.date,
          notes: newPayment.notes,
          recorded_by: user?.id
        });

      if (error) throw error;

      await supabase.rpc('log_admin_access', {
        target_user_id: millId,
        admin_action: `added_subscription_payment_${newPayment.amount}`
      });

      toast({
        title: "تم التسجيل",
        description: "تم تسجيل الدفعة بنجاح",
      });

      setIsPaymentModalOpen(false);
      setNewPayment({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
      
      const { data: paymentsData } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("mill_user_id", millId)
        .order("payment_date", { ascending: false });
      
      setPayments(paymentsData || []);
    } catch (error) {
      console.error("Error adding payment:", error);
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "فشل تسجيل الدفعة",
      });
    } finally {
      setUpdating(false);
    }
  };

  // Create Employee Cashier Sub-account
  const handleCreateEmployee = async () => {
    if (!newEmployee.name.trim() || !newEmployee.username.trim() || !newEmployee.password.trim()) {
      toast({ title: "خطأ", description: "يرجى كتابة اسم الموظف، واسم المستخدم، وكلمة المرور", variant: "destructive" });
      return;
    }

    setCreatingEmployee(true);
    try {
      const email = normalizeUsernameToEmail(newEmployee.username);
      const { data, error } = await supabase.auth.signUp({
        email,
        password: newEmployee.password,
        options: {
          data: {
            display_name: newEmployee.name.trim(),
            username: newEmployee.username.trim(),
            parent_mill_id: millId,
            mill_name: millData?.profile?.mill_name,
          }
        }
      });

      if (error) throw error;

      toast({
        title: "تم إنشاء حساب الكاشير بنجاح",
        description: `اسم المستخدم: ${newEmployee.username.trim()} (كلمة المرور: ${newEmployee.password})`
      });

      setIsEmployeeModalOpen(false);
      setNewEmployee({ name: "", username: "", password: "" });
      fetchData();
    } catch (err: any) {
      toast({
        title: "خطأ في إنشاء الحساب",
        description: err.message || "تعذر إنشاء حساب الكاشير",
        variant: "destructive"
      });
    } finally {
      setCreatingEmployee(false);
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "active":
        return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">نشط</Badge>;
      case "suspended":
        return <Badge variant="destructive">موقف</Badge>;
      default:
        return <Badge variant="outline" className="text-amber-600 border-amber-300">قيد الانتظار</Badge>;
    }
  };

  const lastPayment = payments.length > 0 ? payments[0] : null;
  const monthsSinceLastPayment = lastPayment 
    ? Math.floor((new Date().getTime() - new Date(lastPayment.payment_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    : null;

  if (loading) return <div className="p-8 text-center text-muted-foreground">جارٍ تحميل بيانات وسجلات المعصرة...</div>;
  if (!millData) return <div className="p-8 text-center text-destructive">لم يتم العثور على بيانات المعصرة.</div>;

  const status = millData.profile?.subscription_status || 'pending';

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner Alert */}
      <Alert className="bg-blue-50/70 border-blue-200">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-800 font-bold">وضع الإدارة والإشراف العام</AlertTitle>
        <AlertDescription className="text-blue-700 text-xs mt-0.5">
          أنت تشاهد وتدير بيانات وحركات <strong>[{millData.profile?.mill_name || millData.profile?.display_name}]</strong> بصلاحيات المشرف الكاملة.
        </AlertDescription>
      </Alert>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowRight className="ml-2 h-4 w-4" />
            العودة للوحة المشرف
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {millData.profile?.mill_name || millData.profile?.display_name || 'تفاصيل المعصرة'}
            </h1>
            <p className="text-xs text-muted-foreground">المالك: {millData.profile?.display_name || "غير محدد"}</p>
          </div>
        </div>
        <div>
          {getStatusBadge(status)}
        </div>
      </div>

      {/* Mill & Owner Profile Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            بيانات المعصرة والتواصل
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1 bg-muted/40 p-3 rounded-xl">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span>اسم المعصرة</span>
              </div>
              <p className="font-bold text-foreground text-base">{millData.profile?.mill_name || "غير محدد"}</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <User className="h-3.5 w-3.5 text-primary" />
                <span>المالك / المدير</span>
              </div>
              <p className="font-bold text-foreground">{millData.profile?.display_name || "غير محدد"}</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span>الموقع والدولة</span>
              </div>
              <p className="font-bold text-foreground">{millData.profile?.mill_location || "غير محدد"} ({millData.profile?.country || "فلسطين"})</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span>أرقام الهاتف</span>
              </div>
              <div dir="ltr" className="text-right font-mono font-bold text-foreground">
                <div>{millData.profile?.phone || "---"}</div>
                {millData.profile?.secondary_phone && (
                  <div className="text-xs text-muted-foreground font-normal">{millData.profile?.secondary_phone}</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">الموسم النشط</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {millData.currentSeason ? (
              <div>
                <p className="font-bold text-base">{millData.currentSeason.name}</p>
                <p className="text-xs text-muted-foreground">نسبة الرد: {millData.currentSeason.return_percent}%</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">لا يوجد موسم نشط</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الفواتير الصادرة</CardTitle>
            <Receipt className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{millData.invoices.length}</p>
            <p className="text-xs text-muted-foreground">فاتورة معصرة مسجلة</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">حركات الطابور</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{queueItems.length}</p>
            <p className="text-xs text-muted-foreground">زبون في سجل الطابور</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">حسابات الموظفين (الكاشير)</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{employees.length}</p>
            <p className="text-xs text-muted-foreground">حسابات كاشير فرعية</p>
          </CardContent>
        </Card>
      </div>

      {/* Core Tabs: Operations Activity Log & Cashier Employees Management */}
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="invoices" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            <span>سجل الفواتير ({millData.invoices.length})</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5">
            <Clock className="h-4 w-4" />
            <span>حركات الطابور ({queueItems.length})</span>
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-1.5">
            <UserCheck className="h-4 w-4" />
            <span>حسابات الكاشير ({employees.length})</span>
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            <span>المصاريف والزيت ({expenses.length + oilTransactions.length})</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            <span>الاشتراك والتحكم</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Invoices Log */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Receipt className="h-5 w-5 text-primary" />
                سجل فواتير المعصرة الكاملة
              </CardTitle>
              <CardDescription>عرض تفاصيل كافة الفواتير المصدرة من قبل المعصرة والمزارعين والكميات</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم المزارع / الزبون</TableHead>
                    <TableHead className="text-right">الزيت المنتج</TableHead>
                    <TableHead className="text-right">طريقة الدفع</TableHead>
                    <TableHead className="text-right">زيت الرد</TableHead>
                    <TableHead className="text-right">المبلغ النقدي</TableHead>
                    <TableHead className="text-right">التنكات</TableHead>
                    <TableHead className="text-right">التاريخ والوقت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {millData.invoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-bold text-foreground">{inv.customer_name}</TableCell>
                      <TableCell className="font-medium text-emerald-700">{inv.oil_produced} كغم</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {inv.payment_type === 'oil' ? 'بالزيت' : inv.payment_type === 'cash' ? 'نقداً' : 'مختلط'}
                        </Badge>
                      </TableCell>
                      <TableCell>{inv.oil_amount > 0 ? `${inv.oil_amount} كغم` : '-'}</TableCell>
                      <TableCell className="font-bold">{inv.cash_amount > 0 ? `${inv.cash_amount} ₪` : '-'}</TableCell>
                      <TableCell className="text-xs">{inv.container_type || 'بدون'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(inv.created_at).toLocaleString("ar-EG")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {millData.invoices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        لا توجد فواتير مسجلة لهذه المعصرة بعد
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Queue Activity */}
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" />
                سجل حركات وأدوار الطابور
              </CardTitle>
              <CardDescription>الزبائن المسجلون والشوالات وحالة كل عصرة</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">الهاتف</TableHead>
                    <TableHead className="text-right">عدد الشوالات</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">ملاحظات</TableHead>
                    <TableHead className="text-right">تاريخ الإدخال</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.map((q: any) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-bold">{q.name}</TableCell>
                      <TableCell dir="ltr" className="text-right font-mono text-xs">{q.phone || '---'}</TableCell>
                      <TableCell className="font-medium">{q.bags} شوال</TableCell>
                      <TableCell>
                        <Badge variant={q.status === 'processing' ? 'default' : q.status === 'completed' ? 'secondary' : 'outline'}>
                          {q.status === 'processing' ? 'قيد العصر ⚙️' : q.status === 'completed' ? 'تم العصر ✅' : 'في الانتظار ⏳'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.notes || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(q.created_at).toLocaleString("ar-EG")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {queueItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        لا توجد حركات طابور مسجلة
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Cashier Sub-Accounts */}
        <TabsContent value="employees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserCheck className="h-5 w-5 text-primary" />
                  حسابات الموظفين والكاشير (Sub-Accounts)
                </CardTitle>
                <CardDescription>
                  حسابات دخول مستقلة (اسم مستخدم/بريد وكلمة مرور) بصلاحيات محصورة في: الطابور، الفوترة، وطباعة الفواتير فقط.
                </CardDescription>
              </div>

              {/* Add Employee Dialog */}
              <Dialog open={isEmployeeModalOpen} onOpenChange={setIsEmployeeModalOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    إنشاء حساب كاشير جديد
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>إنشاء حساب موظف / كاشير جديد</DialogTitle>
                    <DialogDescription>
                      سيحصل هذا الحساب على صلاحيات الطابور، إصدار الفواتير، وطباعة الفواتير فقط الخاصة بهذه المعصرة.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-3">
                    <div className="space-y-2">
                      <Label>اسم الموظف / الكاشير *</Label>
                      <Input 
                        value={newEmployee.name} 
                        onChange={(e) => setNewEmployee(p => ({ ...p, name: e.target.value }))} 
                        placeholder="مثال: أحمد الكاشير" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>اسم المستخدم (Username) *</Label>
                      <Input 
                        type="text"
                        value={newEmployee.username} 
                        onChange={(e) => setNewEmployee(p => ({ ...p, username: e.target.value }))} 
                        placeholder="مثال: ahmad أو cashier1" 
                        dir="ltr"
                      />
                      <p className="text-[11px] text-muted-foreground">نص عادي بسيط بدون قيود أو بريد إلكتروني</p>
                    </div>
                    <div className="space-y-2">
                      <Label>كلمة المرور *</Label>
                      <Input 
                        type="text"
                        value={newEmployee.password} 
                        onChange={(e) => setNewEmployee(p => ({ ...p, password: e.target.value }))} 
                        placeholder="أدخل كلمة المرور (مثال: 123456)" 
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateEmployee} disabled={creatingEmployee} className="w-full">
                      {creatingEmployee ? "جارٍ إنشاء الحساب..." : "تأكيد وإنشاء حساب الكاشير"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم الموظف</TableHead>
                    <TableHead className="text-right">اسم المستخدم</TableHead>
                    <TableHead className="text-right">الصلاحيات</TableHead>
                    <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp: any) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-bold text-foreground">{emp.display_name || 'موظف كاشير'}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {getDisplayUsername(emp.display_name, emp.display_name)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          الطابور + الفوترة + طباعة الفواتير
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(emp.created_at).toLocaleDateString("ar-EG")}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-700">مفعّل</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {employees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        لا توجد حسابات موظفين مسجلة لهذه المعصرة بعد. اضغط "إنشاء حساب كاشير جديد" لإنشاء أول حساب.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: Expenses & Oil Trading */}
        <TabsContent value="finance">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  سجل المصاريف المسجلة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الفئة</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((exp: any) => (
                      <TableRow key={exp.id}>
                        <TableCell className="font-medium">{exp.category}</TableCell>
                        <TableCell className="font-bold text-red-600">{exp.amount} ₪</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(exp.created_at).toLocaleDateString("ar-EG")}</TableCell>
                      </TableRow>
                    ))}
                    {expenses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-xs">
                          لا توجد مصاريف مسجلة
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  حركات بيع وشراء الزيت
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {oilTransactions.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <Badge variant={tx.type === 'sell' ? 'default' : 'secondary'}>
                            {tx.type === 'sell' ? 'بيع' : 'شراء'}
                          </Badge>
                        </TableCell>
                        <TableCell>{tx.amount} كغم</TableCell>
                        <TableCell className="font-bold">{tx.total_price} ₪</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString("ar-EG")}</TableCell>
                      </TableRow>
                    ))}
                    {oilTransactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-xs">
                          لا توجد حركات بيع أو شراء زيت
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 5: Subscription Management & Payments */}
        <TabsContent value="subscription">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Subscription Status Card */}
            <Card className="border-t-4 border-t-primary">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">حالة الاشتراك والتحكم</CardTitle>
                </div>
                {getStatusBadge(status)}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button 
                    onClick={() => updateSubscription('active')} 
                    disabled={updating || status === 'active'}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <ShieldCheck className="ml-2 h-4 w-4" />
                    تفعيل الحساب
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => updateSubscription('suspended')} 
                    disabled={updating || status === 'suspended'}
                    className="flex-1"
                  >
                    <ShieldAlert className="ml-2 h-4 w-4" />
                    إيقاف الحساب
                  </Button>
                </div>
                
                <div className="space-y-2 pt-2">
                  <Label className="text-sm font-medium">ملاحظات الاشتراك (خاصة بالإدارة)</Label>
                  <Textarea 
                    placeholder="سجل هنا أي ملاحظات إدارية أو اتفاقات..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[90px]"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={saveNotes}
                  disabled={updating}
                >
                  <Save className="ml-2 h-4 w-4" />
                  {updating ? "جارٍ الحفظ..." : "حفظ الملاحظات"}
                </Button>
              </CardFooter>
            </Card>

            {/* Monthly Fee & Subscription Payments */}
            <Card className="border-t-4 border-t-green-500">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-lg">الرسوم والمدفوعات</CardTitle>
                </div>

                <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                      <Plus className="ml-1.5 h-3.5 w-3.5" />
                      تسجيل دفعة
                    </Button>
                  </DialogTrigger>
                  <DialogContent dir="rtl">
                    <DialogHeader>
                      <DialogTitle>تسجيل دفعة اشتراك جديدة</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                      <div className="space-y-2">
                        <Label>المبلغ (₪)</Label>
                        <Input 
                          type="number" 
                          value={newPayment.amount}
                          onChange={e => setNewPayment({...newPayment, amount: e.target.value})}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>تاريخ الدفع</Label>
                        <Input 
                          type="date" 
                          value={newPayment.date}
                          onChange={e => setNewPayment({...newPayment, date: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>ملاحظات الدفعة</Label>
                        <Textarea 
                          value={newPayment.notes}
                          onChange={e => setNewPayment({...newPayment, notes: e.target.value})}
                          placeholder="تفاصيل الحوالة أو السداد..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddPayment} disabled={updating || !newPayment.amount} className="w-full">
                        {updating ? "جارٍ التسجيل..." : "تأكيد الدفعة"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between bg-muted/40 p-3 rounded-xl">
                  <Label htmlFor="monthlyFee" className="text-xs">الاشتراك الشهري المتفق عليه:</Label>
                  <div className="flex items-center gap-1.5">
                    <Input 
                      id="monthlyFee"
                      type="number" 
                      value={monthlyFee} 
                      onChange={e => setMonthlyFee(e.target.value)}
                      className="w-24 h-8 text-xs font-bold"
                    />
                    <span className="text-xs">₪</span>
                    <Button size="sm" variant="outline" onClick={saveMonthlyFee} disabled={updating} className="h-8 text-xs">
                      حفظ
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">سجل الدفعات الأخيرة:</p>
                  <div className="max-h-[160px] overflow-auto space-y-1.5">
                    {payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded-lg border">
                        <div>
                          <span className="font-bold text-green-700">{p.amount} ₪</span>
                          <span className="text-muted-foreground mr-2">({new Date(p.payment_date).toLocaleDateString("ar-EG")})</span>
                        </div>
                        <span className="text-muted-foreground truncate max-w-[150px]">{p.notes || '-'}</span>
                      </div>
                    ))}
                    {payments.length === 0 && (
                      <p className="text-xs text-center text-muted-foreground py-2">لا توجد دفعات مسجلة</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
