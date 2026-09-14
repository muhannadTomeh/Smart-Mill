import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Landmark, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCashSession } from "@/contexts/CashSessionContext";
import { useSeason } from "@/contexts/SeasonContext";
import { supabase } from "@/integrations/supabase/client";

type Partner = { id: string; name: string };

export default function Treasury() {
  const navigate = useNavigate();
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const { session, isOpen, refreshSession } = useCashSession();
  const { toast } = useToast();
  const [vaultBalance, setVaultBalance] = useState(0);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [depositAmount, setDepositAmount] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDirection, setTransferDirection] = useState<"vault_to_drawer" | "drawer_to_vault">("vault_to_drawer");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!millId || !activeSeason) return;
    const [vaultRes, partnersRes] = await Promise.all([
      supabase.from("cash_vaults" as any).select("balance").eq("mill_id", millId).eq("season_id", activeSeason.id).maybeSingle(),
      supabase.from("partners" as any).select("id,name").eq("mill_id", millId).eq("active", true).order("name"),
    ]);
    setVaultBalance(Number((vaultRes.data as any)?.balance || 0));
    setPartners((partnersRes.data || []) as Partner[]);
  }, [activeSeason, millId]);

  useEffect(() => { refresh(); }, [refresh]);

  const deposit = async () => {
    const amount = Number(depositAmount);
    if (!activeSeason || amount <= 0) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("record_vault_deposit_command" as any, {
      p_season_id: activeSeason.id,
      p_amount: amount,
      p_partner_id: partnerId || null,
      p_partner_name: null,
      p_notes: "إيداع نقدي للخزنة",
      p_idempotency_key: crypto.randomUUID(),
    });
    setSubmitting(false);
    if (error) return toast({ title: "تعذر تسجيل الإيداع", description: error.message, variant: "destructive" });
    setDepositAmount(""); setPartnerId(""); await refresh();
    toast({ title: "تم إيداع المبلغ في الخزنة" });
  };

  const transfer = async () => {
    const amount = Number(transferAmount);
    if (!activeSeason || amount <= 0) return;
    if (!isOpen) return toast({ title: "الجارور مغلق", description: "افتح جلسة جارور أولًا لإجراء تحويل نقدي.", variant: "destructive" });
    setSubmitting(true);
    const { error } = await supabase.rpc("transfer_cash_between_vault_and_drawer_command" as any, {
      p_season_id: activeSeason.id,
      p_direction: transferDirection,
      p_amount: amount,
      p_notes: null,
      p_idempotency_key: crypto.randomUUID(),
    });
    setSubmitting(false);
    if (error) return toast({ title: "تعذر تحويل النقد", description: error.message, variant: "destructive" });
    setTransferAmount(""); await Promise.all([refresh(), refreshSession()]);
    toast({ title: "تم تحويل النقد بين الخزنة والجارور" });
  };

  return <div className="space-y-6" dir="rtl">
    <div><h1 className="text-3xl font-bold">الإجراءات والخزنة</h1><p className="text-muted-foreground mt-1">الخزنة مستقلة عن جلسة الكاشير؛ التحويل بينهما فقط هو الذي يغيّر رصيد الجارور.</p></div>
    <Card><CardHeader><CardTitle>إجراءات الإدارة</CardTitle><CardDescription>هذه الإجراءات تخص الخزنة ولا تحتاج جلسة جارور.</CardDescription></CardHeader><CardContent><Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/expenses?cash=vault")}><Wallet className="h-4 w-4" />تسجيل مصروف من الخزنة</Button></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-emerald-200"><CardHeader className="pb-2"><CardDescription>رصيد الخزنة العام</CardDescription><CardTitle className="flex gap-2 text-3xl"><Landmark className="h-7 w-7 text-emerald-700" />{vaultBalance.toLocaleString()} ₪</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">لا يحتاج فتح جارور.</CardContent></Card>
      <Card className="border-blue-200"><CardHeader className="pb-2"><CardDescription>رصيد الجارور الحالي</CardDescription><CardTitle className="flex gap-2 text-3xl"><Wallet className="h-7 w-7 text-blue-700" />{isOpen ? Number(session?.expected_balance || 0).toLocaleString() : "مغلق"}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">يُطابق عند إغلاق جلسة الجارور فقط.</CardContent></Card>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>إيداع نقدي للخزنة</CardTitle><CardDescription>الرصيد الافتتاحي وأموال الشركاء تدخل الخزنة أولًا.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label>المبلغ</Label><Input type="number" min="0" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /></div><div><Label>الشريك (اختياري)</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">إيداع عام للمعصرة</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><Button onClick={deposit} disabled={submitting || !activeSeason}>تسجيل الإيداع</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>تحويل نقدي</CardTitle><CardDescription>لا يمكن التحويل إلا حين تكون جلسة الجارور مفتوحة.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label>اتجاه التحويل</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={transferDirection} onChange={e => setTransferDirection(e.target.value as any)}><option value="vault_to_drawer">من الخزنة إلى الجارور</option><option value="drawer_to_vault">من الجارور إلى الخزنة</option></select></div><div><Label>المبلغ</Label><Input type="number" min="0" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} /></div><Button className="gap-2" onClick={transfer} disabled={submitting || !activeSeason || !isOpen}><ArrowLeftRight className="h-4 w-4" />تنفيذ التحويل</Button></CardContent></Card>
    </div>
  </div>;
}
