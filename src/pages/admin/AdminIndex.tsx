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
    owner_name: "",
    owner_phone: "",
    owner_email: "",
    mill_name: "",
    country: "",
    username: "",
    password: ""
  });
  const [createdCredentials, setCreatedCredentials] = useState<{
    mill_name: string;
    owner_name: string;
    username: string;
    password: string;
    owner_phone: string;
    owner_email?: string;
  } | null>(null);

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let retVal = "";
    for (let i = 0, n = charset.length; i < 8; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    setNewAccountData(prev => ({ ...prev, password: retVal }));
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const cleanUsername = newAccountData.username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, "");
      if (!cleanUsername) {
        throw new Error("يرجى إدخال اسم مستخدم صالح (أحرف إنجليزية وأرقام)");
      }

      console.log("Creating mill account via admin_create_mill RPC...");
      const { data, error } = await supabase.rpc('admin_create_mill', {
        p_mill_name: newAccountData.mill_name.trim(),
        p_country: newAccountData.country.trim() || 'فلسطين',
        p_username: cleanUsername,
        p_password: newAccountData.password,
        p_owner_name: newAccountData.owner_name.trim(),
        p_owner_phone: newAccountData.owner_phone.trim(),
        p_owner_email: newAccountData.owner_email.trim() || null
      });

      if (error) {
        console.warn("admin_create_mill RPC error:", error);
        // Fallback: if RPC does not exist yet, try edge function
        if (error.message?.includes('admin_create_mill') && error.message?.includes('does not exist')) {
          const edgeRes = await supabase.functions.invoke('admin-create-mill-account', {
            body: {
              mill_name: newAccountData.mill_name.trim(),
              owner_name: newAccountData.owner_name.trim(),
              phone: newAccountData.owner_phone.trim(),
              secondary_phone: newAccountData.owner_email.trim() || null,
              country: newAccountData.country.trim() || 'فلسطين',
              username: cleanUsername,
              email: `${cleanUsername}@smartmill.com`,
              password: newAccountData.password
            }
          });
          if (edgeRes.error) {
            throw new Error("يرجى تشغيل استعلام SQL الخاص بإنشاء دالة admin_create_mill في Supabase SQL Editor أولاً، ثم إعادة المحاولة.");
          }
        } else {
          throw error;
        }
      }

      setCreatedCredentials({
        mill_name: newAccountData.mill_name.trim(),
        owner_name: newAccountData.owner_name.trim(),
        username: cleanUsername,
        password: newAccountData.password,
        owner_phone: newAccountData.owner_phone.trim(),
        owner_email: newAccountData.owner_email.trim() || undefined
      });

      toast.success("تم إنشاء حساب المعصرة بنجاح!");

      setNewAccountData({
        owner_name: "",
        owner_phone: "",
        owner_email: "",
        mill_name: "",
        country: "",
        username: "",
        password: ""
      });
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
        // ============================================================
        // الاستعلام الجديد: من جدول mills مع بيانات المالك عبر mill_memberships
        // كل صف = معصرة واحدة فقط
        // ============================================================
        const [
          { data: millsData, error: millsError },
          { data: lastPayments },
          { data: seasons },
          { data: invoices },
          { data: adminRoles }
        ] = await Promise.all([
          supabase.from("mills").select(`
            id, name, location, country, phone, secondary_phone,
            mill_code, subscription_status, monthly_fee, owner_user_id, created_at,
            mill_memberships(id, user_id, role, display_username)
          `).order("created_at", { ascending: false }),
          supabase.from("subscription_payments").select("mill_user_id, payment_date, mill_id").order("payment_date", { ascending: false }),
          supabase.from("seasons").select("user_id, status"),
          supabase.from("invoices").select("oil_produced, created_at, user_id"),
          supabase.from("user_roles").select("user_id").eq("role", "platform_admin")
        ]);

        // إذا لم يكن جدول mills موجوداً بعد، Fallback لجدول profiles
        if (millsError || !millsData) {
          await fetchFromProfiles(lastPayments, seasons, invoices);
          return;
        }

        const adminUserIds = new Set((adminRoles || []).map((r: any) => r.user_id));
        const pureMillsData = millsData.filter((m: any) => !adminUserIds.has(m.owner_user_id));

        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
        const totalOil = (invoices || []).reduce((sum: number, inv: any) => sum + (inv.oil_produced || 0), 0);
        const activeUserIds = new Set((seasons || []).filter((s: any) => s.status === 'open').map((s: any) => s.user_id));

        setStats({
          totalMills: pureMillsData.length,
          activeMills: pureMillsData.filter((m: any) => activeUserIds.has(m.owner_user_id)).length,
          newThisWeek: pureMillsData.filter((m: any) => new Date(m.created_at) >= oneWeekAgo).length,
          newThisMonth: pureMillsData.filter((m: any) => new Date(m.created_at) >= oneMonthAgo).length,
          totalInvoices: (invoices || []).length,
          totalOil,
        });

        const millList = pureMillsData.map((mill: any) => {
          const ownerMembership = (mill.mill_memberships || []).find((mm: any) => mm.role === 'mill_owner');
          const employeeCount = (mill.mill_memberships || []).filter((mm: any) => mm.role === 'mill_employee').length;
          const millInvoices = (invoices || []).filter((inv: any) => inv.user_id === mill.owner_user_id);
          const millPayments = (lastPayments || []).filter((p: any) => p.mill_id === mill.id || p.mill_user_id === mill.owner_user_id);
          return {
            id: mill.id,
            ownerUserId: mill.owner_user_id,
            millName: mill.name,
            ownerName: ownerMembership?.display_username || "غير محدد",
            country: mill.country || "فلسطين",
            millLocation: mill.location || "غير محدد",
            phone: mill.phone || "---",
            secondaryPhone: mill.secondary_phone,
            createdAt: mill.created_at,
            isActive: activeUserIds.has(mill.owner_user_id),
            subscriptionStatus: mill.subscription_status || 'pending',
            invoiceCount: millInvoices.length,
            employeeCount,
            lastPaymentDate: millPayments.length > 0 ? millPayments[0].payment_date : null,
          };
        });

        millList.sort((a: any, b: any) => {
          if (a.country !== b.country) return (a.country || "").localeCompare(b.country || "", 'ar');
          return (a.millName || "").localeCompare(b.millName || "", 'ar');
        });

        setMills(millList);
      } catch (error: any) {
        console.error("Admin data fetch error (mills):", error);
        // Fallback
        const [{ data: lastPayments }, { data: seasons }, { data: invoices }] = await Promise.all([
          supabase.from("subscription_payments").select("mill_user_id, payment_date").order("payment_date", { ascending: false }),
          supabase.from("seasons").select("user_id, status"),
          supabase.from("invoices").select("oil_produced, created_at, user_id")
        ]);
        await fetchFromProfiles(lastPayments, seasons, invoices);
      } finally {
        setLoading(false);
      }
    };

    // Fallback: إذا لم يكتمل migration بعد، اقرأ من profiles (ملاك فقط بدون parent_mill_id وبدون حساب الأدمن)
    const fetchFromProfiles = async (lastPayments: any, seasons: any, invoices: any) => {
      const [
        { data: profiles },
        { data: adminRoles }
      ] = await Promise.all([
        supabase.from("profiles").select("*").is("parent_mill_id", null),
        supabase.from("user_roles").select("user_id").eq("role", "platform_admin")
      ]);

      const adminUserIds = new Set((adminRoles || []).map((r: any) => r.user_id));
      // استثناء حسابات الأدمن من قائمة المعاصر
      const millProfiles = (profiles || []).filter((p: any) => !adminUserIds.has(p.user_id));

      const activeUserIds = new Set((seasons || []).filter((s: any) => s.status === 'open').map((s: any) => s.user_id));
      const totalOil = (invoices || []).reduce((sum: number, inv: any) => sum + (inv.oil_produced || 0), 0);
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

      setStats({
        totalMills: millProfiles.length,
        activeMills: millProfiles.filter((p: any) => activeUserIds.has(p.user_id)).length,
        newThisWeek: millProfiles.filter((p: any) => new Date(p.created_at) >= oneWeekAgo).length,
        newThisMonth: millProfiles.filter((p: any) => new Date(p.created_at) >= oneMonthAgo).length,
        totalInvoices: (invoices || []).length,
        totalOil,
      });

      const millList = millProfiles.map((profile: any) => {
        const userInvoices = (invoices || []).filter((inv: any) => inv.user_id === profile.user_id);
        const millPayments = (lastPayments || []).filter((p: any) => p.mill_user_id === profile.user_id);
        return {
          id: profile.user_id,
          ownerUserId: profile.user_id,
          ownerName: profile.display_name || "غير محدد",
          millName: profile.mill_name || "معصرة غير مسماة",
          country: profile.country || "فلسطين",
          millLocation: profile.mill_location || "غير محدد",
          phone: profile.phone || "---",
          secondaryPhone: profile.secondary_phone,
          createdAt: profile.created_at,
          isActive: activeUserIds.has(profile.user_id),
          subscriptionStatus: profile.subscription_status || 'pending',
          invoiceCount: userInvoices.length,
          employeeCount: 0,
          lastPaymentDate: millPayments.length > 0 ? millPayments[0].payment_date : null,
        };
      });

      millList.sort((a: any, b: any) => {
        if (a.country !== b.country) return (a.country || "").localeCompare(b.country || "", 'ar');
        return (a.millName || "").localeCompare(b.millName || "", 'ar');
      });

      setMills(millList);
    };

    const fetchContactSettings = async () => {
      const { data } = await supabase.from("system_settings").select("key, value");
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
    <div className="space-y-6 text-right" dir="rtl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">لوحة تحكم المشرف</h1>
          <p className="text-xs text-muted-foreground mt-1">إدارة المعاصر، الاشتراكات، وإعدادات النظام العامة</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isCreateModalOpen} onOpenChange={(open) => {
            setIsCreateModalOpen(open);
            if (!open) setCreatedCredentials(null);
          }}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700 text-white gap-2">
                <UserPlus className="h-4 w-4" />
                <span>إنشاء حساب معصرة جديد</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] text-right max-h-[90vh] overflow-y-auto" dir="rtl">
              <DialogHeader className="text-right sm:text-right">
                <DialogTitle className="text-right text-lg">إنشاء حساب معصرة جديد</DialogTitle>
                <DialogDescription className="text-right text-xs">
                  إدخال بيانات المالك والمعصرة وبيانات الدخول للنظام
                </DialogDescription>
              </DialogHeader>
              
              {!createdCredentials ? (
                <form onSubmit={handleCreateAccount} className="space-y-4 py-2 text-right">
                  {/* القسم الأول: معلومات المالك */}
                  <div className="p-3.5 bg-muted/40 rounded-xl border border-border/60 space-y-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-xs">
                      <User className="h-4 w-4" />
                      <span>معلومات المالك (مدير المعصرة)</span>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="owner_name" className="text-right block text-xs font-semibold">اسم صاحب المعصرة *</Label>
                      <Input 
                        id="owner_name" 
                        required 
                        placeholder="مثال: رائف عمار"
                        className="text-right h-9 text-sm"
                        value={newAccountData.owner_name}
                        onChange={e => setNewAccountData(prev => ({...prev, owner_name: e.target.value}))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="owner_phone" className="text-right block text-xs font-semibold">رقم هاتف المالك *</Label>
                      <Input 
                        id="owner_phone" 
                        required
                        dir="ltr"
                        placeholder="مثال: 0569945677"
                        className="text-left font-mono h-9 text-sm"
                        value={newAccountData.owner_phone}
                        onChange={e => setNewAccountData(prev => ({...prev, owner_phone: e.target.value}))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="owner_email" className="text-right block text-xs font-semibold">البريد الإلكتروني للمالك</Label>
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">اختياري</span>
                      </div>
                      <Input 
                        id="owner_email" 
                        type="email" 
                        dir="ltr"
                        placeholder="example@gmail.com (اختياري للإشعارات والتواصل)"
                        className="text-left font-mono h-9 text-sm"
                        value={newAccountData.owner_email}
                        onChange={e => setNewAccountData(prev => ({...prev, owner_email: e.target.value}))}
                      />
                    </div>
                  </div>

                  {/* القسم الثاني: معلومات المعصرة وحساب الدخول */}
                  <div className="p-3.5 bg-muted/40 rounded-xl border border-border/60 space-y-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-xs">
                      <Building2 className="h-4 w-4" />
                      <span>معلومات المعصرة وحساب الدخول</span>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="mill_name" className="text-right block text-xs font-semibold">اسم المعصرة *</Label>
                      <Input 
                        id="mill_name" 
                        required 
                        placeholder="مثال: معصرة قفين الغربية"
                        className="text-right h-9 text-sm"
                        value={newAccountData.mill_name}
                        onChange={e => setNewAccountData(prev => ({...prev, mill_name: e.target.value}))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="country" className="text-right block text-xs font-semibold">البلد / المدينة *</Label>
                      <Input 
                        id="country" 
                        required
                        className="text-right h-9 text-sm"
                        value={newAccountData.country}
                        placeholder="مثال: قفين - طولكرم"
                        onChange={e => setNewAccountData(prev => ({...prev, country: e.target.value}))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="username" className="text-right block text-xs font-semibold">اسم المستخدم (Username للدخول) *</Label>
                      <Input 
                        id="username" 
                        required 
                        dir="ltr"
                        placeholder="مثال: raef أو qaffin_mill"
                        className="text-left font-mono h-9 text-sm"
                        value={newAccountData.username}
                        onChange={e => setNewAccountData(prev => ({...prev, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, "")}))}
                      />
                      <p className="text-[11px] text-muted-foreground text-right">يدخل به صاحب المعصرة مباشرة في شاشة الدخول</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-right block text-xs font-semibold">كلمة المرور (Password) *</Label>
                      <div className="flex gap-2">
                        <Input 
                          id="password" 
                          type="text" 
                          required 
                          dir="ltr"
                          placeholder="أدخل كلمة المرور"
                          className="text-left font-mono h-9 text-sm"
                          value={newAccountData.password}
                          onChange={e => setNewAccountData(prev => ({...prev, password: e.target.value}))}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={generatePassword} title="توليد كلمة مرور عشوائية" className="h-9 px-2.5">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 h-10 font-bold" disabled={createLoading}>
                    {createLoading ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب الآن"}
                  </Button>
                </form>
              ) : (
                <div className="space-y-5 py-3 text-right">
                  <div className="flex flex-col items-center justify-center text-green-600 gap-1.5 mb-2">
                    <CheckCircle2 className="h-10 w-10" />
                    <h3 className="text-lg font-bold">تم إنشاء حساب المعصرة بنجاح!</h3>
                    <p className="text-xs text-muted-foreground">يمكن لصاحب المعصرة الدخول فوراً بالبيانات التالية:</p>
                  </div>
                  
                  <div className="space-y-2.5 p-3.5 bg-muted/40 rounded-xl border border-border">
                    <div className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">اسم المعصرة:</span>
                      <span className="font-bold text-foreground">{createdCredentials.mill_name}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">صاحب المعصرة:</span>
                      <span className="font-bold text-foreground">{createdCredentials.owner_name}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">رقم الهاتف:</span>
                      <span className="font-mono text-foreground">{createdCredentials.owner_phone}</span>
                    </div>
                    {createdCredentials.owner_email && (
                      <div className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                        <span className="text-muted-foreground font-medium">البريد الإلكتروني:</span>
                        <span className="font-mono text-foreground">{createdCredentials.owner_email}</span>
                      </div>
                    )}
                    <div className="space-y-1 pt-1">
                      <Label className="text-right block text-xs font-semibold text-primary">اسم المستخدم للدخول (Username):</Label>
                      <div className="flex gap-2">
                        <Input value={createdCredentials.username} readOnly dir="ltr" className="text-left font-mono font-bold text-primary h-9" />
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdCredentials.username, "اسم المستخدم")} className="h-9">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 pt-1">
                      <Label className="text-right block text-xs font-semibold text-foreground">كلمة المرور (Password):</Label>
                      <div className="flex gap-2">
                        <Input value={createdCredentials.password} readOnly dir="ltr" className="text-left font-mono font-bold h-9" />
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdCredentials.password, "كلمة المرور")} className="h-9">
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
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2">
            <span>العودة للرئيسية</span>
          </Button>
        </div>
      </div>

      {/* Global Settings */}
      <Card className="text-right">
        <CardHeader>
          <CardTitle className="text-right text-lg">إعدادات النظام العامة</CardTitle>
        </CardHeader>
        <CardContent className="text-right">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium block text-right">رابط التواصل العام (زر اطلب اشتراكك)</label>
                <Input
                  type="text"
                  value={contactLink}
                  onChange={(e) => setContactLink(e.target.value)}
                  placeholder="https://wa.me/..."
                  dir="ltr"
                  className="text-left font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium block text-right">البريد الإلكتروني للدعم</label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="email@example.com"
                  dir="ltr"
                  className="text-left font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium block text-right">رقم الهاتف للتواصل</label>
                <Input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="05xxxxxxx"
                  dir="ltr"
                  className="text-left font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium block text-right">رقم واتساب (مع رمز الدولة)</label>
                <Input
                  type="text"
                  value={contactWhatsapp}
                  onChange={(e) => setContactWhatsapp(e.target.value)}
                  placeholder="+972xxxxxxxxx"
                  dir="ltr"
                  className="text-left font-mono"
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
        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-right">إجمالي المعاصر</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-right">
            <div className="text-2xl font-bold">{stats.totalMills}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.newThisWeek} جديد هذا الأسبوع
            </p>
          </CardContent>
        </Card>
        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-right">معاصر نشطة</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-right">
            <div className="text-2xl font-bold">{stats.activeMills}</div>
            <p className="text-xs text-muted-foreground mt-1">بمواسم مفتوحة حالياً</p>
          </CardContent>
        </Card>
        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-right">إجمالي الفواتير</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-right">
            <div className="text-2xl font-bold">{stats.totalInvoices}</div>
            <p className="text-xs text-muted-foreground mt-1">فاتورة صادرة</p>
          </CardContent>
        </Card>
        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-right">إجمالي الزيت المعالج</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-right">
            <div className="text-2xl font-bold">{stats.totalOil.toLocaleString()} كغم</div>
            <p className="text-xs text-muted-foreground mt-1">إنتاج إجمالي</p>
          </CardContent>
        </Card>
        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-right">تسجيلات الشهر</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-right">
            <div className="text-2xl font-bold">{stats.newThisMonth}</div>
            <p className="text-xs text-muted-foreground mt-1">معصرة مسجلة</p>
          </CardContent>
        </Card>
      </div>

      {/* Mills Table */}
      <Card className="text-right">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-right text-lg">سجل المعاصر المشتركة</CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] text-right" dir="rtl">
                <SelectValue placeholder="تصفية حسب الحالة" />
              </SelectTrigger>
              <SelectContent dir="rtl" className="text-right">
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="suspended">موقف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table dir="rtl">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم المعصرة</TableHead>
                <TableHead className="text-right">المالك / المدير</TableHead>
                <TableHead className="text-right">الموقع والدولة</TableHead>
                <TableHead className="text-right">الهاتف</TableHead>
                <TableHead className="text-right">تاريخ التسجيل</TableHead>
                <TableHead className="text-right">حالة الاشتراك</TableHead>
                <TableHead className="text-right">الفواتير</TableHead>
                <TableHead className="text-right">الحسابات</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMills.map((mill) => (
                <TableRow key={mill.id}>
                  <TableCell className="font-bold text-foreground text-right">{mill.millName}</TableCell>
                  <TableCell className="font-medium text-muted-foreground text-right">{mill.ownerName}</TableCell>
                  <TableCell className="text-right">
                    <div className="text-xs">
                      <span className="font-medium text-foreground">{mill.millLocation}</span>
                      <span className="text-muted-foreground me-1"> ({mill.country})</span>
                    </div>
                  </TableCell>
                  <TableCell dir="ltr" className="text-right text-xs font-mono">
                    <div>{mill.phone}</div>
                    {mill.secondaryPhone && <div className="text-muted-foreground text-[10px]">{mill.secondaryPhone}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-right">{new Date(mill.createdAt).toLocaleDateString("ar-EG")}</TableCell>
                  <TableCell className="text-right">
                    {getStatusBadge(mill.subscriptionStatus)}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-right">{mill.invoiceCount}</TableCell>
                  <TableCell className="text-right">
                    {mill.employeeCount > 0 ? (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Users className="h-3 w-3" />
                        {mill.employeeCount + 1} حساب
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">مالك فقط</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
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
              {filteredMills.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    لا توجد معاصر مسجلة بعد
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
