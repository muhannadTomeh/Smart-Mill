import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Settings as SettingsIcon, Save, Plus, Trash2, Key, LogOut, 
  ShieldCheck, Building2, MapPin, User, Phone, Globe, UserCheck,
  Tv, ExternalLink, Copy, Sparkles, SlidersHorizontal, Receipt,
  Users, ChevronLeft, ArrowRight, HardHat, Printer, Coins,
  Package, DollarSign, Lock, Scale, CheckCircle2, AlertCircle
} from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useInventory } from "@/hooks/useInventory";
import { useCurrency, POPULAR_CURRENCIES } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { Link, useSearchParams } from "react-router-dom";
import { storeCredential } from "@/lib/credentialVault";

import {
  DynamicDisplayItem,
  getDynamicItems,
  DisplaySettings,
  defaultDisplaySettings,
} from "@/hooks/useDisplaySettings";
export type { DynamicDisplayItem, DisplaySettings };
export { defaultDisplaySettings };

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

// Navigation Types for the Settings Hub
type MainSectionId = 
  | "mill_info"          // 1. معلومات المعصرة
  | "operations"         // 2. التشغيل
  | "invoices_receipts"  // 3. الفواتير والإيصالات
  | "users_roles"        // 4. المستخدمون والصلاحيات
  | "account";           // 5. الحساب

type SubSettingId = 
  // Operations sub-settings
  | "pressing_rates"     // إعدادات العصر والأسعار
  | "container_types"    // أنواع العبوات
  | "display_screen"     // شاشة العرض
  | "inventory_cash"     // المخزون والسيولة
  // Invoices & Receipts sub-settings
  | "currency"           // العملة المعتمدة
  | "expense_categories" // أنواع المصاريف
  | "receipt_format"     // مواصفات الإيصالات والطباعة
  // Users & Roles sub-settings
  | "cashier_accounts"   // حسابات الكاشير
  | "workers_link"       // العمال والأجور
  | "roles_overview"     // نظام الصلاحيات
  // Account sub-settings
  | "account_profile"    // الملف الشخصي
  | "change_password"    // تغيير كلمة المرور
  | "admin_pin_setting"; // PIN لوحة الإدارة

