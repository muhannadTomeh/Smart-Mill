import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Users, User, Building2, Receipt, Droplets, CalendarCheck, Filter, 
  UserPlus, Copy, RefreshCw, CheckCircle2, Phone, Eye, EyeOff, Key, 
  Edit, Trash2, ShieldCheck, Shield, Search, UserX, UserCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { 
  fetchAllAdminAccounts, 
  revealCredential, 
  storeCredential,
  updateUserAccount, 
  deleteUserAccount, 
  toggleUserAccountActive,
  createMillOwnerAccount,
  AdminAccountItem 
} from "@/lib/credentialVault";

export default function AdminIndex() {
  const [activeTab, setActiveTab] = useState<string>("mills");
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

  // Accounts Management State
  const [accounts, setAccounts] = useState<AdminAccountItem[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountRoleFilter, setAccountRoleFilter] = useState<string>("all");
  const [accountSearchQuery, setAccountSearchQuery] = useState<string>("");

  const [visibleAccountPasswords, setVisibleAccountPasswords] = useState<Record<string, boolean>>({});
  const [decryptedAccountPasswords, setDecryptedAccountPasswords] = useState<Record<string, string>>({});
  const [decryptingAccountLoading, setDecryptingAccountLoading] = useState<Record<string, boolean>>({});

  const [editingAccount, setEditingAccount] = useState<AdminAccountItem | null>(null);
  const [editAccountForm, setEditAccountForm] = useState({ name: "", username: "", password: "" });
  const [showEditAccountPassword, setShowEditAccountPassword] = useState(false);
  const [savingAccountEdit, setSavingAccountEdit] = useState(false);

  const [deleteTargetAccount, setDeleteTargetAccount] = useState<AdminAccountItem | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Contact Settings State
  const [contactLink, setContactLink] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [updatingLink, setUpdatingLink] = useState(false);

  // Filter and Create Modal State
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

  // Safe helpers
  const formatDate = (dateStr: any) => {
    if (!dateStr) return '---';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '---';
      return d.toLocaleDateString("ar-u-nu-latn");
    } catch {
      return '---';
    }
  };

  const safeText = (val: any, fallback = '---') => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch { return fallback; }
    }
    return String(val);
  };

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let retVal = "";
    for (let i = 0, n = charset.length; i < 8; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    setNewAccountData(prev => ({ ...prev, password: retVal }));
  };

  const generateEditPassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let retVal = "";
    for (let i = 0, n = charset.length; i < 8; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    setEditAccountForm(prev => ({ ...prev, password: retVal }));
  };

  // Create new mill account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const cleanUsername = newAccountData.username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, "");
      if (!cleanUsername) {
        throw new Error("يرجى إدخال اسم مستخدم صالح (أحرف إنجليزية وأرقام)");
      }

      await createMillOwnerAccount({
        millName: newAccountData.mill_name.trim(),
        country: newAccountData.country.trim() || 'فلسطين',
        username: cleanUsername,
        password: newAccountData.password,
        ownerName: newAccountData.owner_name.trim(),
        ownerPhone: newAccountData.owner_phone.trim(),
        ownerEmail: newAccountData.owner_email.trim() || undefined
      });

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

      fetchData();
      loadAccounts();
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

  // Load Accounts list (without passwords)
  const loadAccounts = async () => {
    setAccountsLoading(true);
    // Reset revealed passwords cache on reload so stale passwords are never retained
    setDecryptedAccountPasswords({});
    setVisibleAccountPasswords({});
    try {
      const data = await fetchAllAdminAccounts();
      setAccounts(data);
    } catch (err) {
      console.error("Error loading accounts:", err);
      toast.error("فشل جلب قائمة الحسابات");
    } finally {
      setAccountsLoading(false);
    }
  };

  // On-demand Password Reveal via Credential Vault (Always fetches fresh on reveal)
  const toggleAccountPasswordVisibility = async (acc: AdminAccountItem) => {
    const key = acc.user_id;
    if (visibleAccountPasswords[key]) {
      setVisibleAccountPasswords((p) => ({ ...p, [key]: false }));
      return;
    }

    setDecryptingAccountLoading((p) => ({ ...p, [key]: true }));
    try {
      const plain = await revealCredential(acc.user_id);
      if (plain) {
        setDecryptedAccountPasswords((p) => ({ ...p, [key]: plain }));
        setVisibleAccountPasswords((p) => ({ ...p, [key]: true }));
      } else {
        toast.info("لا توجد كلمة مرور مسجلة في الخزينة لهذا الحساب. اضغط زر المفتاح لتعيينها.");
      }
    } catch (err: any) {
      toast.error(err.message || "تعذر فك تشفير كلمة المرور");
    } finally {
      setDecryptingAccountLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleCopyAccountPassword = async (acc: AdminAccountItem) => {
    const key = acc.user_id;
    let pass = decryptedAccountPasswords[key];
    if (!pass) {
      try {
        pass = (await revealCredential(acc.user_id)) || "";
        if (pass) {
          setDecryptedAccountPasswords((p) => ({ ...p, [key]: pass }));
        }
      } catch {}
    }
    if (pass) {
      navigator.clipboard.writeText(pass);
      toast.success("تم نسخ كلمة المرور إلى الحافظة");
    } else {
      toast.error("يرجى إظهار كلمة المرور أو تعيينها أولاً");
    }
  };

  // Open Edit Account Modal
  const handleOpenAccountEdit = async (acc: AdminAccountItem) => {
    setEditingAccount(acc);
    let pass = decryptedAccountPasswords[acc.user_id] || "";
    if (!pass) {
      try {
        pass = (await revealCredential(acc.user_id)) || "";
        if (pass) {
          setDecryptedAccountPasswords((p) => ({ ...p, [acc.user_id]: pass }));
        }
      } catch {}
    }
    setEditAccountForm({
      name: acc.display_name,
      username: acc.username,
      password: pass,
    });
    setShowEditAccountPassword(false);
  };

  // Save Edit Account
  const handleSaveAccountEdit = async () => {
    if (!editingAccount) return;
    if (!editAccountForm.name.trim() || !editAccountForm.username.trim()) {
      toast.error("يرجى كتابة الاسم واسم المستخدم");
      return;
    }
    setSavingAccountEdit(true);
    try {
      await updateUserAccount(
        editingAccount.user_id,
        editAccountForm.name.trim(),
        editAccountForm.username.trim(),
        editAccountForm.password.trim() || undefined
      );

      if (editAccountForm.password.trim()) {
        try {
          await storeCredential(editingAccount.user_id, editAccountForm.password.trim());
        } catch (vaultErr) {
          console.warn("Direct vault store on admin edit:", vaultErr);
        }
        setDecryptedAccountPasswords((p) => ({ ...p, [editingAccount.user_id]: editAccountForm.password.trim() }));
        setVisibleAccountPasswords((p) => ({ ...p, [editingAccount.user_id]: true }));
      }

      toast.success(`تم تحديث الحساب: ${editAccountForm.username}`);
      setEditingAccount(null);
      await loadAccounts();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "تعذر حفظ التعديلات");
    } finally {
      setSavingAccountEdit(false);
    }
  };

  // Delete Account
  const handleDeleteAccountConfirm = async () => {
    if (!deleteTargetAccount) return;
    setDeletingAccount(true);
    try {
      await deleteUserAccount(deleteTargetAccount.user_id);
      toast.success(`تم حذف الحساب (${deleteTargetAccount.display_name})`);
      setDeleteTargetAccount(null);
      loadAccounts();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "تعذر حذف الحساب");
    } finally {
      setDeletingAccount(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        { data: millsData, error: millsError },
        { data: membershipsData, error: membershipsError },
        { data: lastPayments },
        { data: seasons },
        { data: invoices },
        { data: adminRoles }
      ] = await Promise.all([
        (supabase as any).from("mills").select("*").order("created_at", { ascending: false }),
        (supabase as any).from("mill_memberships").select("id, mill_id, user_id, role, username, display_username"),
        (supabase as any).from("subscription_payments").select("mill_user_id, payment_date, mill_id").order("payment_date", { ascending: false }),
        (supabase as any).from("seasons").select("mill_id, status"),
        (supabase as any).from("invoices").select("oil_produced, created_at, user_id, mill_id"),
        supabase.from("user_roles").select("user_id").eq("role", "platform_admin")
      ]);

      if (millsError) {
        console.error("Admin data fetch error (mills):", millsError);
        toast.error("فشل جلب قائمة المعاصر: " + (millsError.message || "خطأ غير معروف"));
        setLoading(false);
        return;
      }

      if (membershipsError) {
        console.warn("Admin data fetch warning (memberships):", membershipsError);
      }

      const adminUserIds = new Set((adminRoles || []).map((r: any) => r.user_id));
      const pureMillsData = (millsData || []).filter((m: any) => !adminUserIds.has(m.owner_user_id));

      const membershipsByMill = new Map<string, any[]>();
      (membershipsData || []).forEach((m: any) => {
        if (m.mill_id) {
          const list = membershipsByMill.get(m.mill_id) || [];
          list.push(m);
          membershipsByMill.set(m.mill_id, list);
        }
      });

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
      const totalOil = (invoices || []).reduce((sum: number, inv: any) => sum + (inv.oil_produced || 0), 0);
      const activeMillIds = new Set(
        (seasons || [])
          .filter((s: any) => s.status === 'active' && s.mill_id)
          .map((s: any) => s.mill_id)
      );

      setStats({
        totalMills: pureMillsData.length,
        activeMills: pureMillsData.filter((m: any) => activeMillIds.has(m.id)).length,
        newThisWeek: pureMillsData.filter((m: any) => new Date(m.created_at) >= oneWeekAgo).length,
        newThisMonth: pureMillsData.filter((m: any) => new Date(m.created_at) >= oneMonthAgo).length,
        totalInvoices: (invoices || []).length,
        totalOil,
      });

      const millList = pureMillsData.map((mill: any) => {
        const millMembers = membershipsByMill.get(mill.id) || [];
        const ownerMembership = millMembers.find((mm: any) => mm.role === 'mill_owner' || mm.user_id === mill.owner_user_id);
        const employeeCount = millMembers.filter((mm: any) => mm.role === 'mill_employee').length;
        const millInvoices = (invoices || []).filter((inv: any) => inv.mill_id === mill.id);
        const millPayments = (lastPayments || []).filter((p: any) => p.mill_id === mill.id);
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
          isActive: activeMillIds.has(mill.id),
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
      console.error("Admin data fetch error:", error);
      toast.error("حدث خطأ أثناء تحميل بيانات المعاصر");
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    fetchData();
    fetchContactSettings();
    loadAccounts();
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

  if (loading) return <div className="p-8 text-center font-medium">جارٍ التحميل...</div>;

  const filteredMills = statusFilter === "all" 
    ? mills 
    : mills.filter(mill => mill.subscriptionStatus === statusFilter);

  const filteredAccounts = accounts.filter(acc => {
    if (accountRoleFilter !== "all" && acc.role !== accountRoleFilter) {
      return false;
    }
    if (accountSearchQuery.trim()) {
      const q = accountSearchQuery.toLowerCase().trim();
      const matchName = (acc.display_name || "").toLowerCase().includes(q);
      const matchUser = (acc.username || "").toLowerCase().includes(q);
      const matchMill = (acc.mill_name || "").toLowerCase().includes(q);
      return matchName || matchUser || matchMill;
    }
    return true;
  });

  const getStatusBadge = (status: string, isActive?: boolean) => {
    if (isActive === false || status === 'disabled') {
      return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">معطّل</Badge>;
    }
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

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'platform_admin':
        return (
          <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 gap-1 font-bold">
            <ShieldCheck className="h-3 w-3 text-amber-600" />
            <span>مشرف عام (Platform Admin)</span>
          </Badge>
        );
      case 'mill_owner':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 gap-1 font-semibold">
            <User className="h-3 w-3 text-blue-600" />
            <span>صاحب معصرة (Owner)</span>
          </Badge>
        );
      case 'mill_employee':
      default:
        return (
          <Badge variant="secondary" className="gap-1 font-medium text-xs">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span>كاشير (موظف)</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">لوحة تحكم المشرف العام</h1>
          <p className="text-xs text-muted-foreground mt-1">إدارة المعاصر، الحسابات، بيانات الاعتماد، والاشتراكات</p>
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
                  {/* معلومات المالك */}
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
                        className="text-left font-mono h-9 text-sm"
                        value={newAccountData.owner_email}
                        onChange={e => setNewAccountData(prev => ({...prev, owner_email: e.target.value}))}
                      />
                    </div>
                  </div>

                  {/* معلومات المعصرة وحساب الدخول */}
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
                        onChange={e => setNewAccountData(prev => ({...prev, country: e.target.value}))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="username" className="text-right block text-xs font-semibold">اسم المستخدم (Username للدخول) *</Label>
                      <Input 
                        id="username" 
                        required 
                        dir="ltr"
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
                          className="text-left font-mono h-9 text-sm"
                          value={newAccountData.password}
                          onChange={e => setNewAccountData(prev => ({...prev, password: e.target.value}))}
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={generatePassword}
                          className="whitespace-nowrap h-9 text-xs"
                        >
                          توليد
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateModalOpen(false)}
                      disabled={createLoading}
                    >
                      إلغاء
                    </Button>
                    <Button 
                      type="submit" 
                      className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={createLoading}
                    >
                      {createLoading ? "جارٍ الإنشاء..." : "إنشاء الحساب والمعصرة"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4 py-3 text-right">
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-center space-y-1">
                    <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto" />
                    <h3 className="font-bold text-sm text-green-800 dark:text-green-300">تم إنشاء الحساب والمعصرة بنجاح</h3>
                    <p className="text-xs text-muted-foreground">تم تشفير كلمة المرور وحفظها في الخزينة الإدارية بأمان</p>
                  </div>

                  <div className="p-3.5 bg-muted/60 rounded-xl border border-border/80 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">اسم المعصرة:</span>
                      <span className="font-bold text-foreground">{createdCredentials.mill_name}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">اسم صاحب المعصرة:</span>
                      <span className="font-medium text-foreground">{createdCredentials.owner_name}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">اسم المستخدم للدخول:</span>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-primary">
                        <span>{createdCredentials.username}</span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-5 w-5" 
                          onClick={() => copyToClipboard(createdCredentials.username, "اسم المستخدم")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">كلمة المرور:</span>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-amber-700 dark:text-amber-300">
                        <span>{createdCredentials.password}</span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-5 w-5" 
                          onClick={() => copyToClipboard(createdCredentials.password, "كلمة المرور")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Button 
                    className="w-full bg-primary" 
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      setCreatedCredentials(null);
                    }}
                  >
                    تم، إغلاق النافذة
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-xl h-11 p-1 bg-muted/60">
          <TabsTrigger value="mills" className="gap-2 text-xs sm:text-sm font-semibold">
            <Building2 className="h-4 w-4" />
            <span>سجل المعاصر ({mills.length})</span>
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-2 text-xs sm:text-sm font-semibold">
            <Users className="h-4 w-4" />
            <span>إدارة الحسابات ({accounts.length})</span>
          </TabsTrigger>
          <TabsTrigger value="contact" className="gap-2 text-xs sm:text-sm font-semibold">
            <Phone className="h-4 w-4" />
            <span>إعدادات التواصل</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Mills Directory & Stats */}
        <TabsContent value="mills" className="space-y-6">
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
                <div className="text-2xl font-bold">{(Number(stats.totalOil) || 0).toLocaleString()} كغم</div>
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
                      <TableCell className="font-bold text-foreground text-right">{safeText(mill.millName, "معصرة غير مسماة")}</TableCell>
                      <TableCell className="font-medium text-muted-foreground text-right">{safeText(mill.ownerName, "غير محدد")}</TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs">
                          <span className="font-medium text-foreground">{safeText(mill.millLocation, "غير محدد")}</span>
                          <span className="text-muted-foreground me-1"> ({safeText(mill.country, "فلسطين")})</span>
                        </div>
                      </TableCell>
                      <TableCell dir="ltr" className="text-right text-xs font-mono">
                        <div>{safeText(mill.phone, "---")}</div>
                        {mill.secondaryPhone && <div className="text-muted-foreground text-[10px]">{safeText(mill.secondaryPhone)}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-right">{formatDate(mill.createdAt)}</TableCell>
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
        </TabsContent>

        {/* TAB 2: Unified Accounts & Credentials Management */}
        <TabsContent value="accounts" className="space-y-6">
          <Card className="text-right">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2 text-right">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <span>إدارة الحسابات والمستخدمين (Accounts & Credentials Vault)</span>
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  عرض وإدارة حسابات المشرف العام، أصحاب المعاصر، وموظفي الكاشير مع تشفير كامل لكلمات المرور
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {/* Search Input */}
                <div className="relative flex-1 sm:w-60">
                  <Search className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="بحث بالاسم أو اسم الدخول أو المعصرة..." 
                    value={accountSearchQuery}
                    onChange={(e) => setAccountSearchQuery(e.target.value)}
                    className="h-9 pr-8 text-xs text-right"
                  />
                </div>

                {/* Role Filter */}
                <Select value={accountRoleFilter} onValueChange={setAccountRoleFilter}>
                  <SelectTrigger className="w-[160px] h-9 text-xs text-right" dir="rtl">
                    <SelectValue placeholder="تصفية حسب الدور" />
                  </SelectTrigger>
                  <SelectContent dir="rtl" className="text-right text-xs">
                    <SelectItem value="all">كل الأدوار</SelectItem>
                    <SelectItem value="platform_admin">المشرف العام (Platform Admin)</SelectItem>
                    <SelectItem value="mill_owner">أصحاب المعاصر (Owners)</SelectItem>
                    <SelectItem value="mill_employee">موظفو الكاشير (Employees)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Refresh Button */}
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-9 w-9" 
                  onClick={loadAccounts}
                  disabled={accountsLoading}
                  title="تحديث القائمة"
                >
                  <RefreshCw className={`h-4 w-4 ${accountsLoading ? 'animate-spin text-primary' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم صاحب الحساب</TableHead>
                    <TableHead className="text-right">اسم المستخدم (Username)</TableHead>
                    <TableHead className="text-right">كلمة المرور (Password)</TableHead>
                    <TableHead className="text-right">الدور / الصلاحيات</TableHead>
                    <TableHead className="text-right">المعصرة المرتبطة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((acc) => {
                    const isPassVisible = visibleAccountPasswords[acc.user_id] || false;
                    const plainPass = decryptedAccountPasswords[acc.user_id];
                    const isDecrypting = decryptingAccountLoading[acc.user_id] || false;

                    return (
                      <TableRow key={acc.user_id} className={acc.role === 'platform_admin' ? 'bg-amber-500/5' : ''}>
                        {/* Name */}
                        <TableCell className="font-bold text-foreground text-right">
                          <div className="flex items-center gap-2">
                            <span>{acc.display_name}</span>
                            {acc.role === 'platform_admin' && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 text-amber-700 bg-amber-50">
                                نظامي
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Username */}
                        <TableCell className="font-mono text-xs font-semibold text-primary text-right">
                          <div className="flex items-center gap-1 justify-start">
                            <span>{acc.username}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground hover:text-foreground"
                              title="نسخ اسم المستخدم"
                              onClick={() => {
                                navigator.clipboard.writeText(acc.username);
                                toast.success("تم نسخ اسم المستخدم");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>

                        {/* Password with On-Demand Reveal & Copy */}
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1.5 justify-start">
                            <code className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-mono font-bold px-2 py-0.5 rounded text-xs select-all">
                              {isPassVisible ? (plainPass || "••••••") : "••••••"}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isDecrypting}
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              title={isPassVisible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور (فك تشفير آمن)"}
                              onClick={() => toggleAccountPasswordVisibility(acc)}
                            >
                              {isDecrypting ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                              ) : isPassVisible ? (
                                <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              title="نسخ كلمة المرور"
                              onClick={() => handleCopyAccountPassword(acc)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-primary"
                              title="تعديل أو تعيين كلمة مرور جديدة"
                              onClick={() => handleOpenAccountEdit(acc)}
                            >
                              <Key className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>

                        {/* Role */}
                        <TableCell className="text-right">
                          {getRoleBadge(acc.role)}
                        </TableCell>

                        {/* Associated Mill */}
                        <TableCell className="text-right">
                          {acc.role === 'platform_admin' ? (
                            <span className="text-xs text-muted-foreground italic font-mono">— بدون معصرة —</span>
                          ) : (
                            <div className="text-xs">
                              <span className="font-semibold text-foreground">{acc.mill_name}</span>
                              {acc.mill_code && (
                                <span className="text-muted-foreground font-mono me-1.5"> ({acc.mill_code})</span>
                              )}
                            </div>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-right">
                          {getStatusBadge(acc.status, acc.is_active)}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-start">
                            {acc.role !== 'platform_admin' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                                title={acc.is_active === false ? "إعادة تفعيل الحساب" : "تعطيل الحساب مؤقتاً"}
                                onClick={async () => {
                                  try {
                                    const newState = !acc.is_active;
                                    await toggleUserAccountActive(acc.user_id, newState);
                                    toast.success(newState ? `تم تفعيل الحساب: ${acc.display_name}` : `تم تعطيل الحساب: ${acc.display_name}`);
                                    loadAccounts();
                                  } catch (err: any) {
                                    toast.error(err.message || "تعذر تعديل حالة الحساب");
                                  }
                                }}
                              >
                                {acc.is_active === false ? (
                                  <UserCheck className="h-3.5 w-3.5 text-green-600" />
                                ) : (
                                  <UserX className="h-3.5 w-3.5 text-amber-600" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title="تعديل بيانات الحساب"
                              onClick={() => handleOpenAccountEdit(acc)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            {acc.role === 'mill_owner' && acc.mill_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => navigate(`/admin/mill/${acc.mill_id}`)}
                              >
                                المعصرة
                              </Button>
                            )}
                            {acc.role === 'mill_employee' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="حذف / تعطيل حساب الكاشير"
                                onClick={() => setDeleteTargetAccount(acc)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredAccounts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {accountsLoading ? "جارٍ تحميل الحسابات..." : "لا توجد حسابات مطابقة لمعايير البحث"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Contact & Platform Settings */}
        <TabsContent value="contact" className="space-y-6">
          <Card className="text-right">
            <CardHeader>
              <CardTitle className="text-right text-lg flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span>إعدادات التواصل والدعم الفني للمشتركين</span>
              </CardTitle>
              <CardDescription className="text-right text-xs">
                الروابط ومعلومات الاتصال التي تظهر لأصحاب المعاصر عند انتهاء أو تعليق اشتراكاتهم
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-xl">
                <div className="space-y-2">
                  <label className="text-sm font-medium block text-right">رابط صفحة تجديد الاشتراك (Portal URL)</label>
                  <Input
                    type="url"
                    value={contactLink}
                    onChange={(e) => setContactLink(e.target.value)}
                    placeholder="https://example.com/subscribe"
                    dir="ltr"
                    className="text-left font-mono"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                
                <div className="flex justify-start pt-2">
                  <Button onClick={handleUpdateContactSettings} disabled={updatingLink}>
                    {updatingLink ? "جاري الحفظ..." : "حفظ إعدادات التواصل"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Account Modal */}
      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent className="sm:max-w-[460px] text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right text-lg">
              تعديل بيانات الحساب ({editingAccount?.display_name})
            </DialogTitle>
            <DialogDescription className="text-right text-xs">
              تعديل اسم الموظف أو اسم الدخول وتعيين كلمة مرور جديدة في الخزينة
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-right">
            <div className="space-y-1.5">
              <Label className="text-right block text-xs font-semibold">الاسم الكامل / صاحب الحساب *</Label>
              <Input
                value={editAccountForm.name}
                onChange={(e) => setEditAccountForm((p) => ({ ...p, name: e.target.value }))}
                className="text-right h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-right block text-xs font-semibold">اسم المستخدم للدخول (Username) *</Label>
              <Input
                value={editAccountForm.username}
                dir="ltr"
                onChange={(e) => setEditAccountForm((p) => ({ ...p, username: e.target.value }))}
                className="text-left font-mono h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-right block text-xs font-semibold">كلمة المرور الجديدة</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[11px] text-primary"
                  onClick={generateEditPassword}
                >
                  توليد كلمة مرور
                </Button>
              </div>
              <div className="relative">
                <Input
                  type={showEditAccountPassword ? "text" : "password"}
                  value={editAccountForm.password}
                  dir="ltr"
                  placeholder="اتركها فارغة إذا لم ترغب في التغيير"
                  onChange={(e) => setEditAccountForm((p) => ({ ...p, password: e.target.value }))}
                  className="text-left font-mono h-9 text-sm pl-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowEditAccountPassword((p) => !p)}
                >
                  {showEditAccountPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                عند حفظ كلمة المرور، سيتم تشفيرها وحفظها في الخزينة الإدارية وتحديث حساب الدخول.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingAccount(null)} disabled={savingAccountEdit}>
              إلغاء
            </Button>
            <Button onClick={handleSaveAccountEdit} disabled={savingAccountEdit} className="bg-primary">
              {savingAccountEdit ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteTargetAccount} onOpenChange={(o) => !o && setDeleteTargetAccount(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تعطيل وأرشفة الحساب</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من تعطيل/أرشفة الحساب <strong>{deleteTargetAccount?.display_name || deleteTargetAccount?.username}</strong>؟ سيتم إيقاف صلاحية الدخول وحفظ كافة السجلات والفواتير التاريخية المرتبطة به بأمان دون حذف بيانات.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccountConfirm}
              disabled={deletingAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingAccount ? "جارٍ التعطيل..." : "تأكيد التعطيل والأرشفة"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
