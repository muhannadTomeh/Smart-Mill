import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Building2, Receipt, Droplets, CalendarCheck, Filter, UserPlus, Copy, RefreshCw, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function AdminIndex() {
  const [stats, setStats] = useState({
    totalMills: 0,
    activeMills: 0,
    newThisWeek: 0,
    newThisMonth: 0,
    totalInvoices: 0,
    totalOil: 0,
  });
  const [mills, setMills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactLink, setContactLink] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [updatingLink, setUpdatingLink] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newAccountData, setNewAccountData] = useState({
    email: "",
    password: "",
    mill_name: "",
    owner_name: "",
    phone: "",
    secondary_phone: "",
    country: ""
  });
  const [createdCredentials, setCreatedCredentials] = useState<{email: string, password: string} | null>(null);

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let retVal = "";
    for (let i = 0, n = charset.length; i < 12; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    setNewAccountData(prev => ({ ...prev, password: retVal }));
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      console.log("Invoking admin-create-mill-account...");
      const { data, error } = await supabase.functions.invoke('admin-create-mill-account', {
        body: newAccountData
      });

      if (error) {
        console.error("Function error details:", error);
        throw error;
      }

      setCreatedCredentials({
        email: newAccountData.email,
        password: newAccountData.password
      });
      toast.success("تم إنشاء الحساب بنجاح");
      
      setNewAccountData({
        email: "",
        password: "",
        mill_name: "",
        owner_name: "",
        phone: "",
        secondary_phone: "",
        country: ""
      });
      
      // We'll defer the reload to when they close the success view
    } catch (error: any) {
      console.error("Error creating account:", error);
      toast.error(error.message || "حدث خطأ أثناء إنشاء الحساب");
    } finally {
      setCreateLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all profiles and auth emails (via profiles linked to auth users)
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("*");
        
        // Fetch last payments for each mill
        const { data: lastPayments } = await supabase
          .from("subscription_payments")
          .select("mill_user_id, payment_date")
          .order("payment_date", { ascending: false });

        if (profilesError) throw profilesError;

        // Fetch seasons to identify active ones
        const { data: seasons, error: seasonsError } = await supabase
          .from("seasons")
          .select("user_id, status");
        
        if (seasonsError) throw seasonsError;

        // Fetch all invoices for stats
        const { data: invoices, error: invoicesError } = await supabase
          .from("invoices")
          .select("oil_produced, created_at, user_id");

        if (invoicesError) throw invoicesError;

        // Calculate stats
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

        const totalOil = invoices.reduce((sum, inv) => sum + (inv.oil_produced || 0), 0);
        
        const activeUserIds = new Set(seasons.filter(s => s.status === 'open').map(s => s.user_id));
        
        const newThisWeek = profiles.filter(p => new Date(p.created_at) >= oneWeekAgo).length;
        const newThisMonth = profiles.filter(p => new Date(p.created_at) >= oneMonthAgo).length;

        setStats({
          totalMills: profiles.length,
          activeMills: activeUserIds.size,
          newThisWeek,
          newThisMonth,
          totalInvoices: invoices.length,
          totalOil,
        });

        // Prepare mill list
        // Note: For email, we might need a more complex join or just use what's in profile if stored
        // Since we can't easily join auth.users in public schema, we rely on profiles
        const millList = profiles.map(profile => {
          const userInvoices = invoices.filter(inv => inv.user_id === profile.user_id);
          const lastActivity = userInvoices.length > 0 
            ? new Date(Math.max(...userInvoices.map(inv => new Date(inv.created_at).getTime())))
            : new Date(profile.created_at);

          const millPayments = lastPayments?.filter(p => p.mill_user_id === profile.user_id) || [];
          const lastPaymentDate = millPayments.length > 0 ? millPayments[0].payment_date : null;

          return {
            id: profile.user_id,
            name: profile.display_name || "معصرة غير مسمى",
            millName: profile.mill_name,
            country: profile.country,
            email: "---",
            createdAt: profile.created_at,
            isActive: activeUserIds.has(profile.user_id),
            subscriptionStatus: profile.subscription_status || 'pending',
            invoiceCount: userInvoices.length,
            lastActivity,
            lastPaymentDate,
          };
        });

        // Sort by Country then Name
        millList.sort((a, b) => {
          const countryA = a.country || "";
          const countryB = b.country || "";
          if (countryA !== countryB) return countryA.localeCompare(countryB, 'ar');
          return (a.millName || "").localeCompare(b.millName || "", 'ar');
        });

        setMills(millList);
      } catch (error) {
        console.error("Admin data fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchContactSettings = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value");
      
      if (data) {
        data.forEach(setting => {
          if (setting.key === "contact_link") setContactLink(setting.value);
          if (setting.key === "contact_email") setContactEmail(setting.value);
          if (setting.key === "contact_phone") setContactPhone(setting.value);
          if (setting.key === "contact_whatsapp") setContactWhatsapp(setting.value);
        });
      }
    };

    fetchData();
    fetchContactSettings();
  }, []);

  const handleUpdateContactSettings = async () => {
    setUpdatingLink(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    const settings = [
      { key: "contact_link", value: contactLink },
      { key: "contact_email", value: contactEmail },
      { key: "contact_phone", value: contactPhone },
      { key: "contact_whatsapp", value: contactWhatsapp },
    ];

    const { error } = await supabase
      .from("system_settings")
      .upsert(settings.map(s => ({ 
        ...s,
        updated_at: new Date().toISOString(),
        updated_by: user?.id
      })));
    
    setUpdatingLink(false);
    if (!error) {
      toast.success("تم تحديث إعدادات التواصل بنجاح");
    } else {
      toast.error("حدث خطأ أثناء التحديث");
    }
  };

  if (loading) return <div className="p-8 text-center">جارٍ التحميل...</div>;

  const filteredMills = statusFilter === "all" 
    ? mills 
    : mills.filter(mill => mill.subscriptionStatus === statusFilter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">نشط</Badge>;
      case 'suspended':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">موقف</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">قيد الانتظار</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">لوحة تحكم المشرف</h1>
        <div className="flex gap-2">
          <Dialog open={isCreateModalOpen} onOpenChange={(open) => {
            setIsCreateModalOpen(open);
            if (!open) setCreatedCredentials(null);
          }}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700 text-white">
                <UserPlus className="ml-2 h-4 w-4" />
                إنشاء حساب معصرة جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] text-right" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-right">إنشاء حساب معصرة جديد</DialogTitle>
              </DialogHeader>
              
              {!createdCredentials ? (
                <form onSubmit={handleCreateAccount} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="mill_name">اسم المعصرة</Label>
                    <Input 
                      id="mill_name" 
                      required 
                      value={newAccountData.mill_name}
                      onChange={e => setNewAccountData(prev => ({...prev, mill_name: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner_name">اسم صاحب المعصرة</Label>
                    <Input 
                      id="owner_name" 
                      required 
                      value={newAccountData.owner_name}
                      onChange={e => setNewAccountData(prev => ({...prev, owner_name: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">البريد الإلكتروني (للتسجيل)</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      required 
                      dir="ltr"
                      value={newAccountData.email}
                      onChange={e => setNewAccountData(prev => ({...prev, email: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الهاتف الأساسي</Label>
                    <Input 
                      id="phone" 
                      value={newAccountData.phone}
                      onChange={e => setNewAccountData(prev => ({...prev, phone: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondary_phone">رقم هاتف إضافي (اختياري)</Label>
                    <Input 
                      id="secondary_phone" 
                      value={newAccountData.secondary_phone}
                      onChange={e => setNewAccountData(prev => ({...prev, secondary_phone: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">البلد / المدينة</Label>
                    <Input 
                      id="country" 
                      value={newAccountData.country}
                      placeholder="مثال: فلسطين - جنين"
                      onChange={e => setNewAccountData(prev => ({...prev, country: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">كلمة المرور</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="password" 
                        type="text" 
                        required 
                        dir="ltr"
                        value={newAccountData.password}
                        onChange={e => setNewAccountData(prev => ({...prev, password: e.target.value}))}
                      />
                      <Button type="button" variant="outline" onClick={generatePassword}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createLoading}>
                    {createLoading ? "جاري الإنشاء..." : "إنشاء الحساب الآن"}
                  </Button>
                </form>
              ) : (
                <div className="space-y-6 py-4">
                  <div className="flex flex-col items-center justify-center text-green-600 gap-2 mb-4">
                    <CheckCircle2 className="h-12 w-12" />
                    <h3 className="text-xl font-bold">تم إنشاء الحساب بنجاح!</h3>
                  </div>
                  
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm mb-4">
                    ⚠️ <strong>هام:</strong> احفظ هذه البيانات الآن، لن تظهر مرة أخرى.
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>البريد الإلكتروني</Label>
                      <div className="flex gap-2">
                        <Input value={createdCredentials.email} readOnly dir="ltr" />
                        <Button variant="outline" onClick={() => copyToClipboard(createdCredentials.email, "البريد الإلكتروني")}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>كلمة المرور</Label>
                      <div className="flex gap-2">
                        <Input value={createdCredentials.password} readOnly dir="ltr" />
                        <Button variant="outline" onClick={() => copyToClipboard(createdCredentials.password, "كلمة المرور")}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Button onClick={() => {
                    setIsCreateModalOpen(false);
                    window.location.reload();
                  }} className="w-full mt-4">
                    إغلاق
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            العودة للرئيسية
          </Button>
        </div>
      </div>

      {/* Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-right">إعدادات النظام العالمية</CardTitle>
        </CardHeader>
        <CardContent className="text-right">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">رابط التواصل العام (زر اطلب اشتراكك)</label>
                <Input
                  type="text"
                  value={contactLink}
                  onChange={(e) => setContactLink(e.target.value)}
                  placeholder="https://wa.me/..."
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">البريد الإلكتروني للدعم</label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="email@example.com"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">رقم الهاتف للتواصل</label>
                <Input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="05xxxxxxx"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">رقم واتساب (مع رمز الدولة)</label>
                <Input
                  type="text"
                  value={contactWhatsapp}
                  onChange={(e) => setContactWhatsapp(e.target.value)}
                  placeholder="+972xxxxxxxxx"
                  dir="ltr"
                />
              </div>
            </div>
            
            <div className="flex justify-start">
              <Button onClick={handleUpdateContactSettings} disabled={updatingLink}>
                {updatingLink ? "جاري الحفظ..." : "حفظ إعدادات التواصل"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المعاصر</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMills}</div>
            <p className="text-xs text-muted-foreground">
              {stats.newThisWeek} جديد هذا الأسبوع
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">معاصر نشطة</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeMills}</div>
            <p className="text-xs text-muted-foreground">بمواسم مفتوحة حالياً</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الفواتير</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInvoices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الزيت المعالج</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOil.toLocaleString()} كغم</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">تسجيلات الشهر</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.newThisMonth}</div>
          </CardContent>
        </Card>
      </div>

      {/* Mills Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>كل المعاصر</CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="تصفية حسب الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="suspended">موقف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم المعصرة</TableHead>
                <TableHead className="text-right">تاريخ التسجيل</TableHead>
                <TableHead className="text-right">حالة الاشتراك</TableHead>
                <TableHead className="text-right">آخر دفعة</TableHead>
                <TableHead className="text-right">موسم نشط</TableHead>
                <TableHead className="text-right">عدد الفواتير</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMills.map((mill) => (
                <TableRow key={mill.id}>
                  <TableCell className="font-medium">{mill.name}</TableCell>
                  <TableCell>{new Date(mill.createdAt).toLocaleDateString("ar-EG")}</TableCell>
                  <TableCell>
                    {getStatusBadge(mill.subscriptionStatus)}
                  </TableCell>
                  <TableCell>
                    {mill.lastPaymentDate ? (
                      <span className="text-xs">{new Date(mill.lastPaymentDate).toLocaleDateString("ar-EG")}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">لا يوجد</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {mill.isActive ? (
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">نعم</Badge>
                    ) : (
                      <Badge variant="secondary">لا</Badge>
                    )}
                  </TableCell>
                  <TableCell>{mill.invoiceCount}</TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate(`/admin/mill/${mill.id}`)}
                    >
                      عرض التفاصيل
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
