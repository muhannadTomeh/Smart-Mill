import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Save, Plus, Trash2, Key, Link as LinkIcon, LogOut, ShieldCheck, Building2, MapPin, User, Phone, Globe, UserCheck } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useInventory } from "@/hooks/useInventory";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";

interface ContainerType {
  id: string;
  name: string;
  price: number;
}

const COUNTRIES = [
  "فلسطين",
  "الأردن",
  "سوريا",
  "لبنان",
  "تونس",
  "المغرب",
  "الجزائر",
  "السعودية",
  "تركيا",
  "دولة أخرى"
];

export default function Settings() {
  const { user, profile, refreshProfile } = useAuth();
  const { activeSeason, refetch: refetchSeasons } = useSeason();
  const { settings, loading } = useSettings();
  const { inventory, updateInventory } = useInventory();
  const { toast } = useToast();

  const [profileForm, setProfileForm] = useState({
    mill_name: "",
    display_name: "",
    country: "فلسطين",
    mill_location: "",
    phone: "",
    secondary_phone: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [form, setForm] = useState({
    return_percent: "",
    oil_sell_price: "",
    oil_buy_price: "",
    cash_return_cost: ""
  });

  const [inventoryForm, setInventoryForm] = useState({
    total_oil: "",
    total_cash: ""
  });

  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [newContainerName, setNewContainerName] = useState("");
  const [newContainerPrice, setNewContainerPrice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<{ id: string, name: string }[]>([]);
  const [newExpenseCategoryName, setNewExpenseCategoryName] = useState("");
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  
  const [containerDeleteTarget, setContainerDeleteTarget] = useState<ContainerType | null>(null);
  const [expenseDeleteTarget, setExpenseDeleteTarget] = useState<{ id: string, name: string } | null>(null);
  const [reportPin, setReportPin] = useState("");
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);  // Cashier Sub-Accounts (read-only — management done by Admin panel)
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("id, display_name, phone, created_at")
        .eq("parent_mill_id", user.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setEmployees(data || []));
    }
  }, [user]);


  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        mill_name: profile.mill_name || "",
        display_name: profile.display_name || "",
        country: profile.country || "فلسطين",
        mill_location: profile.mill_location || "",
        phone: profile.phone || "",
        secondary_phone: profile.secondary_phone || ""
      });
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!profileForm.mill_name.trim()) {
      toast({ title: "خطأ", description: "اسم المعصرة مطلوب", variant: "destructive" });
      return;
    }
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          mill_name: profileForm.mill_name.trim(),
          display_name: profileForm.display_name.trim(),
          country: profileForm.country,
          mill_location: profileForm.mill_location.trim(),
          phone: profileForm.phone.trim(),
          secondary_phone: profileForm.secondary_phone.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;
      await refreshProfile();
      toast({ title: "تم الحفظ بنجاح", description: "تم تحديث بيانات المعصرة بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "فشل حفظ بيانات المعصرة", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (data) setUserRole(data.role);
    };
    fetchUserRole();
  }, [user]);

  useEffect(() => {
    if (!loading) {
      setForm({
        return_percent: String(settings.return_percent),
        oil_sell_price: String(settings.oil_sell_price),
        oil_buy_price: String(settings.oil_buy_price),
        cash_return_cost: String(settings.cash_return_cost)
      });
      setInventoryForm({
        total_oil: String(inventory.total_oil),
        total_cash: String(inventory.total_cash)
      });
    }
  }, [loading, settings, inventory]);

  useEffect(() => {
    if (user && activeSeason) {
      fetchContainerTypes();
      fetchExpenseCategories();
    }
  }, [user, activeSeason]);

  const fetchExpenseCategories = async () => {
    if (!user || !activeSeason) return;
    const { data } = await supabase
      .from("expense_categories")
      .select("*")
      .eq("user_id", user.id)
      .eq("season_id", activeSeason.id)
      .order("name", { ascending: true });
    setExpenseCategories(data || []);
  };

  const addExpenseCategory = async () => {
    if (!user || !activeSeason || !newExpenseCategoryName.trim()) return;
    const { error } = await supabase.from("expense_categories").insert({
      user_id: user.id,
      season_id: activeSeason.id,
      name: newExpenseCategoryName.trim()
    });
    if (!error) {
      toast({ title: "تمت الإضافة", description: `تم إضافة نوع المصروف "${newExpenseCategoryName}"` });
      setNewExpenseCategoryName("");
      setExpenseDialogOpen(false);
      fetchExpenseCategories();
    }
  };

  const deleteExpenseCategory = async () => {
    if (!expenseDeleteTarget) return;
    await supabase.from("expense_categories").delete().eq("id", expenseDeleteTarget.id);
    setExpenseDeleteTarget(null);
    fetchExpenseCategories();
  };

  const fetchContainerTypes = async () => {
    if (!user || !activeSeason) return;
    const { data } = await supabase.
    from("container_types").
    select("*").
    eq("user_id", user.id).
    eq("season_id", activeSeason.id).
    order("created_at", { ascending: true });
    setContainerTypes(data as ContainerType[] || []);
  };

  const addContainerType = async () => {
    if (!user || !activeSeason || !newContainerName.trim() || !newContainerPrice) return;
    const { error } = await supabase.from("container_types").insert({
      user_id: user.id,
      season_id: activeSeason.id,
      name: newContainerName.trim(),
      price: parseFloat(newContainerPrice)
    });
    if (!error) {
      toast({ title: "تمت الإضافة", description: `تم إضافة نوع "${newContainerName}"` });
      setNewContainerName("");
      setNewContainerPrice("");
      setDialogOpen(false);
      fetchContainerTypes();
    }
  };

  const deleteContainerType = async () => {
    if (!containerDeleteTarget) return;
    await supabase.from("container_types").delete().eq("id", containerDeleteTarget.id);
    setContainerDeleteTarget(null);
    fetchContainerTypes();
  };

  const saveSettings = async () => {
    if (!activeSeason) return;
    const { error } = await supabase.from("seasons").update({
      return_percent: parseFloat(form.return_percent),
      oil_sell_price: parseFloat(form.oil_sell_price),
      oil_buy_price: parseFloat(form.oil_buy_price),
      cash_return_cost: parseFloat(form.cash_return_cost),
    }).eq("id", activeSeason.id);
    if (!error) {
      await refetchSeasons();
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات المعصرة بنجاح" });
    }
  };

  const saveInventory = async () => {
    const result = await updateInventory({
      total_oil: parseFloat(inventoryForm.total_oil),
      total_cash: parseFloat(inventoryForm.total_cash)
    });
    if (!result?.error) {
      toast({ title: "تم الحفظ", description: "تم تحديث المخزون بنجاح" });
    }
  };

  const updateReportPin = async () => {
    setIsUpdatingPin(true);
    try {
      const { error } = await supabase.rpc("set_report_pin", {
        new_pin: reportPin
      });
      if (error) throw error;
      toast({ 
        title: "تم تحديث رمز الحماية", 
        description: reportPin ? "تم تفعيل حماية التقارير بالرمز الجديد" : "تم إلغاء حماية التقارير" 
      });
      setReportPin("");
    } catch (error) {
      console.error("Error updating PIN:", error);
      toast({ 
        title: "خطأ", 
        description: "حدث خطأ أثناء تحديث رمز الحماية",
        variant: "destructive" 
      });
    } finally {
      setIsUpdatingPin(false);
    }
  };


  const updatePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "خطأ",
        description: "كلمات المرور غير متطابقة",
        variant: "destructive"
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "خطأ",
        description: "يجب أن تكون كلمة المرور 6 أحرف على الأقل",
        variant: "destructive"
      });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "تم التحديث", description: "تم تغيير كلمة المرور بنجاح" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء تحديث كلمة المرور",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ", description: "تم نسخ النص إلى الحافظة" });
  };

  if (loading) return <p className="text-center py-8 text-muted-foreground">جارٍ التحميل...</p>;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">الإعدادات</h1>
        </div>
      </div>

      {/* Mill Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            بيانات وملف المعصرة
          </CardTitle>
          <CardDescription>الاسم، الموقع، وأرقام التواصل التي تظهر في الفواتير والنظام</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>اسم المعصرة *</Label>
              <Input 
                value={profileForm.mill_name} 
                onChange={(e) => setProfileForm(p => ({ ...p, mill_name: e.target.value }))} 
                placeholder="اسم المعصرة..." 
              />
            </div>
            <div className="space-y-2">
              <Label>اسم المالك / المدير</Label>
              <Input 
                value={profileForm.display_name} 
                onChange={(e) => setProfileForm(p => ({ ...p, display_name: e.target.value }))} 
                placeholder="اسم المالك..." 
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>الدولة</Label>
              <Select value={profileForm.country} onValueChange={(val) => setProfileForm(p => ({ ...p, country: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الدولة" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>موقع / مدينة المعصرة</Label>
              <Input 
                value={profileForm.mill_location} 
                onChange={(e) => setProfileForm(p => ({ ...p, mill_location: e.target.value }))} 
                placeholder="مثال: نابلس - حوارة" 
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>رقم الهاتف الأساسي</Label>
              <Input 
                type="tel"
                value={profileForm.phone} 
                onChange={(e) => setProfileForm(p => ({ ...p, phone: e.target.value }))} 
                placeholder="05XXXXXXXX" 
              />
            </div>
            <div className="space-y-2">
              <Label>رقم هاتف إضافي (اختياري)</Label>
              <Input 
                type="tel"
                value={profileForm.secondary_phone} 
                onChange={(e) => setProfileForm(p => ({ ...p, secondary_phone: e.target.value }))} 
                placeholder="هاتف أرضي أو رقم آخر" 
              />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={savingProfile} className="gap-2">
            <Save className="h-4 w-4" />
            {savingProfile ? "جارٍ الحفظ..." : "حفظ بيانات المعصرة"}
          </Button>
        </CardContent>
      </Card>

      {userRole === 'mill_owner' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              الأمان — تغيير كلمة المرور
            </CardTitle>
            <CardDescription>تحديث كلمة المرور الخاصة بحساب صاحب المعصرة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>كلمة المرور الجديدة</Label>
                <Input 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="6 أحرف على الأقل..."
                />
              </div>
              <div className="space-y-2">
                <Label>تأكيد كلمة المرور</Label>
                <Input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  placeholder="أعد إدخال كلمة المرور..."
                />
              </div>
            </div>
            <Button onClick={updatePassword} disabled={isUpdatingPassword || !newPassword}>
              {isUpdatingPassword ? "جارٍ التحديث..." : "تحديث كلمة المرور"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>إعدادات المعصرة والثوابت</CardTitle>
          <CardDescription>الثوابت المستخدمة في حساب الفواتير وطرق الدفع</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>نسبة الرد (%)</Label>
              <Input type="number" value={form.return_percent} onChange={(e) => setForm((p) => ({ ...p, return_percent: e.target.value }))} min="0" step="0.1" />
            </div>
            <div className="space-y-2">
              <Label>تكلفة الرد نقداً (شيكل/كغم)</Label>
              <Input type="number" value={form.cash_return_cost} onChange={(e) => setForm((p) => ({ ...p, cash_return_cost: e.target.value }))} min="0" step="0.1" />
            </div>
          </div>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>سعر بيع الزيت (شيكل/كغم)</Label>
              <Input type="number" value={form.oil_sell_price} onChange={(e) => setForm((p) => ({ ...p, oil_sell_price: e.target.value }))} min="0" step="0.1" />
            </div>
            <div className="space-y-2">
              <Label>سعر شراء الزيت (شيكل/كغم)</Label>
              <Input type="number" value={form.oil_buy_price} onChange={(e) => setForm((p) => ({ ...p, oil_buy_price: e.target.value }))} min="0" step="0.1" />
            </div>
          </div>
          <Button onClick={saveSettings}><Save className="h-4 w-4 me-2" />حفظ الإعدادات</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أنواع التنكات</CardTitle>
          <CardDescription>أضف أنواع التنكات المتوفرة في معصرتك مع أسعارها</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {containerTypes.length > 0 &&
          <div className="space-y-2">
              {containerTypes.map((ct) =>
            <div key={ct.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <span className="font-medium">{ct.name}</span>
                    <span className="text-muted-foreground me-2"> — {ct.price} شيكل</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setContainerDeleteTarget(ct)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
            )}
            </div>
          }
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 me-1" />إضافة نوع تنكة</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة نوع تنكة جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>اسم النوع</Label>
                  <Input value={newContainerName} onChange={(e) => setNewContainerName(e.target.value)} placeholder="مثال: بلاستيك، حديد..." />
                </div>
                <div className="space-y-2">
                  <Label>السعر (شيكل)</Label>
                  <Input type="number" value={newContainerPrice} onChange={(e) => setNewContainerPrice(e.target.value)} min="0" step="0.1" />
                </div>
                <Button onClick={addContainerType} disabled={!newContainerName.trim() || !newContainerPrice} className="w-full">
                  <Plus className="h-4 w-4 me-1" />إضافة
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أنواع المصاريف</CardTitle>
          <CardDescription>أضف أو عدل أنواع المصاريف التي تستخدمها في المعصرة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {expenseCategories.length > 0 &&
          <div className="space-y-2">
              {expenseCategories.map((ec) =>
            <div key={ec.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <span className="font-medium">{ec.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setExpenseDeleteTarget(ec)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
            )}
            </div>
          }
          <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 me-1" />إضافة نوع مصروف</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة نوع مصروف جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>اسم المصروف</Label>
                  <Input value={newExpenseCategoryName} onChange={(e) => setNewExpenseCategoryName(e.target.value)} placeholder="مثال: فطور، قطع غيار..." />
                </div>
                <Button onClick={addExpenseCategory} disabled={!newExpenseCategoryName.trim()} className="w-full">
                  <Plus className="h-4 w-4 me-1" />إضافة
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>المخزون والسيولة</CardTitle>
          <CardDescription>تعديل يدوي لرصيد الزيت والنقدية في المعصرة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>إجمالي الزيت (كغم)</Label>
              <Input type="number" value={inventoryForm.total_oil} onChange={(e) => setInventoryForm((p) => ({ ...p, total_oil: e.target.value }))} min="0" step="0.1" />
            </div>
            <div className="space-y-2">
              <Label>إجمالي النقدية (شيكل)</Label>
              <Input type="number" value={inventoryForm.total_cash} onChange={(e) => setInventoryForm((p) => ({ ...p, total_cash: e.target.value }))} min="0" step="0.1" />
            </div>
          </div>
          <Button onClick={saveInventory} variant="outline"><Save className="h-4 w-4 me-2" />تحديث المخزون</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أمن التقارير</CardTitle>
          <CardDescription>تعيين رمز حماية (PIN) لصفحة التقارير المالية</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>رمز الحماية الجديد (4 أرقام)</Label>
            <Input 
              type="password" 
              maxLength={4} 
              value={reportPin} 
              onChange={(e) => setReportPin(e.target.value.replace(/\D/g, ""))} 
              placeholder="أدخل 4 أرقام..."
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              إذا تُرك الحقل فارغاً، ستبقى صفحة التقارير مفتوحة بدون حماية.
            </p>
          </div>
          <Button onClick={updateReportPin} disabled={isUpdatingPin}>
            {isUpdatingPin ? "جارٍ التحديث..." : "حفظ رمز الحماية"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            حسابات موظفي الكاشير (Cashier Sub-Accounts)
          </CardTitle>
          <CardDescription>
            إنشاء وإدارة حسابات الكاشير يتم من خلال مسؤول النظام (Admin) لضمان أمان وتفرد أسماء المستخدمين عبر جميع المعاصر.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {employees.map((emp: any) => (
              <div key={emp.id} className="flex items-center justify-between p-3 border rounded-xl bg-muted/20">
                <div className="space-y-0.5">
                  <p className="font-bold text-sm text-foreground">{emp.display_name || "موظف كاشير"}</p>
                  <p className="text-xs text-primary font-mono font-medium">
                    {emp.phone || emp.display_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
                    طابور + فواتير فقط
                  </span>
                </div>
              </div>
            ))}
            {employees.length === 0 && (
              <p className="text-xs text-center text-muted-foreground py-4">
                لا توجد حسابات كاشير حتى الآن. تواصل مع مسؤول النظام لإنشاء حسابات الكاشير الخاصة بمعصرتك.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!containerDeleteTarget} onOpenChange={(o) => !o && setContainerDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف نوع التنكة</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف نوع التنكة <strong>{containerDeleteTarget?.name}</strong>؟ لا يمكن التراجع عن هذا الإجراء وقد يؤثر على الفواتير المستقبلية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={deleteContainerType} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف النوع
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!expenseDeleteTarget} onOpenChange={(o) => !o && setExpenseDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف نوع المصروف</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف نوع المصروف <strong>{expenseDeleteTarget?.name}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={deleteExpenseCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف النوع
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>);
}