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
  
  // Mill Code management
  const [millCode, setMillCode] = useState("");
  const [savingMillCode, setSavingMillCode] = useState(false);

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
        setMillCode(profile.mill_code || "");
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

  // Save Mill Code
  const saveMillCode = async () => {
    if (!millId) return;
    const code = millCode.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!code) {
      toast({ title: "خطأ", description: "رمز المعصرة يجب أن يحتوي على أحرف أو أرقام إنجليزية فقط", variant: "destructive" });
      return;
    }
    setSavingMillCode(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ mill_code: code })
        .eq("user_id", millId);
      if (error) throw error;
      setMillCode(code);
      toast({ title: "تم حفظ رمز المعصرة", description: `رمز المعصرة الآن: ${code}` });
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message?.includes("unique") ? "هذا الرمز مستخدم من معصرة أخرى، اختر رمزاً مختلفاً" : err.message || "فشل حفظ الرمز",
        variant: "destructive"
      });
    } finally {
      setSavingMillCode(false);
    }
  };

  // Create Employee Cashier Sub-account
  const handleCreateEmployee = async () => {
    if (!newEmployee.name.trim() || !newEmployee.username.trim() || !newEmployee.password.trim()) {
      toast({ title: "خطأ", description: "يرجى كتابة اسم الموظف، واسم المستخدم، وكلمة المرور", variant: "destructive" });
      return;
    }
    if (!millCode.trim()) {
      toast({ title: "يجب تعيين رمز المعصرة أولاً", description: "اذهب لتبويب 'رمز المعصرة' وأنشئ رمزاً فريداً للمعصرة قبل إضافة كاشير", variant: "destructive" });
      return;
    }

    setCreatingEmployee(true);
    try {
      // Username is prefixed with mill_code to ensure global uniqueness
      const email = normalizeUsernameToEmail(newEmployee.username, millCode);
      const { error } = await supabase.auth.signUp({
        email,
        password: newEmployee.password,
        options: {
          data: {
            display_name: newEmployee.name.trim(),
            username: newEmployee.username.trim(),
            parent_mill_id: millId,
            mill_name: millData?.profile?.mill_name,
            mill_code: millCode.trim(),
          }
        }
      });

      if (error) throw error;

      toast({
        title: "تم إنشاء حساب الكاشير بنجاح",
        description: `اسم الدخول: ${newEmployee.username.trim()} | كلمة المرور: ${newEmployee.password}`
      });

      setIsEmployeeModalOpen(false);
      setNewEmployee({ name: "", username: "", password: "" });
      fetchData();
    } catch (err: any) {
      toast({
        title: "خطأ في إنشاء الحساب",
        description: err.message?.includes("already registered") ? "اسم المستخدم هذا موجود مسبقاً في هذه المعصرة" : err.message || "تعذر إنشاء حساب الكاشير",
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
    <div className="space-y-6 text-right" dir="rtl">
      {/* Top Banner Alert */}
      <Alert className="bg-blue-50/70 border-blue-200 text-right" dir="rtl">
        <Info className="h-4 w-4 text-blue-600 shrink-0" />
        <AlertTitle className="text-blue-800 font-bold text-right">وضع الإدارة والإشراف العام</AlertTitle>
        <AlertDescription className="text-blue-700 text-xs mt-0.5 text-right">
          أنت تشاهد وتدير بيانات وحركات <strong>[{millData.profile?.mill_name || millData.profile?.display_name}]</strong> بصلاحيات المشرف الكاملة.
        </AlertDescription>
      </Alert>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2">
            <ArrowRight className="h-4 w-4" />
            <span>العودة للوحة المشرف</span>
          </Button>
          <div className="text-right">
            <h1 className="text-2xl font-bold text-foreground">
              {millData.profile?.mill_name || millData.profile?.display_name || 'تفاصيل المعصرة'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">المالك: {millData.profile?.display_name || "غير محدد"}</p>
          </div>
        </div>
        <div>
          {getStatusBadge(status)}
        </div>
      </div>

      {/* Mill & Owner Profile Info Card */}
      <Card className="text-right">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-right">
            <Building2 className="h-5 w-5 text-primary" />
            <span>بيانات المعصرة والتواصل</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1 bg-muted/40 p-3 rounded-xl text-right">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-start">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span>اسم المعصرة</span>
              </div>
              <p className="font-bold text-foreground text-base">{millData.profile?.mill_name || "غير محدد"}</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl text-right">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-start">
                <User className="h-3.5 w-3.5 text-primary" />
                <span>المالك / المدير</span>
              </div>
              <p className="font-bold text-foreground">{millData.profile?.display_name || "غير محدد"}</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl text-right">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-start">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span>الموقع والدولة</span>
              </div>
              <p className="font-bold text-foreground">{millData.profile?.mill_location || "غير محدد"} ({millData.profile?.country || "فلسطين"})</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl text-right">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-start">
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
        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-right">الموسم النشط</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="text-right">
            {millData.currentSeason ? (
              <div>
                <p className="font-bold text-base">{millData.currentSeason.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">نسبة الرد: {millData.currentSeason.return_percent}%</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">لا يوجد موسم نشط</p>
            )}
          </CardContent>
        </Card>

        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-right">إجمالي الفواتير الصادرة</CardTitle>
            <Receipt className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="text-right">
            <p className="text-2xl font-bold">{millData.invoices.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">فاتورة معصرة مسجلة</p>
          </CardContent>
        </Card>

        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-right">حركات الطابور</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="text-right">
            <p className="text-2xl font-bold">{queueItems.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">زبون في سجل الطابور</p>
          </CardContent>
        </Card>

        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-right">حسابات الموظفين (الكاشير)</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="text-right">
            <p className="text-2xl font-bold">{employees.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">حسابات كاشير فرعية</p>
          </CardContent>
        </Card>
      </div>

      {/* Core Tabs: Operations Activity Log & Cashier Employees Management */}
      <Tabs defaultValue="invoices" className="space-y-4" dir="rtl">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 w-full bg-muted/80 p-1.5 rounded-2xl gap-1" dir="rtl">
          <TabsTrigger value="invoices" className="gap-2 justify-center text-xs sm:text-sm font-medium rounded-xl py-2.5">
            <Receipt className="h-4 w-4 shrink-0" />
            <span>سجل الفواتير ({millData.invoices.length})</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2 justify-center text-xs sm:text-sm font-medium rounded-xl py-2.5">
            <Clock className="h-4 w-4 shrink-0" />
            <span>حركات الطابور ({queueItems.length})</span>
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-2 justify-center text-xs sm:text-sm font-medium rounded-xl py-2.5">
            <UserCheck className="h-4 w-4 shrink-0" />
            <span>حسابات الكاشير ({employees.length})</span>
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-2 justify-center text-xs sm:text-sm font-medium rounded-xl py-2.5">
            <Wallet className="h-4 w-4 shrink-0" />
            <span>المصاريف والزيت ({expenses.length + oilTransactions.length})</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-2 justify-center text-xs sm:text-sm font-medium rounded-xl py-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>الاشتراك والتحكم</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Invoices Log */}
        <TabsContent value="invoices">
          <Card className="text-right">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-right">
                <Receipt className="h-5 w-5 text-primary" />
                <span>سجل فواتير المعصرة الكاملة</span>
              </CardTitle>
              <CardDescription className="text-right">عرض تفاصيل كافة الفواتير المصدرة من قبل المعصرة والمزارعين والكميات</CardDescription>
            </CardHeader>
            <CardContent>
              <Table dir="rtl">
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
                      <TableCell className="font-bold text-foreground text-right">{inv.customer_name}</TableCell>
                      <TableCell className="font-medium text-emerald-700 text-right">{inv.oil_produced} كغم</TableCell>
                      <TableCell className="text-right">
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
          <Card className="text-right">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-right">
                <Clock className="h-5 w-5 text-primary" />
                <span>سجل حركات وأدوار الطابور</span>
              </CardTitle>
              <CardDescription className="text-right">الزبائن المسجلون والشوالات وحالة كل عصرة</CardDescription>
            </CardHeader>
            <CardContent>
              <Table dir="rtl">
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
                      <TableCell className="font-bold text-right">{q.name}</TableCell>
                      <TableCell dir="ltr" className="text-right font-mono text-xs">{q.phone || '---'}</TableCell>
                      <TableCell className="font-medium text-right">{q.bags} شوال</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={q.status === 'processing' ? 'default' : q.status === 'completed' ? 'secondary' : 'outline'}>
                          {q.status === 'processing' ? 'قيد العصر ⚙️' : q.status === 'completed' ? 'تم العصر ✅' : 'في الانتظار ⏳'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground text-right">{q.notes || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground text-right">
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
          {/* Mill Code Section */}
          <Card className="mb-4 border-primary/20 bg-primary/5 text-right">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-right">
                <Lock className="h-4 w-4 text-primary" />
                <span>رمز المعصرة (Mill Code) — ضروري للتمييز بين المعاصر</span>
              </CardTitle>
              <CardDescription className="text-xs text-right">
                رمز فريد عالمياً يُضاف تلقائياً لأسماء مستخدمي الكاشير عند إنشائهم.
                مثال: إذا كان الرمز <strong>tomeh</strong> وأنشأت كاشيراً باسم <strong>ahmad</strong>، يدخل الكاشير بكتابة <strong>ahmad</strong> فقط في شاشة الدخول.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 justify-start">
                <Input
                  value={millCode}
                  onChange={(e) => setMillCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                  placeholder="مثال: tomeh أو iman أو alali"
                  dir="ltr"
                  className="max-w-xs font-mono text-left"
                />
                <Button onClick={saveMillCode} disabled={savingMillCode} size="sm">
                  {savingMillCode ? "جارٍ الحفظ..." : "حفظ الرمز"}
                </Button>
                {millCode && (
                  <span className="text-xs text-muted-foreground">
                    الكاشيرون يدخلون باسم مستخدم بسيط (مثل: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">ahmad</code>)
                  </span>
                )}
              </div>
              {!millCode && (
                <p className="text-xs text-destructive mt-2 text-right">
                  ⚠️ يجب تعيين رمز المعصرة قبل إنشاء حسابات الكاشير لضمان عدم التعارض مع معاصر أخرى.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="text-right">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-right">
                  <UserCheck className="h-5 w-5 text-primary" />
                  <span>حسابات الموظفين والكاشير (Sub-Accounts)</span>
                </CardTitle>
                <CardDescription className="text-right">
                  حسابات دخول مستقلة (اسم مستخدم/بريد وكلمة مرور) بصلاحيات محصورة في: الطابور، الفوترة، وطباعة الفواتير فقط.
                </CardDescription>
              </div>

              {/* Add Employee Dialog */}
              <Dialog open={isEmployeeModalOpen} onOpenChange={setIsEmployeeModalOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span>إنشاء حساب كاشير جديد</span>
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl" className="text-right sm:max-w-[450px]">
                  <DialogHeader className="text-right sm:text-right">
                    <DialogTitle className="text-right">إنشاء حساب موظف / كاشير جديد</DialogTitle>
                    <DialogDescription className="text-right">
                      سيحصل هذا الحساب على صلاحيات الطابور، إصدار الفواتير، وطباعة الفواتير فقط الخاصة بهذه المعصرة.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-3 text-right">
                    <div className="space-y-2">
                      <Label className="text-right block">اسم الموظف / الكاشير *</Label>
                      <Input 
                        value={newEmployee.name} 
                        onChange={(e) => setNewEmployee(p => ({ ...p, name: e.target.value }))} 
                        placeholder="مثال: أحمد الكاشير" 
                        className="text-right"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-right block">اسم المستخدم (Username) *</Label>
                      <Input 
                        type="text"
                        value={newEmployee.username} 
                        onChange={(e) => setNewEmployee(p => ({ ...p, username: e.target.value }))} 
                        placeholder="مثال: ahmad أو cashier1" 
                        dir="ltr"
                        className="text-left font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground text-right">نص عادي بسيط بدون قيود أو بريد إلكتروني</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-right block">كلمة المرور *</Label>
                      <Input 
                        type="text"
                        value={newEmployee.password} 
                        onChange={(e) => setNewEmployee(p => ({ ...p, password: e.target.value }))} 
                        placeholder="أدخل كلمة المرور (مثال: 123456)" 
                        dir="ltr"
                        className="text-left font-mono"
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
              <Table dir="rtl">
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
                      <TableCell className="font-bold text-foreground text-right">{emp.display_name || 'موظف كاشير'}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-primary text-right">
                        {emp.phone || getDisplayUsername(emp.display_name, null)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="text-xs">
                          الطابور + الفوترة + طباعة الفواتير
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground text-right">
                        {new Date(emp.created_at).toLocaleDateString("ar-EG")}
                      </TableCell>
                      <TableCell className="text-right">
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
            <Card className="text-right">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-right">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span>سجل المصاريف المسجلة</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table dir="rtl">
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
                        <TableCell className="font-medium text-right">{exp.category}</TableCell>
                        <TableCell className="font-bold text-red-600 text-right">{exp.amount} ₪</TableCell>
                        <TableCell className="text-xs text-muted-foreground text-right">{new Date(exp.created_at).toLocaleDateString("ar-EG")}</TableCell>
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

            <Card className="text-right">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-right">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  <span>حركات بيع وشراء الزيت</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table dir="rtl">
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
                        <TableCell className="text-right">
                          <Badge variant={tx.type === 'sell' ? 'default' : 'secondary'}>
                            {tx.type === 'sell' ? 'بيع' : 'شراء'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{tx.amount} كغم</TableCell>
                        <TableCell className="font-bold text-right">{tx.total_price} ₪</TableCell>
                        <TableCell className="text-xs text-muted-foreground text-right">{new Date(tx.created_at).toLocaleDateString("ar-EG")}</TableCell>
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
            <Card className="border-t-4 border-t-primary text-right">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg text-right">حالة الاشتراك والتحكم</CardTitle>
                </div>
                {getStatusBadge(status)}
              </CardHeader>
              <CardContent className="space-y-4 text-right">
                <div className="flex gap-2">
                  <Button 
                    onClick={() => updateSubscription('active')} 
                    disabled={updating || status === 'active'}
                    className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>تفعيل الحساب</span>
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => updateSubscription('suspended')} 
                    disabled={updating || status === 'suspended'}
                    className="flex-1 gap-2"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    <span>إيقاف الحساب</span>
                  </Button>
                </div>
                
                <div className="space-y-2 pt-2">
                  <Label className="text-sm font-medium text-right block">ملاحظات الاشتراك (خاصة بالإدارة)</Label>
                  <Textarea 
                    placeholder="سجل هنا أي ملاحظات إدارية أو اتفاقات..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[90px] text-right"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  variant="outline" 
                  className="w-full gap-2" 
                  onClick={saveNotes}
                  disabled={updating}
                >
                  <Save className="h-4 w-4" />
                  <span>{updating ? "جارٍ الحفظ..." : "حفظ الملاحظات"}</span>
                </Button>
              </CardFooter>
            </Card>

            {/* Monthly Fee & Subscription Payments */}
            <Card className="border-t-4 border-t-green-500 text-right">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-lg text-right">الرسوم والمدفوعات</CardTitle>
                </div>

                <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      <span>تسجيل دفعة</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent dir="rtl" className="text-right sm:max-w-[425px]">
                    <DialogHeader className="text-right sm:text-right">
                      <DialogTitle className="text-right">تسجيل دفعة اشتراك جديدة</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-3 text-right">
                      <div className="space-y-2">
                        <Label className="text-right block">المبلغ (₪) *</Label>
                        <Input 
                          type="number" 
                          value={newPayment.amount}
                          onChange={e => setNewPayment({...newPayment, amount: e.target.value})}
                          placeholder="0.00"
                          dir="ltr"
                          className="text-left font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-right block">تاريخ الدفع *</Label>
                        <Input 
                          type="date" 
                          value={newPayment.date}
                          onChange={e => setNewPayment({...newPayment, date: e.target.value})}
                          dir="ltr"
                          className="text-left font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-right block">ملاحظات الدفعة</Label>
                        <Textarea 
                          value={newPayment.notes}
                          onChange={e => setNewPayment({...newPayment, notes: e.target.value})}
                          placeholder="تفاصيل الحوالة أو السداد..."
                          className="text-right"
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
              <CardContent className="space-y-4 text-right">
                <div className="flex items-center justify-between bg-muted/40 p-3 rounded-xl">
                  <Label htmlFor="monthlyFee" className="text-xs font-semibold">الاشتراك الشهري المتفق عليه:</Label>
                  <div className="flex items-center gap-1.5">
                    <Input 
                      id="monthlyFee"
                      type="number" 
                      value={monthlyFee} 
                      onChange={e => setMonthlyFee(e.target.value)}
                      className="w-24 h-8 text-xs font-bold text-left font-mono"
                      dir="ltr"
                    />
                    <span className="text-xs font-bold">₪</span>
                    <Button size="sm" variant="outline" onClick={saveMonthlyFee} disabled={updating} className="h-8 text-xs">
                      حفظ
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 text-right">
                  <p className="text-xs font-semibold text-muted-foreground text-right">سجل الدفعات الأخيرة:</p>
                  <div className="max-h-[160px] overflow-auto space-y-1.5">
                    {payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-green-700">{p.amount} ₪</span>
                          <span className="text-muted-foreground">({new Date(p.payment_date).toLocaleDateString("ar-EG")})</span>
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
