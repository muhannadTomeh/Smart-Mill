import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
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
  Info, ArrowRight, Calendar, ShieldCheck, ShieldAlert,
  Save, Plus, Banknote, Building2, MapPin, Phone, User,
  UserCheck, Lock, Users, CheckCircle2,
  RotateCcw, Copy, Eye, EyeOff, Edit, Trash2, Key, RefreshCw, UserX
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { normalizeUsernameToEmail, getDisplayUsername } from "@/lib/authUtils";
import { getArabicErrorMessage } from "@/lib/errorMessages";
import {
  getCashReturnPricingLabel,
  normalizeCashReturnPricingMode,
} from "@/lib/cashReturnPricing";
import {
  revealCredential,
  updateUserAccount,
  deleteUserAccount,
  createEmployeeAccount,
  toggleUserAccountActive
} from "@/lib/credentialVault";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ClickableDateInput } from "@/components/history/ClickableDateInput";
import { Checkbox } from "@/components/ui/checkbox";

type SubscriptionType = "monthly" | "seasonal";
type AdminCharge = Tables<"mill_admin_charges"> & {
  mill_name?: string | null;
  paid_amount: number;
  remaining_amount: number;
  effective_status: "outstanding" | "partially_paid" | "paid" | "cancelled";
};

export default function MillDetails() {
  const { id: millId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [millData, setMillData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [notes, setNotes] = useState("");
  const [subscriptionType, setSubscriptionType] = useState<SubscriptionType>("monthly");
  const [subscriptionFee, setSubscriptionFee] = useState<string>("0");
  const [isEditingSubscriptionPlan, setIsEditingSubscriptionPlan] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [adminCharges, setAdminCharges] = useState<AdminCharge[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
  const paymentIdempotencyKeyRef = useRef(crypto.randomUUID());
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
  const [newCharge, setNewCharge] = useState({ title: "", amount: "", dueDate: "", notes: "", notify: true });
  const chargeIdempotencyKeyRef = useRef(crypto.randomUUID());
  const [paymentCharge, setPaymentCharge] = useState<AdminCharge | null>(null);
  const [chargePayment, setChargePayment] = useState({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
  const chargePaymentIdempotencyKeyRef = useRef(crypto.randomUUID());

  // Employee accounts state
  const [employees, setEmployees] = useState<any[]>([]);

  // Mill Code management
  const [millCode, setMillCode] = useState("");
  const [savingMillCode, setSavingMillCode] = useState(false);

  // New Employee Modal
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: "", username: "", password: "" });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [creatingEmployee, setCreatingEmployee] = useState(false);

  // Cashier Passwords Visibility & Edit / Delete State
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<string, string>>({});
  const [decryptingLoading, setDecryptingLoading] = useState<Record<string, boolean>>({});
  const passwordHideTimersRef = useRef<Record<string, any>>({});
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", username: "", password: "" });
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTargetEmployee, setDeleteTargetEmployee] = useState<any>(null);
  const [deletingEmployee, setDeletingEmployee] = useState(false);

  const [currentMillRecord, setCurrentMillRecord] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Safe Date formatters to prevent RangeError: Invalid time value on any engine
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

  const fetchData = async () => {
    if (!millId) return;
    setLoading(true);
    setFetchError(null);
    try {
      // 1. Fetch mill by canonical mills.id — no fallback to owner_user_id
      const { data: millObj, error: millErr } = await supabase
        .from("mills")
        .select("*")
        .eq("id", millId)
        .maybeSingle();

      if (millErr) {
        console.warn("Could not query mills table:", millErr);
      }

      setCurrentMillRecord(millObj);

      // Log administrative access in background (fire-and-forget)
      try {
        supabase.rpc('log_admin_access', {
          target_user_id: millId,
          admin_action: 'viewed_mill_details'
        });
      } catch { }

      // 2. Fetch owner profile for display only (not used as tenant filter)
      let profile: any = null;
      if (millObj?.owner_user_id) {
        try {
          const { data: pData } = await supabase
            .from("profiles")
            .select("*")
            .eq("user_id", millObj.owner_user_id)
            .maybeSingle();
          if (pData) profile = pData;
        } catch (pErr) {
          console.warn("Could not fetch owner profile:", pErr);
        }
      }

      // 3. Fetch all tenant-owned records using mill_id (canonical)
      const canonicalMillId = millObj?.id || millId;
      const [
        seasonsRes,
        paymentsRes,
        chargesRes,
      ] = await Promise.all([
        supabase.from("seasons").select("*").eq("mill_id", canonicalMillId).order("created_at", { ascending: false }).limit(5),
        supabase.from("subscription_payments").select("*").eq("mill_id", canonicalMillId).order("payment_date", { ascending: false }),
        supabase.from("mill_admin_charge_balances").select("*").eq("mill_id", canonicalMillId).order("created_at", { ascending: false }),
      ]);

      const seasons = seasonsRes.data || [];
      const paymentsData = paymentsRes.data || [];

      // Canonical Mill Memberships employee query
      let combinedEmployees: any[] = [];
      const targetMillId = millObj?.id || millId;
      if (targetMillId) {
        try {
          const { data: mems, error: memsErr } = await supabase
            .from("mill_memberships")
            .select("id, user_id, role, username, display_username, is_active, created_at")
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

            combinedEmployees = mems.map((m: any) => {
              const p = profMap.get(m.user_id);
              return {
                id: m.id,
                user_id: m.user_id,
                display_name: p?.display_name || m.display_username || m.username,
                phone: p?.phone || m.username || m.display_username,
                username: m.display_username || m.username || p?.phone,
                is_active: m.is_active !== false,
                created_at: m.created_at,
              };
            });
          }
        } catch (e) {
          console.warn("Could not query mill_memberships:", e);
        }
      }

      // Find active or open season
      const currentSeason = seasons.find((s: any) => s.status === 'active' || s.status === 'open') || seasons[0] || null;

      // Safe Profile guarantees strings for all required fields
      const safeProfile = {
        mill_name: profile?.mill_name || millObj?.name || "معصرة غير مسماة",
        display_name: profile?.display_name || millObj?.name || "صاحب المعصرة",
        country: profile?.country || millObj?.country || "فلسطين",
        mill_location: profile?.mill_location || millObj?.location || "غير محدد",
        subscription_status: millObj?.subscription_status || profile?.subscription_status || "active",
        subscription_notes: millObj?.subscription_notes || profile?.subscription_notes || "",
        subscription_type: (millObj?.subscription_type === "seasonal" ? "seasonal" : "monthly") as SubscriptionType,
        subscription_fee: millObj?.subscription_fee ?? millObj?.monthly_fee ?? profile?.monthly_fee ?? 0,
        mill_code: millObj?.mill_code || profile?.mill_code || "",
        phone: profile?.phone || millObj?.phone || "---",
        secondary_phone: profile?.secondary_phone || millObj?.secondary_phone || null,
      };

      setMillData({
        profile: safeProfile,
        currentSeason
      });
      setEmployees(combinedEmployees);
      setPayments(paymentsData || []);
      setAdminCharges((chargesRes.data || []) as AdminCharge[]);

      setNotes(safeProfile.subscription_notes);
      setSubscriptionType(safeProfile.subscription_type);
      setSubscriptionFee(String(safeProfile.subscription_fee || "0"));
      setIsEditingSubscriptionPlan(false);
      setMillCode(safeProfile.mill_code);
    } catch (error: any) {
      console.error("Error fetching mill details:", error);
      setFetchError(getArabicErrorMessage(error, "حدث خطأ غير متوقع أثناء جلب بيانات المعصرة."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [millId]);

  const updateSubscription = async (status: 'active' | 'suspended' | 'pending') => {
    if (!currentMillRecord?.id) return;
    setUpdating(true);
    try {
      const isActive = (status === 'active');

      // 1. Update mills table (canonical record)
      const { error: millErr } = await supabase
        .from("mills")
        .update({ subscription_status: status })
        .eq("id", currentMillRecord.id);

      if (millErr) throw millErr;

      // 2. Synchronize owner profile and mill memberships
      if (currentMillRecord.owner_user_id) {
        await Promise.allSettled([
          supabase
            .from("profiles")
            .update({
              subscription_status: status,
              is_active: isActive,
              updated_at: new Date().toISOString()
            })
            .eq("user_id", currentMillRecord.owner_user_id),
          supabase
            .from("mill_memberships")
            .update({ is_active: isActive })
            .eq("mill_id", currentMillRecord.id)
        ]);
      }

      try {
        await supabase.rpc('log_admin_access', {
          target_user_id: currentMillRecord.owner_user_id || currentMillRecord.id,
          admin_action: `updated_subscription_status_to_${status}`
        });
      } catch { }

      // 3. Immediately update local state so UI buttons and badge reflect change instantly
      setCurrentMillRecord((prev: any) => ({
        ...prev,
        subscription_status: status
      }));

      setMillData((prev: any) => ({
        ...prev,
        profile: {
          ...prev?.profile,
          subscription_status: status,
          is_active: isActive
        }
      }));

      toast({
        title: "تم التحديث بنجاح",
        description: `تم تغيير حالة الاشتراك إلى ${status === 'active' ? 'نشط' : 'غير نشط (موقف)'}`,
      });
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        variant: "destructive",
        title: "خطأ",
        description: getArabicErrorMessage(error, "فشل تحديث حالة الاشتراك."),
      });
    } finally {
      setUpdating(false);
    }
  };

  const saveNotes = async () => {
    if (!currentMillRecord?.id) return;
    setUpdating(true);
    try {
      const { error } = await (supabase
        .from("mills") as any)
        .update({ subscription_notes: notes })
        .eq("id", currentMillRecord.id);

      if (error) throw error;

      await supabase.rpc('log_admin_access', {
        target_user_id: currentMillRecord.id,
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

  const saveSubscriptionPlan = async () => {
    if (!currentMillRecord?.id) return;
    const feeNum = Number(subscriptionFee);
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      toast({
        variant: "destructive",
        title: "قيمة غير صحيحة",
        description: "أدخل قيمة اشتراك صحيحة تساوي صفرًا أو أكثر.",
      });
      return;
    }

    setUpdating(true);
    try {
      const { data, error } = await supabase.rpc("update_mill_subscription_plan_command", {
        p_mill_id: currentMillRecord.id,
        p_subscription_type: subscriptionType,
        p_subscription_fee: feeNum,
      });

      if (error) throw error;

      const savedPlan = data as {
        subscription_type?: SubscriptionType;
        subscription_fee?: number | string;
      } | null;
      const savedType: SubscriptionType = savedPlan?.subscription_type === "seasonal" ? "seasonal" : "monthly";
      const savedFee = Number(savedPlan?.subscription_fee ?? feeNum);

      if (!Number.isFinite(savedFee)) {
        throw new Error("INVALID_SUBSCRIPTION_FEE");
      }

      void supabase.rpc('log_admin_access', {
        target_user_id: currentMillRecord.id,
        admin_action: `updated_subscription_plan_${savedType}`
      });

      setCurrentMillRecord((prev: any) => ({
        ...prev,
        subscription_type: savedType,
        subscription_fee: savedFee,
        monthly_fee: savedType === "monthly" ? savedFee : 0,
      }));
      setMillData((prev: any) => ({
        ...prev,
        profile: {
          ...prev?.profile,
          subscription_type: savedType,
          subscription_fee: savedFee,
        },
      }));
      setSubscriptionType(savedType);
      setSubscriptionFee(String(savedFee));
      setIsEditingSubscriptionPlan(false);

      toast({
        title: "تم حفظ خطة الاشتراك",
        description: `الاشتراك ${savedType === "monthly" ? "الشهري" : "الموسمي"} بقيمة ${savedFee.toLocaleString("ar-u-nu-latn")} ₪ أصبح محفوظًا الآن.`,
      });
    } catch (error: unknown) {
      console.error("Error saving subscription plan:", error);
      toast({
        variant: "destructive",
        title: "خطأ",
        description: getArabicErrorMessage(error, "فشل حفظ نوع الاشتراك وقيمته."),
      });
    } finally {
      setUpdating(false);
    }
  };

  const beginSubscriptionPlanEdit = () => {
    const savedType: SubscriptionType = currentMillRecord?.subscription_type === "seasonal" ? "seasonal" : "monthly";
    const savedFee = Number(currentMillRecord?.subscription_fee ?? currentMillRecord?.monthly_fee ?? 0);
    setSubscriptionType(savedType);
    setSubscriptionFee(String(Number.isFinite(savedFee) ? savedFee : 0));
    setIsEditingSubscriptionPlan(true);
  };

  const cancelSubscriptionPlanEdit = () => {
    const savedType: SubscriptionType = currentMillRecord?.subscription_type === "seasonal" ? "seasonal" : "monthly";
    const savedFee = Number(currentMillRecord?.subscription_fee ?? currentMillRecord?.monthly_fee ?? 0);
    setSubscriptionType(savedType);
    setSubscriptionFee(String(Number.isFinite(savedFee) ? savedFee : 0));
    setIsEditingSubscriptionPlan(false);
  };

  const handleAddPayment = async () => {
    if (!currentMillRecord?.id) return;
    const amount = Number(newPayment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "مبلغ غير صحيح",
        description: "أدخل مبلغ دفعة أكبر من صفر.",
      });
      return;
    }
    if (!newPayment.date) {
      toast({
        variant: "destructive",
        title: "تاريخ الدفع مطلوب",
        description: "اختر تاريخ الدفعة قبل الحفظ.",
      });
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase.rpc("record_subscription_payment_command", {
        p_mill_id: currentMillRecord.id,
        p_amount: amount,
        p_payment_date: newPayment.date,
        p_notes: newPayment.notes,
        p_idempotency_key: paymentIdempotencyKeyRef.current,
      });

      if (error) throw error;

      void supabase.rpc('log_admin_access', {
        target_user_id: currentMillRecord.id,
        admin_action: `added_subscription_payment_${newPayment.amount}`
      });

      toast({
        title: "تم التسجيل",
        description: "تم تسجيل الدفعة بنجاح",
      });

      setIsPaymentModalOpen(false);
      setNewPayment({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
      paymentIdempotencyKeyRef.current = crypto.randomUUID();

      const { data: paymentsData } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("mill_id", currentMillRecord.id)
        .order("payment_date", { ascending: false });

      setPayments(paymentsData || []);
    } catch (error: unknown) {
      console.error("Error adding payment:", error);
      toast({
        variant: "destructive",
        title: "خطأ",
        description: getArabicErrorMessage(error, "فشل تسجيل الدفعة."),
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleAddAdminCharge = async () => {
    if (!currentMillRecord?.id) return;
    const amount = Number(newCharge.amount);
    if (!newCharge.title.trim()) {
      toast({ variant: "destructive", title: "عنوان الدين مطلوب", description: "اكتب وصفًا واضحًا للدين أو الرسم الإضافي." });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "مبلغ غير صحيح", description: "أدخل مبلغًا أكبر من صفر." });
      return;
    }

    setUpdating(true);
    try {
      const { data, error } = await supabase.rpc("create_mill_admin_charge_command", {
        p_mill_id: currentMillRecord.id,
        p_title: newCharge.title.trim(),
        p_amount: amount,
        p_due_date: newCharge.dueDate || null,
        p_notes: newCharge.notes.trim() || null,
        p_notify: newCharge.notify,
        p_idempotency_key: chargeIdempotencyKeyRef.current,
      });
      if (error) throw error;

      const result = data as { notified_count?: number } | null;
      toast({
        title: "تمت إضافة الدين",
        description: newCharge.notify
          ? `تم حفظ الدين وإرسال إشعار إلى ${Number(result?.notified_count || 0).toLocaleString("ar-u-nu-latn")} حساب مالك.`
          : "تم حفظ الدين دون إرسال إشعار.",
      });

      setIsChargeModalOpen(false);
      setNewCharge({ title: "", amount: "", dueDate: "", notes: "", notify: true });
      chargeIdempotencyKeyRef.current = crypto.randomUUID();

      const { data: charges } = await supabase
        .from("mill_admin_charge_balances")
        .select("*")
        .eq("mill_id", currentMillRecord.id)
        .order("created_at", { ascending: false });
      setAdminCharges((charges || []) as AdminCharge[]);
    } catch (error: unknown) {
      console.error("Error adding mill admin charge:", error);
      toast({
        variant: "destructive",
        title: "تعذر إضافة الدين",
        description: getArabicErrorMessage(error, "تعذر حفظ الدين الإضافي. حاول مرة أخرى."),
      });
    } finally {
      setUpdating(false);
    }
  };

  const updateAdminChargeStatus = async (chargeId: string) => {
    setUpdating(true);
    try {
      const { error } = await supabase.rpc("update_mill_admin_charge_status_command", {
        p_charge_id: chargeId,
        p_status: "cancelled",
      });
      if (error) throw error;

      setAdminCharges((current) => current.map((charge) => charge.id === chargeId
        ? { ...charge, status: "cancelled", effective_status: "cancelled", settled_at: new Date().toISOString() }
        : charge));
      toast({
        title: "تم إلغاء الدين",
        description: "تم إغلاق الدين كملغى دون حذفه من السجل.",
      });
    } catch (error: unknown) {
      console.error("Error updating mill admin charge:", error);
      toast({
        variant: "destructive",
        title: "تعذر تحديث الدين",
        description: getArabicErrorMessage(error, "تعذر تحديث حالة الدين. حاول مرة أخرى."),
      });
    } finally {
      setUpdating(false);
    }
  };

  const openAdminChargePayment = (charge: AdminCharge) => {
    chargePaymentIdempotencyKeyRef.current = crypto.randomUUID();
    setChargePayment({
      amount: String(Number(charge.remaining_amount || 0)),
      date: new Date().toISOString().split('T')[0],
      notes: "",
    });
    setPaymentCharge(charge);
  };

  const handleAdminChargePayment = async () => {
    if (!paymentCharge) return;
    const amount = Number(chargePayment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(paymentCharge.remaining_amount || 0)) {
      toast({ variant: "destructive", title: "مبلغ غير صحيح", description: "أدخل مبلغًا أكبر من صفر ولا يتجاوز الرصيد المتبقي." });
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase.rpc("record_mill_admin_charge_payment_command", {
        p_charge_id: paymentCharge.id,
        p_amount: amount,
        p_payment_date: chargePayment.date,
        p_notes: chargePayment.notes.trim() || null,
        p_idempotency_key: chargePaymentIdempotencyKeyRef.current,
      });
      if (error) throw error;

      const { data: charges, error: refreshError } = await supabase
        .from("mill_admin_charge_balances")
        .select("*")
        .eq("mill_id", currentMillRecord.id)
        .order("created_at", { ascending: false });
      if (refreshError) throw refreshError;

      setAdminCharges((charges || []) as AdminCharge[]);
      setPaymentCharge(null);
      setChargePayment({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
      chargePaymentIdempotencyKeyRef.current = crypto.randomUUID();
      toast({ title: "تم تسجيل الدفعة", description: "أضيفت الدفعة إلى صندوق إدارة المنصة وحُدّث الرصيد المتبقي." });
    } catch (error: unknown) {
      console.error("Error recording admin charge payment:", error);
      toast({ variant: "destructive", title: "تعذر تسجيل الدفعة", description: getArabicErrorMessage(error, "تعذر تسجيل دفعة الدين.") });
    } finally {
      setUpdating(false);
    }
  };

  // Save Mill Code
  const saveMillCode = async () => {
    if (!currentMillRecord?.id) return;
    const code = millCode.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!code) {
      toast({ title: "خطأ", description: "رمز المعصرة يجب أن يحتوي على أحرف أو أرقام إنجليزية فقط", variant: "destructive" });
      return;
    }
    setSavingMillCode(true);
    try {
      const { error } = await supabase
        .from("mills")
        .update({ mill_code: code })
        .eq("id", currentMillRecord.id);

      if (error) throw error;
      setMillCode(code);
      toast({ title: "تم حفظ رمز المعصرة", description: `رمز المعصرة الآن: ${code}` });
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: getArabicErrorMessage(err, "فشل حفظ الرمز."),
        variant: "destructive"
      });
    } finally {
      setSavingMillCode(false);
    }
  };

  // Toggle Password Visibility in Table (On-Demand Decryption from Credential Vault, 15s auto-hide)
  const togglePasswordVisibility = async (emp: any) => {
    const key = emp.user_id || emp.id;
    if (visiblePasswords[key]) {
      if (passwordHideTimersRef.current[key]) {
        clearTimeout(passwordHideTimersRef.current[key]);
      }
      setVisiblePasswords((p) => ({ ...p, [key]: false }));
      return;
    }

    setDecryptingLoading((p) => ({ ...p, [key]: true }));
    try {
      const plain = await revealCredential(emp.user_id || emp.id, 'account_password');
      if (plain) {
        setDecryptedPasswords((p) => ({ ...p, [key]: plain }));
        setVisiblePasswords((p) => ({ ...p, [key]: true }));

        // Auto-hide after 15 seconds
        if (passwordHideTimersRef.current[key]) {
          clearTimeout(passwordHideTimersRef.current[key]);
        }
        passwordHideTimersRef.current[key] = setTimeout(() => {
          setVisiblePasswords((p) => ({ ...p, [key]: false }));
        }, 15000);
      } else {
        toast({
          title: "تنبيه",
          description: "لا توجد كلمة مرور مسجلة في الخزينة لهذا الحساب. يمكنك تعيينها من زر التعديل.",
        });
      }
    } catch (err: any) {
      toast({
        title: "خطأ في جلب كلمة المرور",
        description: getArabicErrorMessage(err, "تعذر فك تشفير كلمة المرور."),
        variant: "destructive"
      });
    } finally {
      setDecryptingLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleCopyPassword = async (emp: any) => {
    const key = emp.user_id || emp.id;
    let pass = decryptedPasswords[key];
    if (!pass) {
      try {
        pass = (await revealCredential(emp.user_id || emp.id)) || "";
        if (pass) {
          setDecryptedPasswords((p) => ({ ...p, [key]: pass }));
        }
      } catch { }
    }
    if (pass) {
      navigator.clipboard.writeText(pass);
      toast({ title: "تم النسخ", description: "تم نسخ كلمة المرور إلى الحافظة" });
    } else {
      toast({ title: "تنبيه", description: "يرجى إظهار كلمة المرور أو تعيينها أولاً", variant: "destructive" });
    }
  };

  // Open Edit Employee Modal
  const handleOpenEdit = (emp: any) => {
    const key = emp.user_id || emp.id;
    setEditingEmployee(emp);
    setEditForm({
      name: emp.display_name || "",
      username: emp.phone || emp.display_username || "",
      password: decryptedPasswords[key] || "",
    });
    setShowEditPassword(false);
  };

  // Save Edit Employee
  const handleSaveEdit = async () => {
    if (!editingEmployee) return;
    if (!editForm.name.trim() || !editForm.username.trim()) {
      toast({ title: "خطأ", description: "يرجى كتابة اسم الموظف واسم المستخدم", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      const cleanUsername = editForm.username.trim();
      const cleanName = editForm.name.trim();
      const cleanPass = editForm.password.trim();
      const empKey = editingEmployee.user_id || editingEmployee.id;

      await updateUserAccount(empKey, cleanName, cleanUsername, cleanPass || undefined);

      if (cleanPass) {
        setDecryptedPasswords((p) => ({ ...p, [empKey]: cleanPass }));
        setVisiblePasswords((p) => ({ ...p, [empKey]: true }));
      }

      toast({
        title: "تم حفظ التعديلات بنجاح",
        description: `تم تحديث الحساب: ${cleanUsername}`,
      });

      setEditingEmployee(null);
      fetchData();
    } catch (err: any) {
      toast({
        title: "خطأ في التحديث",
        description: getArabicErrorMessage(err, "تعذر تحديث بيانات الحساب."),
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Cashier Employee
  const handleDeleteEmployee = async () => {
    if (!deleteTargetEmployee) return;
    setDeletingEmployee(true);
    try {
      const empUserId = deleteTargetEmployee.user_id || deleteTargetEmployee.id;
      await deleteUserAccount(empUserId);

      toast({
        title: "تم حذف الحساب",
        description: `تم حذف حساب الموظف المعصرة (${deleteTargetEmployee.display_name || deleteTargetEmployee.phone})`,
      });

      setDeleteTargetEmployee(null);
      fetchData();
    } catch (err: any) {
      toast({
        title: "خطأ في الحذف",
        description: getArabicErrorMessage(err, "تعذر حذف الحساب."),
        variant: "destructive",
      });
    } finally {
      setDeletingEmployee(false);
    }
  };

  // Create Employee Cashier Sub-account
  const handleCreateEmployee = async () => {
    if (!newEmployee.name.trim() || !newEmployee.username.trim() || !newEmployee.password.trim()) {
      toast({ title: "خطأ", description: "يرجى كتابة اسم الموظف، واسم المستخدم، وكلمة المرور", variant: "destructive" });
      return;
    }
    if (!millCode.trim()) {
      toast({ title: "يجب تعيين رمز المعصرة أولاً", description: "اذهب لتبويب 'رمز المعصرة' وأنشئ رمزاً فريداً للمعصرة قبل إضافة موظف المعصرة", variant: "destructive" });
      return;
    }

    setCreatingEmployee(true);
    try {
      const originalUsername = newEmployee.username.trim();
      const originalPassword = newEmployee.password.trim();
      const originalName = newEmployee.name.trim();

      const targetMillId = millData?.mill?.id || millId;
      if (!targetMillId) {
        throw new Error("معرف المعصرة غير متوفر");
      }
      const { user_id: createdUserId } = await createEmployeeAccount({
        millId: targetMillId,
        displayName: originalName,
        username: originalUsername,
        password: originalPassword,
        millCode: millCode.trim()
      });

      if (createdUserId) {
        setDecryptedPasswords((prev) => ({ ...prev, [createdUserId]: originalPassword }));
        setVisiblePasswords((prev) => ({ ...prev, [createdUserId]: true }));
      }

      toast({
        title: "تم إنشاء حساب الموظف المعصرة بنجاح",
        description: `اسم الدخول: ${originalUsername} | كلمة المرور: ${originalPassword}`
      });

      setIsEmployeeModalOpen(false);
      setNewEmployee({ name: "", username: "", password: "" });
      setShowNewPassword(false);
      fetchData();
    } catch (err: any) {
      toast({
        title: "خطأ في إنشاء الحساب",
        description: getArabicErrorMessage(err, "تعذر إنشاء حساب موظف المعصرة."),
        variant: "destructive"
      });
    } finally {
      setCreatingEmployee(false);
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "active":
        return <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-bold px-3 py-1">نشط</Badge>;
      case "suspended":
      case "disabled":
        return <Badge variant="destructive" className="font-bold px-3 py-1">غير نشط (موقف)</Badge>;
      default:
        return <Badge variant="outline" className="text-amber-600 border-amber-300 font-bold px-3 py-1">قيد الانتظار</Badge>;
    }
  };

  const activePayments = payments.filter((payment) => !payment.reversed_at);
  const lastPayment = activePayments.length > 0 ? activePayments[0] : null;
  const totalPayments = activePayments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const outstandingAdminCharges = adminCharges.filter((charge) => charge.effective_status === "outstanding" || charge.effective_status === "partially_paid");
  const outstandingAdminChargesTotal = outstandingAdminCharges.reduce((total, charge) => total + Number(charge.remaining_amount || 0), 0);
  const savedSubscriptionType: SubscriptionType = currentMillRecord?.subscription_type === "seasonal" ? "seasonal" : "monthly";
  const savedSubscriptionFee = Number(currentMillRecord?.subscription_fee ?? currentMillRecord?.monthly_fee ?? 0);

  if (loading) return <div className="p-8 text-center text-muted-foreground">جارٍ تحميل إعدادات حساب المعصرة...</div>;

  if (fetchError || !millData) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-right" dir="rtl">
        <Card className="border-destructive/30 bg-destructive/5 text-right">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              <span>تعذر العثور على بيانات المعصرة</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground">
              {fetchError || `لم يتم العثور على أي سجل مطابق للمعرف (${millId}). قد يكون الحساب قد تم تعديله أو نقله.`}
            </p>
          </CardContent>
          <CardFooter className="flex gap-2 justify-start">
            <Button variant="outline" onClick={() => fetchData()} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              <span>إعادة المحاولة</span>
            </Button>
            <Button variant="default" onClick={() => navigate("/admin")} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              <span>العودة للوحة المشرف</span>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const status = millData.profile?.subscription_status || 'pending';

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Top Banner Alert */}
      <Alert className="bg-blue-50/70 border-blue-200 text-right" dir="rtl">
        <Info className="h-4 w-4 text-blue-600 shrink-0" />
        <AlertTitle className="text-blue-800 font-bold text-right">وضع الإدارة والإشراف العام</AlertTitle>
        <AlertDescription className="text-blue-700 text-xs mt-0.5 text-right">
          أنت تدير اشتراك وحسابات <strong>[{safeText(millData.profile?.mill_name, safeText(millData.profile?.display_name, "المعصرة"))}]</strong> بصلاحيات المشرف العام.
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
              {safeText(millData.profile?.mill_name, safeText(millData.profile?.display_name, 'تفاصيل المعصرة'))}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">المالك: {safeText(millData.profile?.display_name, "غير محدد")}</p>
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
              <p className="font-bold text-foreground text-base">{safeText(millData.profile?.mill_name, "غير محدد")}</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl text-right">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-start">
                <User className="h-3.5 w-3.5 text-primary" />
                <span>المالك / المدير</span>
              </div>
              <p className="font-bold text-foreground">{safeText(millData.profile?.display_name, "غير محدد")}</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl text-right">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-start">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span>الموقع والدولة</span>
              </div>
              <p className="font-bold text-foreground">{safeText(millData.profile?.mill_location, "غير محدد")} ({safeText(millData.profile?.country, "فلسطين")})</p>
            </div>

            <div className="space-y-1 bg-muted/40 p-3 rounded-xl text-right">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-start">
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span>أرقام الهاتف</span>
              </div>
              <div dir="ltr" className="text-right font-mono font-bold text-foreground">
                <div>{safeText(millData.profile?.phone, "---")}</div>
                {millData.profile?.secondary_phone && (
                  <div className="text-xs text-muted-foreground font-normal">{safeText(millData.profile?.secondary_phone)}</div>
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  الرد النقدي: {getCashReturnPricingLabel(normalizeCashReturnPricingMode(millData.currentSeason.cash_return_pricing_mode))}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">لا يوجد موسم نشط</p>
            )}
          </CardContent>
        </Card>

        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-right">خطة الاشتراك</CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="text-right">
            <p className="text-lg font-bold">
              {subscriptionType === "monthly" ? "اشتراك شهري" : "اشتراك موسمي"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {Number(subscriptionFee || 0).toLocaleString("ar-u-nu-latn")} ₪ لكل دورة
            </p>
          </CardContent>
        </Card>

        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-right">دفعات الاشتراك</CardTitle>
            <Banknote className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="text-right">
            <p className="text-2xl font-bold">{totalPayments.toLocaleString("ar-u-nu-latn")} ₪</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lastPayment ? `آخر دفعة: ${formatDate(lastPayment.payment_date)}` : "لا توجد دفعات مسجلة"}
            </p>
          </CardContent>
        </Card>

        <Card className="text-right">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-right">حسابات موظفي المعصرة</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="text-right">
            <p className="text-2xl font-bold">{employees.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">حسابات الموظفين المرتبطة بالمعصرة</p>
          </CardContent>
        </Card>
      </div>

      {/* Platform administration only: subscription and account access */}
      <Tabs defaultValue="subscription" className="space-y-4" dir="rtl">
        <TabsList className="grid grid-cols-2 w-full bg-muted/80 p-1.5 rounded-2xl gap-1" dir="rtl">
          <TabsTrigger value="subscription" className="gap-2 justify-center text-xs sm:text-sm font-medium rounded-xl py-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>الاشتراك والتحكم</span>
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-2 justify-center text-xs sm:text-sm font-medium rounded-xl py-2.5">
            <UserCheck className="h-4 w-4 shrink-0" />
            <span>حسابات الموظفين ({employees.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Employee accounts */}
        <TabsContent value="employees">
          {/* Mill Code Section */}
          <Card className="mb-4 border-primary/20 bg-primary/5 text-right">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-right">
                <Lock className="h-4 w-4 text-primary" />
                <span>رمز المعصرة (Mill Code) — ضروري للتمييز بين المعاصر</span>
              </CardTitle>
              <CardDescription className="text-xs text-right">
                رمز فريد عالمياً يُضاف تلقائياً لأسماء مستخدمي الموظف المعصرة عند إنشائهم.
                مثال: إذا كان الرمز <strong>tomeh</strong> وأنشأت موظف المعصرةاً باسم <strong>ahmad</strong>، يدخل الموظف المعصرة بكتابة <strong>ahmad</strong> فقط في شاشة الدخول.
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
                    الموظف المعصرةون يدخلون باسم مستخدم بسيط (مثل: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">ahmad</code>)
                  </span>
                )}
              </div>
              {!millCode && (
                <p className="text-xs text-destructive mt-2 text-right">
                  ⚠️ يجب تعيين رمز المعصرة قبل إنشاء حسابات الموظف المعصرة لضمان عدم التعارض مع معاصر أخرى.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="text-right">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-right">
                  <UserCheck className="h-5 w-5 text-primary" />
                  <span>حسابات الموظفين والموظف المعصرة (Sub-Accounts)</span>
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
                    <span>إنشاء حساب موظف المعصرة جديد</span>
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl" className="text-right sm:max-w-[450px]">
                  <DialogHeader className="text-right sm:text-right">
                    <DialogTitle className="text-right">إنشاء حساب موظف / موظف المعصرة جديد</DialogTitle>
                    <DialogDescription className="text-right">
                      سيحصل هذا الحساب على صلاحيات الطابور، إصدار الفواتير، وطباعة الفواتير فقط الخاصة بهذه المعصرة.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-3 text-right">
                    <div className="space-y-2">
                      <Label className="text-right block">اسم الموظف / الموظف المعصرة *</Label>
                      <Input
                        value={newEmployee.name}
                        onChange={(e) => setNewEmployee(p => ({ ...p, name: e.target.value }))}
                        placeholder="مثال: أحمد الموظف المعصرة"
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
                      <div className="relative">
                        <Input
                          type={showNewPassword ? "text" : "password"}
                          value={newEmployee.password}
                          onChange={(e) => setNewEmployee(p => ({ ...p, password: e.target.value }))}
                          placeholder="أدخل كلمة المرور (مثال: 123456)"
                          dir="ltr"
                          className="text-left font-mono pe-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute inset-y-0 end-0 pe-3 flex items-center text-muted-foreground hover:text-foreground"
                          title={showNewPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateEmployee} disabled={creatingEmployee} className="w-full">
                      {creatingEmployee ? "جارٍ إنشاء الحساب..." : "تأكيد وإنشاء حساب الموظف المعصرة"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Edit Employee Dialog */}
              <Dialog open={!!editingEmployee} onOpenChange={(o) => !o && setEditingEmployee(null)}>
                <DialogContent dir="rtl" className="text-right sm:max-w-[450px]">
                  <DialogHeader className="text-right sm:text-right">
                    <DialogTitle className="text-right">تعديل حساب الموظف المعصرة</DialogTitle>
                    <DialogDescription className="text-right">
                      يمكنك تعديل اسم الموظف، وضبط أحرف اسم المستخدم (Capital / Small)، وتعيين أو إظهار كلمة المرور.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-3 text-right">
                    <div className="space-y-2">
                      <Label className="text-right block">اسم الموظف / الموظف المعصرة *</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="مثال: Casher"
                        className="text-right"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-right block">اسم المستخدم (Username) *</Label>
                      <Input
                        type="text"
                        value={editForm.username}
                        onChange={(e) => setEditForm(p => ({ ...p, username: e.target.value }))}
                        placeholder="مثال: Casherraef2"
                        dir="ltr"
                        className="text-left font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground text-right">يتم حفظ حالة الأحرف الكبيرة والصغيرة تماماً كما تكتبها (مثل: Casherraef2)</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-right block">كلمة المرور *</Label>
                      <div className="relative">
                        <Input
                          type={showEditPassword ? "text" : "password"}
                          value={editForm.password}
                          onChange={(e) => setEditForm(p => ({ ...p, password: e.target.value }))}
                          placeholder="أدخل كلمة المرور"
                          dir="ltr"
                          className="text-left font-mono pe-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditPassword(!showEditPassword)}
                          className="absolute inset-y-0 end-0 pe-3 flex items-center text-muted-foreground hover:text-foreground"
                          title={showEditPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        >
                          {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setEditingEmployee(null)}>إلغاء</Button>
                    <Button onClick={handleSaveEdit} disabled={savingEdit}>
                      {savingEdit ? "جارٍ الحفظ..." : "حفظ التعديلات"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Delete Employee Confirmation */}
              <AlertDialog open={!!deleteTargetEmployee} onOpenChange={(o) => !o && setDeleteTargetEmployee(null)}>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>تأكيد حذف حساب الموظف المعصرة</AlertDialogTitle>
                    <AlertDialogDescription>
                      هل أنت متأكد من حذف حساب الموظف المعصرة <strong>{deleteTargetEmployee?.display_name || deleteTargetEmployee?.phone}</strong>؟ لن يتمكن من تسجيل الدخول للنظام بعد الحذف.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2">
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteEmployee}
                      disabled={deletingEmployee}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deletingEmployee ? "جارٍ الحذف..." : "تأكيد الحذف"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardHeader>
            <CardContent>
              <Table dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم الموظف</TableHead>
                    <TableHead className="text-right">اسم المستخدم</TableHead>
                    <TableHead className="text-right">كلمة المرور</TableHead>
                    <TableHead className="text-right">الصلاحيات</TableHead>
                    <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp: any) => {
                    const empKey = emp.user_id || emp.id;
                    const displayUser = safeText(emp.phone || emp.display_username, safeText(getDisplayUsername(emp.display_name, null), 'موظف'));
                    const isPassVisible = visiblePasswords[empKey] || false;
                    const plainPass = decryptedPasswords[empKey];
                    const isDecrypting = decryptingLoading[empKey] || false;

                    return (
                      <TableRow key={empKey}>
                        <TableCell className="font-bold text-foreground text-right">{safeText(emp.display_name, 'موظف المعصرة')}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-primary text-right">
                          <div className="flex items-center gap-1 justify-start">
                            <span>{displayUser}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground hover:text-foreground"
                              title="نسخ اسم المستخدم"
                              onClick={() => {
                                navigator.clipboard.writeText(displayUser);
                                toast({ title: "تم النسخ", description: "تم نسخ اسم المستخدم" });
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
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
                              title={isPassVisible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                              onClick={() => togglePasswordVisibility(emp)}
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
                              onClick={() => handleCopyPassword(emp)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-primary"
                              title="تعيين أو تعديل كلمة المرور"
                              onClick={() => handleOpenEdit(emp)}
                            >
                              <Key className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="text-xs">
                            الطابور + الفوترة + طباعة الفواتير
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground text-right">
                          {formatDate(emp.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          {emp.is_active === false ? (
                            <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">معطّل</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">نشط</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-start">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                              title={emp.is_active === false ? "إعادة تفعيل الحساب" : "تعطيل الحساب مؤقتاً"}
                              onClick={async () => {
                                try {
                                  const empUserId = emp.user_id || emp.id;
                                  const newState = emp.is_active === false;
                                  await toggleUserAccountActive(empUserId, newState);
                                  toast({
                                    title: newState ? "تم تفعيل الحساب" : "تم تعطيل الحساب",
                                    description: `تم تحديث حالة حساب (${emp.display_name || emp.phone}) بنجاح`,
                                  });
                                  fetchData();
                                } catch (err: any) {
                                  toast({
                                    title: "خطأ",
                                    description: getArabicErrorMessage(err, "تعذر تغيير حالة الحساب."),
                                    variant: "destructive",
                                  });
                                }
                              }}
                            >
                              {emp.is_active === false ? (
                                <UserCheck className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <UserX className="h-3.5 w-3.5 text-amber-600" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title="تعديل الحساب / اسم المستخدم / كلمة المرور"
                              onClick={() => handleOpenEdit(emp)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="حذف / تعطيل حساب الموظف المعصرة"
                              onClick={() => setDeleteTargetEmployee(emp)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {employees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        لا توجد حسابات موظفين مسجلة لهذه المعصرة بعد. اضغط "إنشاء حساب موظف المعصرة جديد" لإنشاء أول حساب.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription management and platform billing */}
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
                <div className="flex gap-3">
                  <Button
                    onClick={() => updateSubscription('active')}
                    disabled={updating || status === 'active'}
                    className={`flex-1 gap-2 transition-all font-bold ${status === 'active'
                        ? 'opacity-40 cursor-not-allowed bg-green-600/40 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white shadow-md ring-2 ring-green-500/40 hover:scale-[1.01]'
                      }`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>تفعيل الحساب</span>
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => updateSubscription('suspended')}
                    disabled={updating || status === 'suspended'}
                    className={`flex-1 gap-2 transition-all font-bold ${status === 'suspended'
                        ? 'opacity-40 cursor-not-allowed bg-destructive/40 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white shadow-md ring-2 ring-red-500/40 hover:scale-[1.01]'
                      }`}
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

            {/* Subscription plan and payments */}
            <Card className="overflow-hidden text-right">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                      <Banknote className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">الاشتراك والفوترة</CardTitle>
                      <CardDescription className="mt-1">الخطة المتفق عليها وسجل الدفعات</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                    <CheckCircle2 className="ml-1 h-3.5 w-3.5" />
                    محفوظة
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-5 p-5">
                <section className="rounded-2xl border bg-gradient-to-l from-primary/[0.08] to-transparent p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">الخطة الحالية</p>
                      <div className="mt-2 flex items-center gap-2">
                        <h3 className="text-xl font-bold">اشتراك {savedSubscriptionType === "monthly" ? "شهري" : "موسمي"}</h3>
                        <Badge variant="secondary">{savedSubscriptionType === "monthly" ? "كل شهر" : "كل موسم"}</Badge>
                      </div>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold tracking-tight">
                          {(Number.isFinite(savedSubscriptionFee) ? savedSubscriptionFee : 0).toLocaleString("ar-u-nu-latn")}
                        </span>
                        <span className="font-semibold">₪</span>
                        <span className="text-sm text-muted-foreground">/ {savedSubscriptionType === "monthly" ? "شهر" : "موسم"}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:min-w-40">
                      <Button onClick={() => setIsPaymentModalOpen(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        تسجيل دفعة
                      </Button>
                      <Button variant="outline" onClick={beginSubscriptionPlanEdit} className="gap-2 bg-background/80">
                        <Edit className="h-4 w-4" />
                        تعديل الخطة
                      </Button>
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-3 divide-x divide-x-reverse rounded-xl border bg-background">
                  <div className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">إجمالي المدفوع</p>
                    <p className="mt-1 font-bold text-green-700">{totalPayments.toLocaleString("ar-u-nu-latn")} ₪</p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">عدد الدفعات</p>
                    <p className="mt-1 font-bold">{activePayments.length.toLocaleString("ar-u-nu-latn")}</p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">آخر دفعة</p>
                    <p className="mt-1 truncate text-sm font-bold">{lastPayment ? formatDate(lastPayment.payment_date) : "—"}</p>
                  </div>
                </div>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-bold">آخر الدفعات</h4>
                    {payments.length > 0 && <span className="text-xs text-muted-foreground">الأحدث أولًا</span>}
                  </div>

                  {payments.length > 0 ? (
                    <div className="max-h-[190px] divide-y overflow-y-auto rounded-xl border">
                      {payments.slice(0, 5).map((payment) => (
                        <div key={payment.id} className={`flex items-center justify-between gap-4 p-3 ${payment.reversed_at ? "opacity-60" : ""}`}>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="rounded-lg bg-green-50 p-2 text-green-700">
                              <Banknote className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-green-700">{Number(payment.amount).toLocaleString("ar-u-nu-latn")} ₪</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {safeText(payment.notes, payment.subscription_type === "seasonal" ? "دفعة اشتراك موسمي" : "دفعة اشتراك شهري")}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-left">
                            <time className="block text-xs text-muted-foreground">{formatDate(payment.payment_date)}</time>
                            {payment.reversed_at && <Badge variant="secondary" className="mt-1">تم عكسها</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed px-4 py-7 text-center">
                      <Banknote className="mx-auto h-7 w-7 text-muted-foreground/50" />
                      <p className="mt-2 text-sm font-medium">لا توجد دفعات مسجلة</p>
                      <p className="mt-1 text-xs text-muted-foreground">استخدم زر «تسجيل دفعة» عند استلام أول دفعة.</p>
                    </div>
                  )}
                </section>
              </CardContent>

              <Dialog
                open={isEditingSubscriptionPlan}
                onOpenChange={(open) => open ? beginSubscriptionPlanEdit() : cancelSubscriptionPlanEdit()}
              >
                <DialogContent dir="rtl" className="text-right sm:max-w-[520px]">
                  <DialogHeader className="text-right sm:text-right">
                    <DialogTitle className="text-right">تعديل خطة الاشتراك</DialogTitle>
                    <DialogDescription className="text-right">
                      اختر دورة الاشتراك وحدد القيمة المتفق عليها مع المعصرة.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-5 py-2">
                    <RadioGroup
                      value={subscriptionType}
                      onValueChange={(value) => setSubscriptionType(value as SubscriptionType)}
                      className="grid grid-cols-2 gap-3"
                      dir="rtl"
                    >
                      <Label
                        htmlFor="subscription-monthly"
                        className={`cursor-pointer rounded-xl border p-4 transition-colors ${subscriptionType === "monthly" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="monthly" id="subscription-monthly" />
                          <span className="font-bold">شهري</span>
                        </div>
                        <span className="mt-2 block text-xs font-normal text-muted-foreground">دفعة متفق عليها لكل شهر</span>
                      </Label>
                      <Label
                        htmlFor="subscription-seasonal"
                        className={`cursor-pointer rounded-xl border p-4 transition-colors ${subscriptionType === "seasonal" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="seasonal" id="subscription-seasonal" />
                          <span className="font-bold">موسمي</span>
                        </div>
                        <span className="mt-2 block text-xs font-normal text-muted-foreground">دفعة متفق عليها لكل موسم</span>
                      </Label>
                    </RadioGroup>

                    <div className="space-y-2">
                      <Label htmlFor="subscriptionFee" className="block font-medium">
                        قيمة الاشتراك
                      </Label>
                      <div className="relative">
                        <Input
                          id="subscriptionFee"
                          type="number"
                          min="0"
                          step="0.01"
                          value={subscriptionFee}
                          onChange={(event) => setSubscriptionFee(event.target.value)}
                          className="h-12 pl-12 text-left text-lg font-bold font-mono"
                          dir="ltr"
                          autoFocus
                        />
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">₪</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        تُسجّل هذه القيمة لكل {subscriptionType === "monthly" ? "شهر" : "موسم"}، ولا تُنشئ دفعة تلقائيًا.
                      </p>
                    </div>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={cancelSubscriptionPlanEdit} disabled={updating}>إلغاء</Button>
                    <Button onClick={saveSubscriptionPlan} disabled={updating} className="gap-2 sm:min-w-36">
                      <Save className="h-4 w-4" />
                      {updating ? "جارٍ الحفظ..." : "حفظ التعديلات"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={isPaymentModalOpen}
                onOpenChange={(open) => {
                  setIsPaymentModalOpen(open);
                  if (open) paymentIdempotencyKeyRef.current = crypto.randomUUID();
                }}
              >
                <DialogContent dir="rtl" className="text-right sm:max-w-[480px]">
                  <DialogHeader className="text-right sm:text-right">
                    <DialogTitle className="text-right">تسجيل دفعة اشتراك</DialogTitle>
                    <DialogDescription className="text-right">
                      ستُضاف الدفعة إلى السجل المالي للاشتراك ولن تغيّر قيمة الخطة.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="rounded-xl border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">الخطة الحالية</span>
                      <span className="font-bold">
                        {savedSubscriptionType === "monthly" ? "شهري" : "موسمي"} · {(Number.isFinite(savedSubscriptionFee) ? savedSubscriptionFee : 0).toLocaleString("ar-u-nu-latn")} ₪
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 py-2">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="block">مبلغ الدفعة *</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={newPayment.amount}
                            onChange={(event) => setNewPayment({ ...newPayment, amount: event.target.value })}
                            placeholder="0.00"
                            dir="ltr"
                            className="h-11 pl-10 text-left font-mono font-bold"
                            autoFocus
                          />
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₪</span>
                        </div>
                      </div>
                      <ClickableDateInput
                        label="تاريخ الدفع *"
                        value={newPayment.date}
                        onChange={(value) => setNewPayment({ ...newPayment, date: value })}
                        inputClassName="h-11 text-left font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="block">ملاحظة <span className="font-normal text-muted-foreground">(اختياري)</span></Label>
                      <Textarea
                        value={newPayment.notes}
                        onChange={(event) => setNewPayment({ ...newPayment, notes: event.target.value })}
                        placeholder="مثال: حوالة بنكية أو دفعة نقدية"
                        className="min-h-20 text-right"
                      />
                    </div>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)} disabled={updating}>إلغاء</Button>
                    <Button onClick={handleAddPayment} disabled={updating || !newPayment.amount} className="gap-2 sm:min-w-36">
                      <Save className="h-4 w-4" />
                      {updating ? "جارٍ التسجيل..." : "حفظ الدفعة"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Card>

            <Card className="overflow-hidden text-right md:col-span-2">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700">
                      <Banknote className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">ديون ورسوم إضافية</CardTitle>
                      <CardDescription className="mt-1">
                        مبالغ إدارية مستقلة عن الاشتراك وعن صندوق المعصرة ودفترها المالي.
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    className="gap-2"
                    onClick={() => {
                      chargeIdempotencyKeyRef.current = crypto.randomUUID();
                      setIsChargeModalOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    إضافة دين آخر
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border bg-amber-50/70 p-4">
                    <p className="text-xs text-muted-foreground">إجمالي الديون المفتوحة</p>
                    <p className="mt-1 text-xl font-bold text-amber-800">{outstandingAdminChargesTotal.toLocaleString("ar-u-nu-latn")} ₪</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground">عدد الديون المفتوحة</p>
                    <p className="mt-1 text-xl font-bold">{outstandingAdminCharges.length.toLocaleString("ar-u-nu-latn")}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground">إجمالي السجل</p>
                    <p className="mt-1 text-xl font-bold">{adminCharges.length.toLocaleString("ar-u-nu-latn")}</p>
                  </div>
                </div>

                {adminCharges.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">الدين</TableHead>
                          <TableHead className="text-right">الأصلي</TableHead>
                          <TableHead className="text-right">المدفوع</TableHead>
                          <TableHead className="text-right">المتبقي</TableHead>
                          <TableHead className="text-right">الاستحقاق</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">الإجراء</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminCharges.map((charge) => (
                          <TableRow key={charge.id}>
                            <TableCell>
                              <p className="font-bold">{safeText(charge.title)}</p>
                              {charge.notes && <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">{safeText(charge.notes)}</p>}
                            </TableCell>
                            <TableCell className="font-bold">{Number(charge.amount || 0).toLocaleString("ar-u-nu-latn")} ₪</TableCell>
                            <TableCell className="font-bold text-emerald-700">{Number(charge.paid_amount || 0).toLocaleString("ar-u-nu-latn")} ₪</TableCell>
                            <TableCell className="font-black text-amber-700">{Number(charge.remaining_amount || 0).toLocaleString("ar-u-nu-latn")} ₪</TableCell>
                            <TableCell>{charge.due_date ? formatDate(charge.due_date) : "غير محدد"}</TableCell>
                            <TableCell>
                              {charge.effective_status === "outstanding" && <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">مستحق</Badge>}
                              {charge.effective_status === "partially_paid" && <Badge className="border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-100">مسدد جزئيًا</Badge>}
                              {charge.effective_status === "paid" && <Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">مسدد</Badge>}
                              {charge.effective_status === "cancelled" && <Badge variant="secondary">ملغى</Badge>}
                            </TableCell>
                            <TableCell>
                              {charge.effective_status === "outstanding" || charge.effective_status === "partially_paid" ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" variant="outline" className="border-green-200 text-green-700" disabled={updating} onClick={() => openAdminChargePayment(charge)}>
                                    تسجيل دفعة
                                  </Button>
                                  {Number(charge.paid_amount || 0) === 0 && (
                                    <Button size="sm" variant="ghost" className="text-destructive" disabled={updating} onClick={() => void updateAdminChargeStatus(charge.id)}>
                                      إلغاء الدين
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">أُغلق في {formatDate(charge.settled_at)}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Banknote className="mx-auto h-8 w-8 opacity-40" />
                    <p className="mt-2 text-sm font-medium">لا توجد ديون إضافية مسجلة</p>
                  </div>
                )}
              </CardContent>

              <Dialog
                open={isChargeModalOpen}
                onOpenChange={(open) => {
                  setIsChargeModalOpen(open);
                  if (open) chargeIdempotencyKeyRef.current = crypto.randomUUID();
                }}
              >
                <DialogContent dir="rtl" className="text-right sm:max-w-[540px]">
                  <DialogHeader className="text-right sm:text-right">
                    <DialogTitle className="text-right">إضافة دين أو رسم إداري</DialogTitle>
                    <DialogDescription className="text-right">
                      يُحفظ هذا المبلغ في حساب المعصرة لدى إدارة المنصة، ولا يغيّر كاش المعصرة أو تقاريرها التشغيلية.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="admin-charge-title">اسم الدين *</Label>
                      <Input
                        id="admin-charge-title"
                        maxLength={120}
                        value={newCharge.title}
                        onChange={(event) => setNewCharge((current) => ({ ...current, title: event.target.value }))}
                        placeholder="مثال: رسوم إعداد أو خدمة إضافية"
                        autoFocus
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="admin-charge-amount">المبلغ *</Label>
                        <div className="relative">
                          <Input
                            id="admin-charge-amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={newCharge.amount}
                            onChange={(event) => setNewCharge((current) => ({ ...current, amount: event.target.value }))}
                            placeholder="0.00"
                            dir="ltr"
                            className="pl-10 text-left font-mono font-bold"
                          />
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₪</span>
                        </div>
                      </div>
                      <ClickableDateInput
                        label="تاريخ الاستحقاق (اختياري)"
                        value={newCharge.dueDate}
                        onChange={(value) => setNewCharge((current) => ({ ...current, dueDate: value }))}
                        inputClassName="text-left font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-charge-notes">ملاحظات (اختياري)</Label>
                      <Textarea
                        id="admin-charge-notes"
                        maxLength={2000}
                        value={newCharge.notes}
                        onChange={(event) => setNewCharge((current) => ({ ...current, notes: event.target.value }))}
                        placeholder="أي تفاصيل إضافية عن سبب الدين"
                        className="min-h-20"
                      />
                    </div>
                    <Label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/20 p-3">
                      <Checkbox
                        checked={newCharge.notify}
                        onCheckedChange={(checked) => setNewCharge((current) => ({ ...current, notify: checked === true }))}
                      />
                      <span>
                        <span className="block font-medium">إرسال إشعار لمالك المعصرة</span>
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">سيظهر المبلغ وتاريخ الاستحقاق على جرس الإشعارات.</span>
                      </span>
                    </Label>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={() => setIsChargeModalOpen(false)} disabled={updating}>إلغاء</Button>
                    <Button onClick={handleAddAdminCharge} disabled={updating || !newCharge.title || !newCharge.amount} className="gap-2 sm:min-w-36">
                      <Save className="h-4 w-4" />
                      {updating ? "جارٍ الحفظ..." : "حفظ الدين"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={Boolean(paymentCharge)} onOpenChange={(open) => !open && setPaymentCharge(null)}>
                <DialogContent dir="rtl" className="text-right sm:max-w-[520px]">
                  <DialogHeader className="text-right sm:text-right">
                    <DialogTitle>تسجيل دفعة من الدين</DialogTitle>
                    <DialogDescription>{paymentCharge?.title} — تدخل الدفعة فعليًا إلى صندوق إدارة المنصة.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-3 text-center">
                      <div><p className="text-xs text-muted-foreground">الأصلي</p><p className="font-bold">{Number(paymentCharge?.amount || 0).toLocaleString("ar-u-nu-latn")} ₪</p></div>
                      <div><p className="text-xs text-muted-foreground">المدفوع</p><p className="font-bold text-emerald-700">{Number(paymentCharge?.paid_amount || 0).toLocaleString("ar-u-nu-latn")} ₪</p></div>
                      <div><p className="text-xs text-muted-foreground">المتبقي</p><p className="font-black text-amber-700">{Number(paymentCharge?.remaining_amount || 0).toLocaleString("ar-u-nu-latn")} ₪</p></div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="admin-charge-payment-amount">مبلغ الدفعة *</Label>
                        <Input id="admin-charge-payment-amount" type="number" min="0.01" max={paymentCharge?.remaining_amount} step="0.01" value={chargePayment.amount} onChange={(event) => setChargePayment((current) => ({ ...current, amount: event.target.value }))} dir="ltr" className="text-left font-mono font-bold" autoFocus />
                      </div>
                      <ClickableDateInput label="تاريخ الدفع *" value={chargePayment.date} onChange={(date) => setChargePayment((current) => ({ ...current, date }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-charge-payment-notes">ملاحظة (اختياري)</Label>
                      <Textarea id="admin-charge-payment-notes" value={chargePayment.notes} onChange={(event) => setChargePayment((current) => ({ ...current, notes: event.target.value }))} placeholder="مثال: حوالة بنكية أو دفعة نقدية" />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={() => setPaymentCharge(null)} disabled={updating}>إلغاء</Button>
                    <Button onClick={handleAdminChargePayment} disabled={updating || !chargePayment.amount}>{updating ? "جارٍ التسجيل..." : "تسجيل الدفعة"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