export default function Settings() {
  const { user, millId, profile, refreshProfile } = useAuth();
  const { activeSeason, refetch: refetchSeasons } = useSeason();
  const { settings, loading } = useSettings();
  const { inventory, updateInventory } = useInventory();
  const { currency, setCurrency, currencies } = useCurrency();
  const { toast } = useToast();

  // Navigation State: Hub -> Section -> SubSetting -> Edit
  const [activeSection, setActiveSection] = useState<MainSectionId | null>(null);
  const [activeSubSetting, setActiveSubSetting] = useState<SubSettingId | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const section = searchParams.get("section") as MainSectionId | null;
    if (section && ["mill_info", "operations", "invoices_receipts", "users_roles", "account"].includes(section)) {
      setActiveSection(section);
      setActiveSubSetting(null);
    }
  }, [searchParams]);

  const [selectedCurrency, setSelectedCurrency] = useState(currency);

  useEffect(() => {
    setSelectedCurrency(currency);
  }, [currency]);

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
  const [currentAdminPin, setCurrentAdminPin] = useState("");
  const [newAdminPin, setNewAdminPin] = useState("");
  const [confirmAdminPin, setConfirmAdminPin] = useState("");
  const [isUpdatingAdminPin, setIsUpdatingAdminPin] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);

  // Screen display settings
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(defaultDisplaySettings);
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDetails, setNewItemDetails] = useState("");
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const loadedSeasonIdRef = useRef<string | null>(null);

  const displayUrl = activeSeason ? `${window.location.origin}/display/${activeSeason.id}` : "";

  // Load display settings once per active season
  useEffect(() => {
    if (!activeSeason?.id) return;
    if (loadedSeasonIdRef.current === activeSeason.id) return;
    loadedSeasonIdRef.current = activeSeason.id;

    const savedLocal = localStorage.getItem(`display_settings_${activeSeason.id}`);
    if (savedLocal) {
      try {
        const parsed = JSON.parse(savedLocal);
        const dynamic_items = getDynamicItems(parsed);
        setDisplaySettings({
          ...defaultDisplaySettings,
          ...parsed,
          dynamic_items: dynamic_items.length > 0 ? dynamic_items : defaultDisplaySettings.dynamic_items,
        });
      } catch {}
    } else if ((activeSeason as any).display_settings) {
      const raw = (activeSeason as any).display_settings;
      const dynamic_items = getDynamicItems(raw);
      setDisplaySettings({
        ...defaultDisplaySettings,
        ...raw,
        dynamic_items: dynamic_items.length > 0 ? dynamic_items : defaultDisplaySettings.dynamic_items,
      });
    }

    supabase
      .from("seasons")
      .select("display_settings")
      .eq("id", activeSeason.id)
      .single()
      .then(({ data }) => {
        if (data && (data as any).display_settings) {
          const ds = (data as any).display_settings;
          const dynamic_items = getDynamicItems(ds);
          setDisplaySettings((prev) => {
            const merged = {
              ...defaultDisplaySettings,
              ...ds,
              ...prev,
              dynamic_items: dynamic_items.length > 0 ? dynamic_items : (prev.dynamic_items || defaultDisplaySettings.dynamic_items),
            };
            if (activeSeason?.id) {
              localStorage.setItem(`display_settings_${activeSeason.id}`, JSON.stringify(merged));
            }
            return merged;
          });
        }
      });
  }, [activeSeason?.id]);

  const broadcastSettingsChange = (settings: DisplaySettings) => {
    try {
      const bc = new BroadcastChannel("smart_mill_display_channel");
      bc.postMessage({
        type: "UPDATE_DISPLAY_SETTINGS",
        seasonId: activeSeason?.id,
        settings,
      });
      bc.close();
    } catch {}
  };

  const updateDisplaySetting = <K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) => {
    setDisplaySettings((prev) => {
      const updated = { ...prev, [key]: value };
      if (activeSeason?.id) {
        localStorage.setItem(`display_settings_${activeSeason.id}`, JSON.stringify(updated));
        localStorage.setItem("display_settings_global", JSON.stringify(updated));
      }
      broadcastSettingsChange(updated);
      return updated;
    });
  };

  const handleSaveDisplaySettings = async () => {
    if (!activeSeason) {
      toast({ title: "تنبيه", description: "يرجى تفعيل موسم أولاً", variant: "destructive" });
      return;
    }
    setSavingDisplay(true);
    try {
      localStorage.setItem(`display_settings_${activeSeason.id}`, JSON.stringify(displaySettings));
      localStorage.setItem("display_settings_global", JSON.stringify(displaySettings));
      broadcastSettingsChange(displaySettings);

      const { error } = await supabase
        .from("seasons")
        .update({ display_settings: displaySettings } as any)
        .eq("id", activeSeason.id);

      if (error && !error.message?.includes("display_settings")) {
        throw error;
      }

      toast({ title: "تم الحفظ بنجاح", description: "تم تحديث وتطبيق إعدادات شاشة العرض العامة" });
      if (refetchSeasons) refetchSeasons();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر حفظ إعدادات الشاشة", variant: "destructive" });
    } finally {
      setSavingDisplay(false);
    }
  };

  const addDynamicItem = () => {
    if (!newItemTitle.trim() || !newItemDetails.trim()) {
      toast({ title: "تنبيه", description: "يرجى كتابة العنوان والتفاصيل", variant: "destructive" });
      return;
    }
    const newItem: DynamicDisplayItem = {
      id: Date.now().toString(),
      title: newItemTitle.trim(),
      details: newItemDetails.trim(),
      visible: true,
    };
    setDisplaySettings((prev) => {
      const currentItems = getDynamicItems(prev);
      const updatedItems = [...currentItems, newItem];
      const updated = {
        ...prev,
        dynamic_items: updatedItems,
        custom_faqs: updatedItems.map((it) => ({ id: it.id, q: it.title, a: it.details })),
      };
      if (activeSeason?.id) {
        localStorage.setItem(`display_settings_${activeSeason.id}`, JSON.stringify(updated));
        localStorage.setItem("display_settings_global", JSON.stringify(updated));
      }
      broadcastSettingsChange(updated);
      return updated;
    });
    setNewItemTitle("");
    setNewItemDetails("");
    setAddItemDialogOpen(false);
    toast({ title: "تمت الإضافة بنجاح", description: `تمت إضافة "${newItem.title}" للشاشة بنجاح` });
  };

  const toggleItemVisibility = (id: string) => {
    setDisplaySettings((prev) => {
      const currentItems = getDynamicItems(prev);
      const updatedItems = currentItems.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item
      );
      const updated = {
        ...prev,
        dynamic_items: updatedItems,
        custom_faqs: updatedItems.map((it) => ({ id: it.id, q: it.title, a: it.details })),
      };
      if (activeSeason?.id) {
        localStorage.setItem(`display_settings_${activeSeason.id}`, JSON.stringify(updated));
        localStorage.setItem("display_settings_global", JSON.stringify(updated));
      }
      broadcastSettingsChange(updated);
      return updated;
    });
  };

  const removeDynamicItem = (id: string) => {
    setDisplaySettings((prev) => {
      const currentItems = getDynamicItems(prev);
      const updatedItems = currentItems.filter((item) => item.id !== id);
      const updated = {
        ...prev,
        dynamic_items: updatedItems,
        custom_faqs: updatedItems.map((it) => ({ id: it.id, q: it.title, a: it.details })),
      };
      if (activeSeason?.id) {
        localStorage.setItem(`display_settings_${activeSeason.id}`, JSON.stringify(updated));
        localStorage.setItem("display_settings_global", JSON.stringify(updated));
      }
      broadcastSettingsChange(updated);
      return updated;
    });
  };

  const clearAllDynamicItems = () => {
    setDisplaySettings((prev) => {
      const updated = {
        ...prev,
        dynamic_items: [],
        custom_faqs: [],
      };
      if (activeSeason?.id) {
        localStorage.setItem(`display_settings_${activeSeason.id}`, JSON.stringify(updated));
        localStorage.setItem("display_settings_global", JSON.stringify(updated));
      }
      broadcastSettingsChange(updated);
      return updated;
    });
  };

  useEffect(() => {
    const loadEmployees = async () => {
      if (!user) return;
      const targetMillId = millId;
      if (targetMillId) {
        const { data: mems, error: memsErr } = await supabase
          .from("mill_memberships")
          .select("id, user_id, role, username, display_username, created_at, is_active")
          .eq("mill_id", targetMillId)
          .eq("role", "mill_employee")
          .order("created_at", { ascending: false });

        if (!memsErr && mems && mems.length > 0) {
          const userIds = mems.map((m: any) => m.user_id).filter(Boolean);
          const profMap = new Map<string, any>();
          if (userIds.length > 0) {
            try {
              const { data: profs } = await supabase
                .from("profiles")
                .select("user_id, display_name, phone")
                .in("user_id", userIds);
              (profs || []).forEach((p: any) => profMap.set(p.user_id, p));
            } catch (pErr) {
              console.warn("Could not query profiles for employees:", pErr);
            }
          }

          setEmployees(
            mems.map((m: any) => {
              const p = profMap.get(m.user_id);
              return {
                id: m.id,
                user_id: m.user_id,
                display_name: p?.display_name || m.display_username || m.username,
                phone: p?.phone || m.username || m.display_username,
                created_at: m.created_at,
                is_active: m.is_active !== false,
              };
            })
          );
          return;
        }
      }
      setEmployees([]);
    };

    loadEmployees();
  }, [user, millId]);

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
    if (activeSeason) {
      fetchContainerTypes();
      fetchExpenseCategories();
    }
  }, [activeSeason?.id]);

  const fetchExpenseCategories = async () => {
    if (!activeSeason) return;
    let query = supabase
      .from("expense_categories")
      .select("*")
      .eq("season_id", activeSeason.id);

    if (millId || activeSeason.mill_id) {
      query = (query as any).eq("mill_id", millId || activeSeason.mill_id);
    } else if (user?.id) {
      query = query.eq("user_id", user.id);
    }

    const { data } = await query.order("name", { ascending: true });
    setExpenseCategories(data || []);
  };

  const addExpenseCategory = async () => {
    if (!activeSeason || !newExpenseCategoryName.trim()) return;
    const { error } = await supabase.from("expense_categories").insert({
      user_id: user?.id!,
      mill_id: millId || activeSeason.mill_id || null,
      season_id: activeSeason.id,
      name: newExpenseCategoryName.trim()
    } as any);
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
    if (!activeSeason) return;
    let query = supabase
      .from("container_types")
      .select("*")
      .eq("season_id", activeSeason.id);

    if (millId || activeSeason.mill_id) {
      query = (query as any).eq("mill_id", millId || activeSeason.mill_id);
    } else if (user?.id) {
      query = query.eq("user_id", user.id);
    }

    const { data } = await query.order("created_at", { ascending: true });
    setContainerTypes(data as ContainerType[] || []);
  };

  const addContainerType = async () => {
    if (!activeSeason || !newContainerName.trim() || !newContainerPrice) return;
    const { error } = await supabase.from("container_types").insert({
      user_id: user?.id!,
      mill_id: millId || activeSeason.mill_id || null,
      season_id: activeSeason.id,
      name: newContainerName.trim(),
      price: parseFloat(newContainerPrice)
    } as any);
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
    setCurrency(selectedCurrency);
    const { error } = await supabase.from("seasons").update({
      return_percent: parseFloat(form.return_percent),
      oil_sell_price: parseFloat(form.oil_sell_price),
      oil_buy_price: parseFloat(form.oil_buy_price),
      cash_return_cost: parseFloat(form.cash_return_cost),
    }).eq("id", activeSeason.id);
    if (!error) {
      await refetchSeasons();
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات المعصرة والعملة بنجاح" });
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

  const updateAdminPin = async () => {
    if (!user) return;
    if (!newAdminPin || newAdminPin.length < 4 || newAdminPin.length > 8) {
      toast({
        title: "خطأ",
        description: "يجب أن يتكون رمز PIN من 4 إلى 8 أرقام",
        variant: "destructive"
      });
      return;
    }
    if (newAdminPin !== confirmAdminPin) {
      toast({
        title: "خطأ",
        description: "رمز PIN الجديد وتأكيده غير متطابقين",
        variant: "destructive"
      });
      return;
    }

    setIsUpdatingAdminPin(true);
    try {
      // 1. Verify current PIN if provided
      if (currentAdminPin) {
        const { data: verifyData, error: verifyErr } = await supabase.rpc("verify_admin_pin", {
          input_pin: currentAdminPin.trim()
        });
        if (verifyErr || verifyData !== true) {
          throw new Error("رمز PIN الحالي غير صحيح");
        }
      }

      // 2. Set new PIN in database via set_admin_pin RPC (bcrypt hashed)
      const { error: rpcErr } = await supabase.rpc("set_admin_pin", {
        new_pin: newAdminPin.trim()
      });
      if (rpcErr) throw rpcErr;

      // 3. Sync encrypted PIN in Credential Vault
      let vaultSynced = true;
      try {
        await storeCredential(user.id, newAdminPin.trim(), 'admin_pin');
      } catch (vaultErr) {
        vaultSynced = false;
        console.warn("Failed to sync admin PIN in vault");
      }

      if (vaultSynced) {
        toast({
          title: "تم تحديث رمز PIN",
          description: "تم تغيير PIN لوحة الإدارة ومزامنته في الخزنة المشفرة بنجاح"
        });
      } else {
        toast({
          title: "تم تحديث رمز PIN",
          description: "تم تغيير PIN محلياً بنجاح، ولكن تعذر مزامنة الخزنة المشفرة مؤقتاً"
        });
      }

      setCurrentAdminPin("");
      setNewAdminPin("");
      setConfirmAdminPin("");
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل تحديث PIN لوحة الإدارة",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingAdminPin(false);
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
      if (!user) {
        throw new Error("يجب تسجيل الدخول أولاً");
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      // Sync updated password with server Credential Vault
      let vaultSynced = true;
      try {
        await storeCredential(user.id, newPassword, 'account_password');
      } catch (vaultErr: any) {
        vaultSynced = false;
        console.warn("Failed to sync credential with vault");
      }

      if (vaultSynced) {
        toast({ title: "تم التحديث", description: "تم تغيير كلمة المرور وتحديث بيانات الحساب في الخزنة بنجاح" });
      } else {
        toast({
          title: "تم تغيير كلمة المرور بنجاح",
          description: "تم تغيير كلمة المرور بنجاح، ولكن تعذر مزامنة نسخة الإدارة في الخزنة المشفرة مؤقتاً.",
          variant: "default"
        });
      }

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

  // Metadata for the 5 main sections
  const SECTIONS_CONFIG: Record<MainSectionId, { title: string; desc: string; icon: any; colorClass: string }> = {
    mill_info: {
      title: "معلومات المعصرة",
      desc: "الاسم، الموقع، الهاتف، الشعار وبيانات المعصرة",
      icon: Building2,
      colorClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    operations: {
      title: "التشغيل",
      desc: "إعدادات العصر، أنواع العبوات، وإعدادات التشغيل",
      icon: SlidersHorizontal,
      colorClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    invoices_receipts: {
      title: "الفواتير والإيصالات",
      desc: "إعدادات الفواتير والطباعة والإيصالات وتصنيفات المصاريف",
      icon: Receipt,
      colorClass: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    users_roles: {
      title: "المستخدمون والصلاحيات",
      desc: "إدارة المستخدمين والعمال وحسابات الكاشير والصلاحيات",
      icon: Users,
      colorClass: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    },
    account: {
      title: "الحساب والأمان",
      desc: "بيانات الحساب وإعدادات المستخدم وتغيير كلمة المرور",
      icon: User,
      colorClass: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20",
    },
  };

  // Helper to handle back navigation
  const handleBack = () => {
    if (activeSubSetting) {
      setActiveSubSetting(null);
    } else {
      setActiveSection(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12" dir="rtl">
      
      {/* ─────────────────────────────────────────────────────────────
          TOP HEADER & BREADCRUMBS NAVIGATION
      ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {activeSection ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="gap-2 font-medium hover:bg-primary/10 hover:text-primary transition-all rounded-xl"
              >
                <ArrowRight className="h-4 w-4" />
                <span>
                  {activeSubSetting 
                    ? `العودة إلى ${SECTIONS_CONFIG[activeSection].title}`
                    : "العودة إلى الإعدادات"
                  }
                </span>
              </Button>
              
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                <button 
                  onClick={() => { setActiveSection(null); setActiveSubSetting(null); }}
                  className="hover:text-primary transition-colors cursor-pointer"
                >
                  الإعدادات
                </button>
                <span>/</span>
                <button 
                  onClick={() => setActiveSubSetting(null)}
                  className={cn(
                    "hover:text-primary transition-colors cursor-pointer",
                    !activeSubSetting && "font-bold text-foreground"
                  )}
                >
                  {SECTIONS_CONFIG[activeSection].title}
                </button>
                {activeSubSetting && (
                  <>
                    <span>/</span>
                    <span className="font-bold text-foreground">
                      {activeSubSetting === "pressing_rates" && "إعدادات العصر والأسعار"}
                      {activeSubSetting === "container_types" && "أنواع العبوات والتنكات"}
                      {activeSubSetting === "display_screen" && "شاشة العرض العامة"}
                      {activeSubSetting === "inventory_cash" && "المخزون والسيولة"}
                      {activeSubSetting === "currency" && "العملة المعتمدة"}
                      {activeSubSetting === "expense_categories" && "أنواع المصاريف"}
                      {activeSubSetting === "report_security" && "أمن التقارير"}
                      {activeSubSetting === "receipt_format" && "مواصفات الطباعة"}
                      {activeSubSetting === "cashier_accounts" && "حسابات الكاشير"}
                      {activeSubSetting === "workers_link" && "العمال والرواتب"}
                      {activeSubSetting === "roles_overview" && "نظام الصلاحيات"}
                      {activeSubSetting === "account_profile" && "الملف الشخصي"}
                      {activeSubSetting === "change_password" && "تغيير كلمة المرور"}
                      {activeSubSetting === "admin_pin_setting" && "PIN لوحة الإدارة"}
                    </span>
                  </>
                )}
              </div>
            </div>

            <Badge variant="secondary" className="text-xs px-2.5 py-1 bg-muted/60 font-medium">
              {profile?.mill_name || "Smart Mill"}
            </Badge>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <SettingsIcon className="h-7 w-7 text-primary" />
                الإعدادات
              </h1>
              <p className="text-sm text-muted-foreground">
                إدارة إعدادات المعصرة والنظام والحسابات والتشغيل
              </p>
            </div>
            {activeSeason && (
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 px-3 py-1">
                  الموسم النشط: {activeSeason.name}
                </Badge>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          LEVEL 0: THE SETTINGS HUB (5 MAIN CLICKABLE CARDS)
      ───────────────────────────────────────────────────────────── */}
      {!activeSection && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 pt-2">
          
          {/* Card 1: معلومات المعصرة */}
          <div
            onClick={() => setActiveSection("mill_info")}
            className="group relative flex items-center justify-between p-5 sm:p-6 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-emerald-500/50 hover:shadow-md hover:shadow-emerald-500/5 transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 group-hover:scale-105 transition-transform">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                  معلومات المعصرة
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  الاسم، الموقع، الهاتف، الشعار وبيانات المعصرة المعتمدة
                </p>
              </div>
            </div>
            <div className="ms-3 shrink-0 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all">
              <ChevronLeft className="h-5 w-5" />
            </div>
          </div>

          {/* Card 2: التشغيل */}
          <div
            onClick={() => setActiveSection("operations")}
            className="group relative flex items-center justify-between p-5 sm:p-6 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-amber-500/50 hover:shadow-md hover:shadow-amber-500/5 transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0 group-hover:scale-105 transition-transform">
                <SlidersHorizontal className="h-6 w-6" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                  التشغيل
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  إعدادات العصر، أنواع العبوات، شاشة العرض، والمخزون
                </p>
              </div>
            </div>
            <div className="ms-3 shrink-0 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all">
              <ChevronLeft className="h-5 w-5" />
            </div>
          </div>

          {/* Card 3: الفواتير والإيصالات */}
          <div
            onClick={() => setActiveSection("invoices_receipts")}
            className="group relative flex items-center justify-between p-5 sm:p-6 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-blue-500/50 hover:shadow-md hover:shadow-blue-500/5 transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0 group-hover:scale-105 transition-transform">
                <Receipt className="h-6 w-6" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                  الفواتير والإيصالات
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  إعدادات الفواتير، العملة، تصنيفات المصاريف، وأمن التقارير
                </p>
              </div>
            </div>
            <div className="ms-3 shrink-0 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all">
              <ChevronLeft className="h-5 w-5" />
            </div>
          </div>

          {/* Card 4: المستخدمون والصلاحيات */}
          <div
            onClick={() => setActiveSection("users_roles")}
            className="group relative flex items-center justify-between p-5 sm:p-6 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/5 transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0 group-hover:scale-105 transition-transform">
                <Users className="h-6 w-6" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                  المستخدمون والصلاحيات
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  إدارة حسابات الكاشير، العمال، وصلاحيات النظام
                </p>
              </div>
            </div>
            <div className="ms-3 shrink-0 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all">
              <ChevronLeft className="h-5 w-5" />
            </div>
          </div>

          {/* Card 5: الحساب */}
          <div
            onClick={() => setActiveSection("account")}
            className="group relative flex items-center justify-between p-5 sm:p-6 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-violet-500/50 hover:shadow-md hover:shadow-violet-500/5 transition-all duration-200 cursor-pointer md:col-span-2 lg:col-span-1"
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 shrink-0 group-hover:scale-105 transition-transform">
                <User className="h-6 w-6" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                  الحساب
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  بيانات الحساب وإعدادات المستخدم وتغيير كلمة المرور
                </p>
              </div>
            </div>
            <div className="ms-3 shrink-0 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all">
              <ChevronLeft className="h-5 w-5" />
            </div>
          </div>

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: 🏭 معلومات المعصرة (MILL INFORMATION)
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "mill_info" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl">بيانات وملف المعصرة</CardTitle>
                <CardDescription>الاسم، الموقع، وأرقام التواصل التي تظهر في الفواتير والنظام</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">اسم المعصرة *</Label>
                <Input 
                  value={profileForm.mill_name} 
                  onChange={(e) => setProfileForm(p => ({ ...p, mill_name: e.target.value }))} 
                  placeholder="اسم المعصرة..." 
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">اسم المالك / المدير</Label>
                <Input 
                  value={profileForm.display_name} 
                  onChange={(e) => setProfileForm(p => ({ ...p, display_name: e.target.value }))} 
                  placeholder="اسم المالك..." 
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">الدولة</Label>
                <Select value={profileForm.country} onValueChange={(val) => setProfileForm(p => ({ ...p, country: val }))}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="اختر الدولة" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">موقع / مدينة المعصرة</Label>
                <Input 
                  value={profileForm.mill_location} 
                  onChange={(e) => setProfileForm(p => ({ ...p, mill_location: e.target.value }))} 
                  placeholder="مثال: نابلس - حوارة" 
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">رقم الهاتف الأساسي</Label>
                <Input 
                  type="tel"
                  value={profileForm.phone} 
                  onChange={(e) => setProfileForm(p => ({ ...p, phone: e.target.value }))} 
                  placeholder="05XXXXXXXX" 
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">رقم هاتف إضافي (اختياري)</Label>
                <Input 
                  type="tel"
                  value={profileForm.secondary_phone} 
                  onChange={(e) => setProfileForm(p => ({ ...p, secondary_phone: e.target.value }))} 
                  placeholder="هاتف أرضي أو رقم آخر" 
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-border/50">
              <Button 
                onClick={handleSaveProfile} 
                disabled={savingProfile} 
                className="gap-2 rounded-xl px-6 font-bold"
              >
                <Save className="h-4 w-4" />
                {savingProfile ? "جارٍ الحفظ..." : "حفظ بيانات المعصرة"}
              </Button>
              <p className="text-xs text-muted-foreground hidden sm:block">
                تظهر هذه البيانات مباشرة في ترويسة الفواتير والإيصالات المطبوعة
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: ⚙️ التشغيل (OPERATIONS HUB & SUB-CARDS)
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "operations" && !activeSubSetting && (
        <div className="space-y-4">
          <div className="pb-2">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-amber-500" />
              إعدادات التشغيل
            </h2>
            <p className="text-xs text-muted-foreground">اختر الإعداد المطلوب لتعديله وضبطه</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* SubCard: إعدادات العصر */}
            <div
              onClick={() => setActiveSubSetting("pressing_rates")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-amber-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    إعدادات العصر والأسعار
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    نسبة الرد %، تكلفة الرد نقداً، وأسعار بيع وشراء الزيت
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: أنواع العبوات */}
            <div
              onClick={() => setActiveSubSetting("container_types")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-amber-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    أنواع العبوات والتنكات
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    إدارة وتحديد أنواع العبوات المستخدمة في المعصرة وأسعارها ({containerTypes.length})
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: شاشة العرض */}
            <div
              onClick={() => setActiveSubSetting("display_screen")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-amber-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Tv className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    شاشة العرض العامة (التلفزيون)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    عناصر شاشة الانتظار، الشريط الإخباري وروابط العرض
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: المخزون والسيولة */}
            <div
              onClick={() => setActiveSubSetting("inventory_cash")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-amber-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    المخزون والسيولة
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    تعديل يدوي ومطابقة رصيد الزيت والنقدية في الصندوق
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* OPERATIONS SUB-SETTING 1: إعدادات العصر والأسعار */}
      {activeSection === "operations" && activeSubSetting === "pressing_rates" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-500" />
              إعدادات العصر والأسعار الثابتة
            </CardTitle>
            <CardDescription>الثوابت المستخدمة في حساب الفواتير ونسب الرد والأسعار</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">نسبة الرد (%)</Label>
                <Input 
                  type="number" 
                  value={form.return_percent} 
                  onChange={(e) => setForm((p) => ({ ...p, return_percent: e.target.value }))} 
                  min="0" 
                  step="0.1" 
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">تكلفة الرد نقداً ({selectedCurrency}/كغم)</Label>
                <Input 
                  type="number" 
                  value={form.cash_return_cost} 
                  onChange={(e) => setForm((p) => ({ ...p, cash_return_cost: e.target.value }))} 
                  min="0" 
                  step="0.1" 
                  className="rounded-xl"
                />
              </div>
            </div>
            
            <Separator />
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">سعر بيع الزيت ({selectedCurrency}/كغم)</Label>
                <Input 
                  type="number" 
                  value={form.oil_sell_price} 
                  onChange={(e) => setForm((p) => ({ ...p, oil_sell_price: e.target.value }))} 
                  min="0" 
                  step="0.1" 
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">سعر شراء الزيت ({selectedCurrency}/كغم)</Label>
                <Input 
                  type="number" 
                  value={form.oil_buy_price} 
                  onChange={(e) => setForm((p) => ({ ...p, oil_buy_price: e.target.value }))} 
                  min="0" 
                  step="0.1" 
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-border/50">
              <Button onClick={saveSettings} className="gap-2 rounded-xl px-6 font-bold">
                <Save className="h-4 w-4" />
                حفظ الإعدادات
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* OPERATIONS SUB-SETTING 2: أنواع العبوات والتنكات */}
      {activeSection === "operations" && activeSubSetting === "container_types" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50 flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5 text-amber-500" />
                أنواع العبوات والتنكات
              </CardTitle>
              <CardDescription>الأنواع المتاحة للمزارعين وأسعارها عند إصدار الفواتير</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 rounded-xl font-bold">
                  <Plus className="h-4 w-4" />
                  إضافة نوع
                </Button>
              </DialogTrigger>
              <DialogContent dir="rtl" className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>إضافة نوع تنكة جديد</DialogTitle>
                  <DialogDescription>أدخل اسم العبوة وسعرها بالعملة المعتمدة</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">اسم النوع</Label>
                    <Input 
                      value={newContainerName} 
                      onChange={(e) => setNewContainerName(e.target.value)} 
                      placeholder="مثال: بلاستيك 16 لتر، حديد..." 
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">السعر ({selectedCurrency})</Label>
                    <Input 
                      type="number" 
                      value={newContainerPrice} 
                      onChange={(e) => setNewContainerPrice(e.target.value)} 
                      min="0" 
                      step="0.1" 
                      className="rounded-xl"
                    />
                  </div>
                  <Button 
                    onClick={addContainerType} 
                    disabled={!newContainerName.trim() || !newContainerPrice} 
                    className="w-full rounded-xl font-bold gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة العبوة
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {containerTypes.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {containerTypes.map((ct) => (
                  <div 
                    key={ct.id} 
                    className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:bg-muted/20 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-sm text-foreground">{ct.name}</p>
                      <p className="text-xs text-primary font-semibold mt-0.5">
                        {ct.price} {selectedCurrency}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setContainerDeleteTarget(ct)}
                      className="text-destructive hover:bg-destructive/10 rounded-lg h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed rounded-xl space-y-2">
                <p className="text-sm font-semibold text-foreground">لا توجد أنواع عبوات مضافة حالياً</p>
                <p className="text-xs text-muted-foreground">اضغط على زر "إضافة نوع" لإضافة تنكات حديد أو بلاستيك</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* OPERATIONS SUB-SETTING 3: شاشة العرض العامة (التلفزيون) */}
      {activeSection === "operations" && activeSubSetting === "display_screen" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Tv className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  شاشة صالة الانتظار والتلفزيون
                </CardTitle>
                <CardDescription>التحكم بالعناصر والإعلانات المعروضة على شاشة صالة المزارعين</CardDescription>
              </div>
              {activeSeason && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1.5 rounded-xl text-xs"
                  >
                    <a
                      href={`/display/${activeSeason.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center"
                    >
                      <ExternalLink className="h-3.5 w-3.5 me-1" />
                      معاينة الشاشة
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(displayUrl)}
                    className="gap-1.5 rounded-xl text-xs"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    نسخ الرابط
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-5">
            {/* Dynamic Items Bar */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/50">
              <div>
                <h3 className="font-bold text-sm text-foreground">العناصر والإعلانات ({getDynamicItems(displaySettings).length})</h3>
                <p className="text-xs text-muted-foreground">أضف أي معلومة مع زر إظهار وإخفاء مباشر</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setAddItemDialogOpen(true)}
                  size="sm"
                  className="gap-1.5 rounded-xl text-xs font-bold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  إضافة عنصر
                </Button>
                {getDynamicItems(displaySettings).length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllDynamicItems}
                    className="text-destructive text-xs rounded-xl hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 me-1" />
                    حذف الكل
                  </Button>
                )}
              </div>
            </div>

            {/* Add Dynamic Item Dialog */}
            <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
              <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
                <DialogHeader className="text-right">
                  <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    <Plus className="h-5 w-5 text-primary" />
                    إضافة عنصر لشاشة العرض
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    العنوان والقيمة التي ستظهر للمزارعين على شاشة التلفاز
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">العنوان</Label>
                    <Input
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="مثال: سعر الزيت بيع، رقم التواصل"
                      className="rounded-xl"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">التفاصيل / القيمة</Label>
                    <Input
                      value={newItemDetails}
                      onChange={(e) => setNewItemDetails(e.target.value)}
                      placeholder="مثال: 25 شيكل / كغم"
                      className="rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAddItemDialogOpen(false);
                      setNewItemTitle("");
                      setNewItemDetails("");
                    }}
                    className="rounded-xl"
                  >
                    إلغاء
                  </Button>
                  <Button
                    size="sm"
                    onClick={addDynamicItem}
                    disabled={!newItemTitle.trim() || !newItemDetails.trim()}
                    className="rounded-xl font-bold"
                  >
                    إضافة
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Dynamic Items List */}
            <div className="space-y-2.5">
              {getDynamicItems(displaySettings).map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all",
                    item.visible
                      ? "bg-card border-border shadow-sm"
                      : "bg-muted/20 border-dashed border-border/70 opacity-60"
                  )}
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-foreground">{item.title}</p>
                      <Badge variant={item.visible ? "secondary" : "outline"} className="text-[10px]">
                        {item.visible ? "ظاهر" : "مخفي"}
                      </Badge>
                    </div>
                    <p className="text-xs font-semibold text-primary break-words">{item.details}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`toggle-${item.id}`} className="text-xs cursor-pointer text-muted-foreground">
                        {item.visible ? "إخفاء" : "إظهار"}
                      </Label>
                      <Switch
                        id={`toggle-${item.id}`}
                        checked={item.visible}
                        onCheckedChange={() => toggleItemVisibility(item.id)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDynamicItem(item.id)}
                      className="text-destructive hover:bg-destructive/10 h-8 w-8 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {getDynamicItems(displaySettings).length === 0 && (
                <div className="text-center py-6 border border-dashed rounded-xl">
                  <p className="text-xs text-muted-foreground">لا توجد عناصر مضافة للشاشة حتى الآن</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Ticker Text */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                شريط إخباري متحرك أسفل الشاشة (اختياري)
              </Label>
              <Input
                value={displaySettings.ticker_text || ""}
                onChange={(e) => updateDisplaySetting("ticker_text", e.target.value)}
                placeholder="أهلاً وسهلاً بكم في معصرتنا... نبارك لكم موسم الخير"
                className="rounded-xl text-sm"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-border/50">
              <Button
                onClick={handleSaveDisplaySettings}
                disabled={savingDisplay || !activeSeason}
                className="rounded-xl px-6 font-bold gap-2"
              >
                <Save className="h-4 w-4" />
                {savingDisplay ? "جارٍ الحفظ..." : "حفظ إعدادات الشاشة"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* OPERATIONS SUB-SETTING 4: المخزون والسيولة */}
      {activeSection === "operations" && activeSubSetting === "inventory_cash" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-amber-500" />
              المخزون والسيولة
            </CardTitle>
            <CardDescription>تعديل يدوي ومطابقة رصيد الزيت والنقدية في المعصرة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">إجمالي الزيت (كغم)</Label>
                <Input 
                  type="number" 
                  value={inventoryForm.total_oil} 
                  onChange={(e) => setInventoryForm((p) => ({ ...p, total_oil: e.target.value }))} 
                  min="0" 
                  step="0.1" 
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">إجمالي النقدية ({selectedCurrency})</Label>
                <Input 
                  type="number" 
                  value={inventoryForm.total_cash} 
                  onChange={(e) => setInventoryForm((p) => ({ ...p, total_cash: e.target.value }))} 
                  min="0" 
                  step="0.1" 
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-border/50">
              <Button onClick={saveInventory} className="gap-2 rounded-xl font-bold">
                <Save className="h-4 w-4" />
                تحديث المخزون
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: 🧾 الفواتير والإيصالات (INVOICES & RECEIPTS HUB & SUB-CARDS)
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "invoices_receipts" && !activeSubSetting && (
        <div className="space-y-4">
          <div className="pb-2">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-500" />
              إعدادات الفواتير والإيصالات
            </h2>
            <p className="text-xs text-muted-foreground">تخصيص العملة، تصنيفات المصاريف، وأمن التقارير والطباعة</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* SubCard: العملة */}
            <div
              onClick={() => setActiveSubSetting("currency")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-blue-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    العملة المعتمدة
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    العملة الأساسية المستخدمة في الحسابات والفواتير ({selectedCurrency})
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: أنواع المصاريف */}
            <div
              onClick={() => setActiveSubSetting("expense_categories")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-blue-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    أنواع المصاريف
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    إدارة وتخصيص بنود المصاريف المعتمدة بالمعصرة ({expenseCategories.length})
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: أمن التقارير */}
            <div
              onClick={() => setActiveSubSetting("report_security")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-blue-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    أمن التقارير المالية (PIN)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    تعيين رمز حماية سري مكون من 4 أرقام لصفحة التقارير
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: مواصفات الإيصالات والطباعة */}
            <div
              onClick={() => setActiveSubSetting("receipt_format")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-blue-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    مواصفات الطباعة والإيصالات
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    مقاس الطابعة الحرارية (80mm) وبيانات ترويسة وتذييل الفاتورة
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* INVOICES SUB-SETTING 1: العملة */}
      {activeSection === "invoices_receipts" && activeSubSetting === "currency" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-500" />
              العملة المعتمدة
            </CardTitle>
            <CardDescription>العملة المستخدمة في تسعير الفواتير والمقبوضات والمصاريف</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6 max-w-md">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">اختر العملة</Label>
              <Select 
                value={selectedCurrency} 
                onValueChange={(val) => {
                  setSelectedCurrency(val);
                  setCurrency(val);
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="اختر العملة" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {currencies.map((c) => (
                    <SelectItem key={c.symbol} value={c.symbol}>
                      {c.name} ({c.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-2">
              <Button onClick={saveSettings} className="rounded-xl font-bold gap-2">
                <Save className="h-4 w-4" />
                تأكيد وحفظ العملة
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* INVOICES SUB-SETTING 2: أنواع المصاريف */}
      {activeSection === "invoices_receipts" && activeSubSetting === "expense_categories" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50 flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Coins className="h-5 w-5 text-blue-500" />
                أنواع المصاريف
              </CardTitle>
              <CardDescription>أضف أو عدل تصنيفات المصاريف التي تسجل في المعصرة</CardDescription>
            </div>
            <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 rounded-xl font-bold">
                  <Plus className="h-4 w-4" />
                  إضافة نوع
                </Button>
              </DialogTrigger>
              <DialogContent dir="rtl" className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>إضافة نوع مصروف جديد</DialogTitle>
                  <DialogDescription>أدخل اسم التصنيف الجديد للمصاريف اليومية</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">اسم المصروف</Label>
                    <Input 
                      value={newExpenseCategoryName} 
                      onChange={(e) => setNewExpenseCategoryName(e.target.value)} 
                      placeholder="مثال: فطور عمال، صيانة، كهرباء، وقود..." 
                      className="rounded-xl"
                    />
                  </div>
                  <Button 
                    onClick={addExpenseCategory} 
                    disabled={!newExpenseCategoryName.trim()} 
                    className="w-full rounded-xl font-bold gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة النوع
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {expenseCategories.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {expenseCategories.map((ec) => (
                  <div 
                    key={ec.id} 
                    className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:bg-muted/20 transition-colors"
                  >
                    <span className="font-bold text-sm text-foreground">{ec.name}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setExpenseDeleteTarget(ec)}
                      className="text-destructive hover:bg-destructive/10 rounded-lg h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed rounded-xl space-y-2">
                <p className="text-sm font-semibold text-foreground">لا توجد أنواع مصاريف مضافة حالياً</p>
                <p className="text-xs text-muted-foreground">اضغط على زر "إضافة نوع" لإضافة بنود المصاريف</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* INVOICES SUB-SETTING 3: مواصفات الطباعة */}
      {activeSection === "invoices_receipts" && activeSubSetting === "receipt_format" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Printer className="h-5 w-5 text-blue-500" />
              مواصفات الطباعة والإيصالات
            </CardTitle>
            <CardDescription>معلومات وإعدادات مخرجات الطباعة في شاشة الفواتير</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">مقاس ورق الفاتورة</p>
                <p className="text-sm font-bold text-foreground">80mm حراري (Thermal 80mm POS)</p>
                <p className="text-xs text-muted-foreground">متوافق مع جميع طابعات الكاشير الحرارية القياسية عبر المتصفح</p>
              </div>
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">الترويسة المعتمدة</p>
                <p className="text-sm font-bold text-foreground">{profileForm.mill_name || "اسم المعصرة"}</p>
                <p className="text-xs text-muted-foreground">{profileForm.phone ? `هاتف: ${profileForm.phone}` : "الهاتف غير محدد"}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-foreground">طباعة إيصالات تلقائية سريعة</p>
                <p className="text-muted-foreground">
                  عند إصدار فاتورة في شاشة الفواتير والضغط على "تأكيد وطباعة الإيصال (80mm)" يتم إرسال أمر الطباعة المنسقة مباشرة مع بيانات الموسم والزبون والدفع.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: 👥 المستخدمون والصلاحيات (USERS & ROLES HUB & SUB-CARDS)
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "users_roles" && !activeSubSetting && (
        <div className="space-y-4">
          <div className="pb-2">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500" />
              المستخدمون والصلاحيات
            </h2>
            <p className="text-xs text-muted-foreground">إدارة وتفقد حسابات الكاشير وعمال المعصرة والصلاحيات</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* SubCard: حسابات الكاشير */}
            <div
              onClick={() => setActiveSubSetting("cashier_accounts")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-indigo-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    حسابات موظفي الكاشير
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    استعراض حسابات موظفي الكاشير التابعة للمعصرة ({employees.length})
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: عمال المعصرة */}
            <div
              onClick={() => setActiveSubSetting("workers_link")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-indigo-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <HardHat className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    عمال المعصرة والأجور
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    إدارة عمال المعصرة، المستحقات، والدفعات المالية المباشرة
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: نظام الصلاحيات */}
            <div
              onClick={() => setActiveSubSetting("roles_overview")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-indigo-500/50 hover:shadow-sm transition-all cursor-pointer md:col-span-2"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    نظام الصلاحيات والأدوار
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    دورك الحالي في النظام ومستويات الوصول الممنوحة
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* USERS SUB-SETTING 1: حسابات موظفي الكاشير */}
      {activeSection === "users_roles" && activeSubSetting === "cashier_accounts" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-indigo-500" />
              حسابات موظفي الكاشير (Cashier Sub-Accounts)
            </CardTitle>
            <CardDescription>
              إنشاء وإدارة حسابات الكاشير يتم من خلال مسؤول النظام (Admin) لضمان أمان وتفرد الحسابات
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-3">
              {employees.map((emp: any) => (
                <div key={emp.id} className="flex items-center justify-between p-3.5 border border-border/70 rounded-xl bg-card hover:bg-muted/20 transition-colors">
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm text-foreground">{emp.display_name || "موظف كاشير"}</p>
                    <p className="text-xs text-primary font-mono font-medium">
                      {emp.phone || emp.display_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 font-medium">
                      طابور + فواتير فقط
                    </Badge>
                  </div>
                </div>
              ))}
              {employees.length === 0 && (
                <div className="text-center py-8 border border-dashed rounded-xl space-y-2">
                  <p className="text-sm font-semibold text-foreground">لا توجد حسابات كاشير نشطة حتى الآن</p>
                  <p className="text-xs text-muted-foreground">
                    تواصل مع مسؤول النظام لإنشاء وتفعيل حسابات الكاشير الخاصة بمعصرتك.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* USERS SUB-SETTING 2: عمال المعصرة */}
      {activeSection === "users_roles" && activeSubSetting === "workers_link" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <HardHat className="h-5 w-5 text-indigo-500" />
              عمال المعصرة وسجلات الأجور
            </CardTitle>
            <CardDescription>إدارة عمال المعصرة وتفاصيل ساعات العمل والمستحقات المالية</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="p-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-3">
              <h4 className="font-bold text-sm text-foreground">قسم مخصص لإدارة العمال</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                يحتوي النظام على صفحة متكاملة لإضافة عمال المعصرة، تعيين الأجور بالساعة أو باليوم، تسجيل الدفعات النقدية، ومتابعة الأرصدة المتبقية لكل عامل.
              </p>
              <Button asChild className="rounded-xl font-bold gap-2">
                <Link to="/workers">
                  <HardHat className="h-4 w-4" />
                  الانتقال إلى صفحة العمال والأجور
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* USERS SUB-SETTING 3: نظام الصلاحيات */}
      {activeSection === "users_roles" && activeSubSetting === "roles_overview" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-500" />
              نظام الصلاحيات والأدوار
            </CardTitle>
            <CardDescription>معلومات الدور الممنوح وصلاحيات الوصول للنظام</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <p className="text-xs font-bold text-muted-foreground">نوع الحساب / الدور</p>
                <p className="text-sm font-bold text-foreground">
                  {userRole === "platform_admin" && "مسؤول النظام العام (Platform Admin)"}
                  {userRole === "mill_owner" && "مالك المعصرة (Mill Owner)"}
                  {userRole === "mill_employee" && "موظف كاشير (Cashier Employee)"}
                  {!userRole && "مستخدم النظام"}
                </p>
              </div>
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <p className="text-xs font-bold text-muted-foreground">نطاق الوصول</p>
                <p className="text-sm font-bold text-foreground">
                  {userRole === "mill_owner" ? "إدارة كاملة للمعصرة ومواسمها" : "الصلاحيات المحددة للدور"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5: 👤 الحساب والأمان (ACCOUNT & SECURITY HUB & SUB-CARDS)
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "account" && !activeSubSetting && (
        <div className="space-y-4">
          <div className="pb-2">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <User className="h-5 w-5 text-violet-500" />
              إعدادات الحساب والأمان
            </h2>
            <p className="text-xs text-muted-foreground">بيانات الحساب الشخصي وتغيير كلمة المرور</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* SubCard: الملف الشخصي */}
            <div
              onClick={() => setActiveSubSetting("account_profile")}
              className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-violet-500/50 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    الملف الشخصي للحساب
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    البريد الإلكتروني، الاسم الظاهر، والمعصرة المرتبطة
                  </p>
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
            </div>

            {/* SubCard: تغيير كلمة المرور */}
            {userRole === 'mill_owner' && (
              <div
                onClick={() => setActiveSubSetting("change_password")}
                className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-violet-500/50 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                      الأمان وتغيير كلمة المرور
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      تحديث كلمة المرور لحساب صاحب المعصرة
                    </p>
                  </div>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
              </div>
            )}

            {/* SubCard: PIN لوحة الإدارة */}
            {userRole === 'mill_owner' && (
              <div
                onClick={() => setActiveSubSetting("admin_pin_setting")}
                className="group flex items-center justify-between p-5 rounded-2xl border border-border/70 bg-card hover:bg-card/90 hover:border-amber-500/50 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                      PIN لوحة الإدارة (Admin PIN)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      تعيين أو تغيير الرمز الإداري السري المستخدم لفتح لوحة الإدارة
                    </p>
                  </div>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all shrink-0" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ACCOUNT SUB-SETTING 1: الملف الشخصي */}
      {activeSection === "account" && activeSubSetting === "account_profile" && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-violet-500" />
              بيانات الحساب الحالي
            </CardTitle>
            <CardDescription>معلومات تسجيل الدخول والحساب الموثق</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6 max-w-lg">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">البريد الإلكتروني المسجل</Label>
              <Input 
                value={user?.email || ""} 
                disabled 
                className="bg-muted/30 font-mono text-sm rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">الاسم الظاهر</Label>
              <Input 
                value={profile?.display_name || ""} 
                disabled 
                className="bg-muted/30 text-sm rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">المعصرة التابع لها</Label>
              <Input 
                value={profile?.mill_name || ""} 
                disabled 
                className="bg-muted/30 text-sm rounded-xl"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ACCOUNT SUB-SETTING 2: تغيير كلمة المرور */}
      {activeSection === "account" && activeSubSetting === "change_password" && userRole === 'mill_owner' && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-500" />
              تغيير كلمة المرور
            </CardTitle>
            <CardDescription>تحديث كلمة المرور الخاصة بحساب صاحب المعصرة بأمان</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6 max-w-md">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">كلمة المرور الجديدة</Label>
              <Input 
                type="password" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                placeholder="6 أحرف على الأقل..."
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">تأكيد كلمة المرور</Label>
              <Input 
                type="password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                placeholder="أعد إدخال كلمة المرور..."
                className="rounded-xl"
              />
            </div>
            <div className="pt-2">
              <Button 
                onClick={updatePassword} 
                disabled={isUpdatingPassword || !newPassword}
                className="rounded-xl font-bold gap-2"
              >
                <Key className="h-4 w-4" />
                {isUpdatingPassword ? "جارٍ التحديث..." : "تحديث كلمة المرور"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ACCOUNT SUB-SETTING 3: PIN لوحة الإدارة */}
      {activeSection === "account" && activeSubSetting === "admin_pin_setting" && userRole === 'mill_owner' && (
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              PIN لوحة الإدارة (Admin PIN)
            </CardTitle>
            <CardDescription>
              رمز الحماية السري المستخدم لفتح شاشات لوحة الإدارة والتحكم (4 إلى 8 أرقام).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6 max-w-md">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">رمز PIN الحالي</Label>
              <Input 
                type="password" 
                maxLength={8}
                value={currentAdminPin} 
                onChange={(e) => setCurrentAdminPin(e.target.value.replace(/\D/g, ""))} 
                placeholder="أدخل الرمز الحالي (الافتراضي: 123456)..."
                className="rounded-xl font-mono tracking-widest text-center"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">رمز PIN الجديد</Label>
              <Input 
                type="password" 
                maxLength={8}
                value={newAdminPin} 
                onChange={(e) => setNewAdminPin(e.target.value.replace(/\D/g, ""))} 
                placeholder="4 إلى 8 أرقام..."
                className="rounded-xl font-mono tracking-widest text-center"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">تأكيد رمز PIN الجديد</Label>
              <Input 
                type="password" 
                maxLength={8}
                value={confirmAdminPin} 
                onChange={(e) => setConfirmAdminPin(e.target.value.replace(/\D/g, ""))} 
                placeholder="أعد إدخال الرمز الجديد..."
                className="rounded-xl font-mono tracking-widest text-center"
              />
            </div>
            <div className="pt-2">
              <Button 
                onClick={updateAdminPin} 
                disabled={isUpdatingAdminPin || !newAdminPin}
                className="rounded-xl font-bold gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Save className="h-4 w-4" />
                {isUpdatingAdminPin ? "جارٍ الحفظ والمزامنة..." : "حفظ رمز PIN الجديد"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          GLOBAL CONFIRMATION ALERT DIALOGS
      ───────────────────────────────────────────────────────────── */}
      <AlertDialog open={!!containerDeleteTarget} onOpenChange={(o) => !o && setContainerDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف نوع العبوة</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد بالتأكيد حذف نوع <strong>{containerDeleteTarget?.name}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteContainerType} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              حذف النوع
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!expenseDeleteTarget} onOpenChange={(o) => !o && setExpenseDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف نوع المصروف</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد بالتأكيد حذف نوع المصروف <strong>{expenseDeleteTarget?.name}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteExpenseCategory} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              حذف النوع
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}