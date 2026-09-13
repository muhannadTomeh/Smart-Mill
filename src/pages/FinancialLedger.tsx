import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, BookOpen, RefreshCw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCashSession } from "@/contexts/CashSessionContext";
import { useSeason } from "@/contexts/SeasonContext";
import { supabase } from "@/integrations/supabase/client";

type LedgerEvent = {
  id: string;
  operation_id: string;
  amount: number;
  direction: "in" | "out" | "none";
  type: string;
  category: string;
  description: string | null;
  party_name: string | null;
  payment_method: string;
  status: "active" | "voided";
  created_at: string;
  reversal_of: string | null;
  reversal_reason: string | null;
  cash_session_id: string | null;
  reference_type: string;
  reference_id: string | null;
  effect_status: "effective" | "reversed" | "reversal" | "legacy_voided";
  signed_amount: number;
};

const money = new Intl.NumberFormat("ar-PS", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("ar-PS", { dateStyle: "medium", timeStyle: "short" });

export default function FinancialLedger() {
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const { session, isOpen } = useCashSession();
  const { toast } = useToast();
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");

  const load = useCallback(async () => {
    if (!millId || !activeSeason) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_effective_events")
      .select("id, operation_id, amount, signed_amount, direction, type, category, description, party_name, payment_method, status, effect_status, created_at, reversal_of, reversal_reason, cash_session_id, reference_type, reference_id")
      .eq("mill_id", millId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: "تعذر تحميل الدفتر المالي", description: error.message, variant: "destructive" });
    } else {
      setEvents((data ?? []) as LedgerEvent[]);
    }
    setLoading(false);
  }, [activeSeason, millId, toast]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => events.filter((event) => {
    const text = `${event.description ?? ""} ${event.party_name ?? ""} ${event.category ?? ""}`.toLowerCase();
    return (direction === "all" || event.direction === direction) && text.includes(search.toLowerCase());
  }), [direction, events, search]);

  const totals = useMemo(() => events.filter((event) => event.status === "active").reduce((value, event) => ({
    incoming: value.incoming + (event.direction === "in" ? Number(event.amount) : 0),
    outgoing: value.outgoing + (event.direction === "out" ? Number(event.amount) : 0),
    net: value.net + Number(event.signed_amount),
  }), { incoming: 0, outgoing: 0, net: 0 }), [events]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6 text-primary" /> الدفتر المالي</h1>
          <p className="text-sm text-muted-foreground mt-1">سجل قابل للمراجعة لكل حركة نقدية وقيد عكسي في الموسم الحالي.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>إجمالي الداخل</CardDescription><CardTitle className="text-2xl text-emerald-600">{money.format(totals.incoming)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>إجمالي الخارج</CardDescription><CardTitle className="text-2xl text-rose-600">{money.format(totals.outgoing)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>الصافي بعد القيود العكسية</CardDescription><CardTitle className="text-2xl">{money.format(totals.net)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>حالة الصندوق</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><Wallet className="h-5 w-5 text-primary" /> {isOpen ? "صندوق مفتوح" : "الصندوق مغلق"}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{session ? `الرصيد الافتتاحي: ${money.format(Number(session.opening_balance))}` : "لا توجد جلسة نقدية مفتوحة"}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>حركات الموسم</CardTitle><CardDescription>الدفتر للعرض والتدقيق فقط. يُلغى المستند من شاشة المصروف أو الفاتورة أو العملية الأصلية كي تُعكس جميع آثاره معًا.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالوصف أو الطرف أو التصنيف" className="sm:max-w-md" />
            <div className="flex gap-2">
              {(["all", "in", "out"] as const).map((value) => <Button key={value} size="sm" variant={direction === value ? "default" : "outline"} onClick={() => setDirection(value)}>{value === "all" ? "الكل" : value === "in" ? "داخل" : "خارج"}</Button>)}
            </div>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>الوصف</TableHead><TableHead>النوع</TableHead><TableHead>الدفع</TableHead><TableHead>المبلغ</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">جارٍ تحميل الحركات…</TableCell></TableRow> : visible.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">لا توجد حركات مطابقة.</TableCell></TableRow> : visible.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-xs">{dateTime.format(new Date(event.created_at))}</TableCell>
                    <TableCell><p className="font-medium">{event.description || event.category}</p>{event.party_name && <p className="text-xs text-muted-foreground">{event.party_name}</p>}</TableCell>
                    <TableCell className="text-sm">{event.type}</TableCell>
                    <TableCell className="text-sm">{event.payment_method === "cash" ? "نقدي" : event.payment_method}</TableCell>
                    <TableCell className={`font-semibold whitespace-nowrap ${event.direction === "in" ? "text-emerald-600" : event.direction === "out" ? "text-rose-600" : ""}`}>{event.direction === "in" ? <ArrowDownLeft className="inline h-4 w-4 ms-1" /> : event.direction === "out" ? <ArrowUpRight className="inline h-4 w-4 ms-1" /> : null}{money.format(Number(event.amount))}</TableCell>
                    <TableCell>{event.effect_status === "reversal" ? <Badge variant="secondary">قيد عكسي</Badge> : event.effect_status === "reversed" ? <Badge variant="outline">معكوسة</Badge> : event.effect_status === "legacy_voided" ? <Badge variant="secondary">ملغاة قديمًا</Badge> : <Badge className="bg-emerald-600">فعّالة</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
