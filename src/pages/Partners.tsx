import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users2,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Phone,
  Percent,
  Calendar,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSeason } from "@/contexts/SeasonContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCashSession } from "@/contexts/CashSessionContext";
import { formatDate } from "@/lib/formatters";

interface Partner {
  id: string;
  name: string;
  phone?: string | null;
  share_percent: number;
  notes?: string | null;
  active: boolean;
  created_at: string;
  total_due?: number; // Computed from payables
}

interface PartnerTx {
  id: string;
  type: string;
  amount: number;
  direction: string;
  description: string;
  party_name: string;
  created_at: string;
}

export default function Partners() {
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const { isOpen: isCashOpen, refresh: refreshCash } = useCashSession();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerTxs, setPartnerTxs] = useState<PartnerTx[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Partner Dialog State
  const [addPartnerOpen, setAddPartnerOpen] = useState(false);
  const [newPartner, setNewPartner] = useState({ name: "", phone: "", share_percent: "", notes: "" });
  const [savingPartner, setSavingPartner] = useState(false);

  // Partner Action Dialog (Deposit / Withdrawal)
  const [txDialogTarget, setTxDialogTarget] = useState<Partner | null>(null);
  const [txType, setTxType] = useState<"deposit" | "withdrawal">("deposit");
  const [txAmount, setTxAmount] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    if (activeSeason) {
      fetchPartners();
    }
  }, [activeSeason?.id]);

  const fetchPartners = async () => {
    if (!activeSeason) return;
    setLoading(true);
    try {
      const [partnersRes, payablesRes, txsRes] = await Promise.all([
        supabase.from("partners" as any).select("*").order("name", { ascending: true }),
        supabase.from("payables" as any).select("partner_id, remaining_amount").eq("status", "unpaid").or("status.eq.partially_paid"),
        supabase.from("financial_transactions" as any).select("*").eq("party_type", "partner").order("created_at", { ascending: false }).limit(20)
      ]);

      const partnerList: Partner[] = (partnersRes.data || []) as any;
      const duesMap: Record<string, number> = {};
      ((payablesRes.data || []) as any[]).forEach((p) => {
        if (p.partner_id) {
          duesMap[p.partner_id] = (duesMap[p.partner_id] || 0) + Number(p.remaining_amount || 0);
        }
      });

      const enriched = partnerList.map((pt) => ({
        ...pt,
        total_due: duesMap[pt.id] || 0,
      }));

      setPartners(enriched);
      setPartnerTxs((txsRes.data || []) as any);
    } catch (err) {
      console.error("fetchPartners error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPartner = async () => {
    if (!newPartner.name.trim()) {
      toast({ title: "تنبيه", description: "يرجى كتابة اسم الشريك", variant: "destructive" });
      return;
    }

    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!effectiveMillId) return;

    setSavingPartner(true);
    try {
      const { error } = await supabase.from("partners" as any).insert({
        mill_id: effectiveMillId,
        name: newPartner.name.trim(),
        phone: newPartner.phone.trim() || null,
        share_percent: parseFloat(newPartner.share_percent) || 0,
        notes: newPartner.notes.trim() || null,
        active: true,
      });

      if (error) throw error;

      toast({ title: "تمت الإضافة", description: `تم تسجيل الشريك ${newPartner.name} بنجاح` });
      setNewPartner({ name: "", phone: "", share_percent: "", notes: "" });
      setAddPartnerOpen(false);
      await fetchPartners();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر إضافة الشريك", variant: "destructive" });
    } finally {
      setSavingPartner(false);
    }
  };

  const handlePartnerTx = async () => {
    if (!txDialogTarget || !activeSeason) return;
    const amount = parseFloat(txAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
      toast({ title: "خطأ", description: "يرجى إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }

    if (!isCashOpen) {
      toast({
        title: "الصندوق مغلق",
        description: "يجب فتح الصندوق أولاً لإجراء الإيداعات أو المسحوبات النقدية للشركاء",
        variant: "destructive",
      });
      return;
    }

    setTxLoading(true);
    try {
      const { data, error } = await supabase.rpc("record_partner_transaction_atomic" as any, {
        p_season_id: activeSeason.id,
        p_partner_id: txDialogTarget.id,
        p_type: txType,
        p_amount: amount,
        p_notes: txNotes.trim() || null,
      });

      if (error) throw error;

      toast({
        title: txType === "deposit" ? "تم تسجيل الإيداع" : "تم تسجيل المسحوبات",
        description: `تم تسجيل ${txType === "deposit" ? "إيداع" : "سحب"} بمبلغ ${amount} ₪ للشريك ${txDialogTarget.name}`,
      });

      setTxDialogTarget(null);
      setTxAmount("");
      setTxNotes("");
      await fetchPartners();
      await refreshCash();
    } catch (err: any) {
      toast({
        title: "فشل العملية",
        description: err.message || "تعذر تسجيل حركة الشريك",
        variant: "destructive",
      });
    } finally {
      setTxLoading(false);
    }
  };

  const totalPartnersDue = partners.reduce((s, p) => s + (p.total_due || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" />
            الشركاء والمساهمون
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة حسابات الشركاء، مستحقات المصاريف المدفوعة، وحركات الإيداع والمسحوبات
          </p>
        </div>
        <Button onClick={() => setAddPartnerOpen(true)} className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          إضافة شريك جديد
        </Button>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-emerald-800 dark:text-emerald-300 font-medium">
              إجمالي المبالغ المستحقة للشركاء على المعصرة
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {totalPartnersDue.toLocaleString()} ₪
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              مجموع المصاريف والمشتريات التي دفعها الشركاء من أموالهم ولم تُسدد بعد
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-800 dark:text-blue-300 font-medium">
              عدد الشركاء المسجلين
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {partners.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">شركاء ومساهمون معتمدون في سجل المعصرة</p>
          </CardContent>
        </Card>
      </div>

      {/* Partners List */}
      <Card>
        <CardHeader className="p-4 sm:p-6 pb-2">
          <CardTitle className="text-lg font-bold">قائمة الشركاء والمساهمين</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right">اسم الشريك</TableHead>
                  <TableHead className="text-right">الهاتف</TableHead>
                  <TableHead className="text-right">نسبة الشراكة</TableHead>
                  <TableHead className="text-right">المبالغ المستحقة له</TableHead>
                  <TableHead className="text-right">ملاحظات</TableHead>
                  <TableHead className="text-center">إجراءات مالية</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      جارٍ التحميل...
                    </TableCell>
                  </TableRow>
                ) : partners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      لا يوجد شركاء مسجلين حتى الآن
                    </TableCell>
                  </TableRow>
                ) : (
                  partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold text-foreground">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.phone ? <span dir="ltr">{p.phone}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-mono font-medium">
                        {p.share_percent ? `${p.share_percent}%` : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
                        {p.total_due ? `${p.total_due.toLocaleString()} ₪` : "0 ₪"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.notes || "—"}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTxDialogTarget(p);
                              setTxType("deposit");
                              setTxAmount("");
                            }}
                            className="h-7 text-xs gap-1 border-emerald-500/40 hover:bg-emerald-50 text-emerald-700 dark:hover:bg-emerald-950/40 dark:text-emerald-400"
                          >
                            <ArrowDownLeft className="h-3 w-3" /> إيداع كاش
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTxDialogTarget(p);
                              setTxType("withdrawal");
                              setTxAmount("");
                            }}
                            className="h-7 text-xs gap-1 border-rose-500/40 hover:bg-rose-50 text-rose-700 dark:hover:bg-rose-950/40 dark:text-rose-400"
                          >
                            <ArrowUpRight className="h-3 w-3" /> سحب أرباح
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Partner Transactions Ledger */}
      {partnerTxs.length > 0 && (
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2">
            <CardTitle className="text-lg font-bold">سجل حركات الشركاء المالية الأخيرة</CardTitle>
            <CardDescription className="text-xs">
              الحركات المالية النقدية الموثقة في دفتر الحركات المالي
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 pt-0">
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right">الشريك</TableHead>
                    <TableHead className="text-right">نوع الحركة</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">البيان</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnerTxs.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-semibold text-foreground">{tx.party_name}</TableCell>
                      <TableCell>
                        {tx.type === "owner_deposit" ? (
                          <Badge className="bg-emerald-600 text-white text-[10px]">إيداع شريك</Badge>
                        ) : tx.type === "owner_withdrawal" ? (
                          <Badge variant="destructive" className="text-[10px]">مسحوبات شريك</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{tx.type}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold" dir="ltr">
                        {tx.direction === "in" ? `+${tx.amount} ₪` : `-${tx.amount} ₪`}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tx.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Partner Dialog */}
      <Dialog open={addPartnerOpen} onOpenChange={setAddPartnerOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users2 className="h-5 w-5 text-primary" />
              إضافة شريك أو مساهم
            </DialogTitle>
            <DialogDescription>
              تسجيل بيانات الشريك لتوثيق مستحقاته والمصروفات المسددة من ماله الخاص
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label>اسم الشريك <span className="text-rose-500">*</span></Label>
              <Input
                value={newPartner.name}
                onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>رقم الهاتف</Label>
              <Input
                value={newPartner.phone}
                onChange={(e) => setNewPartner({ ...newPartner, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>نسبة الحصة أو الملكية % (اختياري)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={newPartner.share_percent}
                onChange={(e) => setNewPartner({ ...newPartner, share_percent: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Textarea
                value={newPartner.notes}
                onChange={(e) => setNewPartner({ ...newPartner, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddPartnerOpen(false)} disabled={savingPartner}>
              إلغاء
            </Button>
            <Button onClick={handleAddPartner} disabled={savingPartner}>
              {savingPartner ? "جاري الحفظ..." : "حفظ الشريك"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partner Tx Dialog (Deposit / Withdrawal) */}
      <Dialog open={Boolean(txDialogTarget)} onOpenChange={(o) => !o && setTxDialogTarget(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {txType === "deposit" ? (
                <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-rose-600" />
              )}
              {txType === "deposit" ? "إيداع نقدي من الشريك" : "سحب نقدي للشريك"}
            </DialogTitle>
            <DialogDescription>
              الشريك: <strong className="text-foreground">{txDialogTarget?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label>المبلغ (شيكل) <span className="text-rose-500">*</span></Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                className="text-right font-bold text-base"
                autoFocus
              />
            </div>

            {!isCashOpen && (
              <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> الصندوق مغلق؛ يتطلب إجراء الحركة النقدية فتح الصندوق أولاً.
              </p>
            )}

            <div className="space-y-1.5">
              <Label>البيان / ملاحظات الحركة</Label>
              <Input
                value={txNotes}
                onChange={(e) => setTxNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTxDialogTarget(null)} disabled={txLoading}>
              إلغاء
            </Button>
            <Button
              onClick={handlePartnerTx}
              disabled={txLoading || !isCashOpen}
              className={txType === "deposit" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}
            >
              {txLoading ? "جاري المعالجة..." : "تأكيد الحركة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
