import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCheck, Plus, DollarSign, Pencil, ClipboardList, Search, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";

interface Worker {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  hourly_rate: number | null;
  shift_rate: number | null;
  total_earned: number;
  total_paid: number;
}

interface WorkRecord {
  id: string;
  worker_id: string;
  hours: number | null;
  shifts: number | null;
  amount: number;
  notes: string | null;
  created_at: string;
}

interface WorkerPayment {
  id: string;
  worker_id: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

const Workers = () => {
  const { user } = useAuth();
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const { inventory, updateInventory } = useInventory();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workRecords, setWorkRecords] = useState<WorkRecord[]>([]);
  const [payments, setPayments] = useState<WorkerPayment[]>([]);
  const [loading, setLoading] = useState(true);

  // Add worker dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newWorker, setNewWorker] = useState({ name: "", type: 'hourly' as 'hourly' | 'shift', rate: "", phone: "" });

  // Edit worker dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editWorker, setEditWorker] = useState({ name: "", type: 'hourly' as 'hourly' | 'shift', rate: "", phone: "" });

  // Pay worker dialog (from workers list)
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingWorker, setPayingWorker] = useState<Worker | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");

  // Pay from payments tab dialog
  const [payFromListOpen, setPayFromListOpen] = useState(false);
  const [payFromListWorker, setPayFromListWorker] = useState<Worker | null>(null);
  const [payFromListAmount, setPayFromListAmount] = useState("");
  const [payFromListNotes, setPayFromListNotes] = useState("");

  // Work session state
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [workValue, setWorkValue] = useState("");
  const [workNotes, setWorkNotes] = useState("");

  // Session filters
  const [filterWorker, setFilterWorker] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterToday, setFilterToday] = useState(false);

  // Payment filters
  const [payFilterWorker, setPayFilterWorker] = useState("");
  const [payFilterDate, setPayFilterDate] = useState("");
  const [payFilterToday, setPayFilterToday] = useState(false);

  useEffect(() => {
    if (user) { fetchWorkers(); fetchRecords(); fetchPayments(); }
  }, [user]);

  const fetchWorkers = async () => {
    const { data } = await supabase.from("workers").select("*").eq("user_id", user!.id).eq("season_id", activeSeason!.id).order("created_at", { ascending: false });
    setWorkers((data as Worker[]) || []);
    setLoading(false);
  };

  const fetchRecords = async () => {
    const { data } = await supabase.from("work_records").select("*").eq("user_id", user!.id).eq("season_id", activeSeason!.id).order("created_at", { ascending: false });
    setWorkRecords((data as WorkRecord[]) || []);
  };

  const fetchPayments = async () => {
    const { data } = await supabase.from("worker_payments").select("*").eq("user_id", user!.id).eq("season_id", activeSeason!.id).order("created_at", { ascending: false });
    setPayments((data as WorkerPayment[]) || []);
  };

  const addWorker = async () => {
    if (!newWorker.name || !newWorker.rate) {
      toast({ title: "خطأ", description: "يرجى إدخال الاسم والسعر", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("workers").insert({
      user_id: user!.id,
      season_id: activeSeason!.id,
      name: newWorker.name,
      type: newWorker.type,
      phone: newWorker.phone || null,
      hourly_rate: newWorker.type === 'hourly' ? parseFloat(newWorker.rate) : null,
      shift_rate: newWorker.type === 'shift' ? parseFloat(newWorker.rate) : null,
    });
    if (!error) {
      setNewWorker({ name: "", type: 'hourly', rate: "", phone: "" });
      setAddDialogOpen(false);
      toast({ title: "تمت الإضافة", description: `تم إضافة العامل ${newWorker.name}` });
      fetchWorkers();
    }
  };

  const updateWorkerDetails = async () => {
    if (!editingWorker || !editWorker.name || !editWorker.rate) {
      toast({ title: "خطأ", description: "يرجى إدخال جميع البيانات", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("workers").update({
      name: editWorker.name,
      type: editWorker.type,
      phone: editWorker.phone || null,
      hourly_rate: editWorker.type === 'hourly' ? parseFloat(editWorker.rate) : null,
      shift_rate: editWorker.type === 'shift' ? parseFloat(editWorker.rate) : null,
    }).eq("id", editingWorker.id);
    if (!error) {
      setEditDialogOpen(false);
      setEditingWorker(null);
      toast({ title: "تم التحديث", description: "تم تحديث بيانات العامل" });
      fetchWorkers();
    }
  };

  const payWorker = async (worker: Worker, amount: number, notes: string, onDone: () => void) => {
    if (amount <= 0) return;
    
    const { error } = await (supabase.rpc as any)("pay_worker_and_settle", {
      p_user_id: user!.id,
      p_season_id: activeSeason!.id,
      p_worker_id: worker.id,
      p_amount: amount,
      p_notes: notes.trim() || null
    });

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الدفع", description: `تم دفع ${amount} شيكل للعامل ${worker.name}` });
      fetchWorkers();
      fetchPayments();
      onDone();
    }
  };

  const registerWork = async () => {
    if (!selectedWorkerId || !workValue || parseFloat(workValue) <= 0) {
      toast({ title: "خطأ", description: "يرجى اختيار العامل وإدخال القيمة", variant: "destructive" });
      return;
    }
    const worker = workers.find(w => w.id === selectedWorkerId);
    if (!worker) return;
    const val = parseFloat(workValue);

    const { error } = await (supabase.rpc as any)("register_worker_session", {
      p_user_id: user!.id,
      p_season_id: activeSeason!.id,
      p_worker_id: selectedWorkerId,
      p_val: val,
      p_notes: workNotes.trim() || null
    });

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم التسجيل", description: `تم تسجيل ${val} ${worker.type === 'hourly' ? 'ساعة' : 'شفت'} للعامل ${worker.name}` });
      setWorkValue("");
      setWorkNotes("");
      fetchWorkers();
      fetchRecords();
    }
  };

  const startEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setEditWorker({
      name: worker.name,
      type: worker.type as 'hourly' | 'shift',
      rate: String(worker.type === 'hourly' ? worker.hourly_rate || 0 : worker.shift_rate || 0),
      phone: worker.phone || "",
    });
    setEditDialogOpen(true);
  };

  const startPay = (worker: Worker) => {
    setPayingWorker(worker);
    setPayAmount("");
    setPayNotes("");
    setPayDialogOpen(true);
  };

  const startPayFromList = (worker: Worker) => {
    setPayFromListWorker(worker);
    setPayFromListAmount("");
    setPayFromListNotes("");
    setPayFromListOpen(true);
  };

  const selectedWorkerForReg = workers.find(w => w.id === selectedWorkerId);

  // Filter sessions
  // Filter payments
  const filteredPayments = payments.filter(p => {
    if (payFilterWorker && p.worker_id !== payFilterWorker) return false;
    if (payFilterToday) {
      const today = new Date().toISOString().split('T')[0];
      const payDate = new Date(p.created_at).toISOString().split('T')[0];
      if (payDate !== today) return false;
    }
    if (payFilterDate) {
      const payDate = new Date(p.created_at).toISOString().split('T')[0];
      if (payDate !== payFilterDate) return false;
    }
    return true;
  });

  const filteredRecords = workRecords.filter(r => {
    if (filterWorker && r.worker_id !== filterWorker) return false;
    if (filterToday) {
      const today = new Date().toISOString().split('T')[0];
      const recordDate = new Date(r.created_at).toISOString().split('T')[0];
      if (recordDate !== today) return false;
    }
    if (filterDate) {
      const recordDate = new Date(r.created_at).toISOString().split('T')[0];
      if (recordDate !== filterDate) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCheck className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">إدارة العمال</h1>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 me-2" />إضافة عامل</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة عامل جديد</DialogTitle>
              <DialogDescription>أدخل بيانات العامل الجديد</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>اسم العامل</Label>
                <Input value={newWorker.name} onChange={e => setNewWorker(p => ({ ...p, name: e.target.value }))} placeholder="اسم العامل" />
              </div>
              <div>
                <Label>رقم الهاتف (اختياري)</Label>
                <Input value={newWorker.phone} onChange={e => setNewWorker(p => ({ ...p, phone: e.target.value }))} placeholder="رقم الهاتف" />
              </div>
              <div>
                <Label>نوع العمل</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="newType" value="hourly" checked={newWorker.type === 'hourly'} onChange={() => setNewWorker(p => ({ ...p, type: 'hourly' }))} />
                    بالساعة
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="newType" value="shift" checked={newWorker.type === 'shift'} onChange={() => setNewWorker(p => ({ ...p, type: 'shift' }))} />
                    بالشفت
                  </label>
                </div>
              </div>
              <div>
                <Label>{newWorker.type === 'hourly' ? 'سعر الساعة (شيكل)' : 'سعر الشفت (شيكل)'}</Label>
                <Input type="number" value={newWorker.rate} onChange={e => setNewWorker(p => ({ ...p, rate: e.target.value }))} placeholder="السعر" min="0" />
              </div>
              <Button onClick={addWorker} className="w-full"><Plus className="h-4 w-4 me-2" />إضافة</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="list" dir="rtl">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="list">قائمة العمال</TabsTrigger>
          <TabsTrigger value="sessions">جلسات العمل</TabsTrigger>
          <TabsTrigger value="payments">سجل المدفوعات</TabsTrigger>
        </TabsList>

        {/* ===== TAB 1: قائمة العمال ===== */}
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>قائمة العمال ({workers.length})</CardTitle>
              <CardDescription>عرض وإدارة جميع العمال</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">جارٍ التحميل...</p>
              ) : workers.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">لا يوجد عمال. أضف عاملاً جديداً.</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الاسم</TableHead>
                        <TableHead className="text-right">نوع العمل</TableHead>
                        <TableHead className="text-right">الهاتف</TableHead>
                        <TableHead className="text-right">وحدات العمل</TableHead>
                        <TableHead className="text-right">سعر الوحدة</TableHead>
                        <TableHead className="text-right">المستحق</TableHead>
                        <TableHead className="text-right">المدفوع</TableHead>
                        <TableHead className="text-right">المتبقي</TableHead>
                        <TableHead className="text-right">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workers.map(worker => {
                        const balance = worker.total_earned - worker.total_paid;
                        const workerRecs = workRecords.filter(r => r.worker_id === worker.id);
                        const totalUnits = workerRecs.reduce((s, r) => s + (r.hours || r.shifts || 0), 0);
                        const rate = worker.type === 'hourly' ? worker.hourly_rate : worker.shift_rate;

                        return (
                          <TableRow key={worker.id}>
                            <TableCell className="text-right font-medium">{worker.name}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={worker.type === 'hourly' ? 'default' : 'secondary'}>
                                {worker.type === 'hourly' ? 'بالساعة' : 'بالشفت'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{worker.phone || '—'}</TableCell>
                            <TableCell className="text-right">{totalUnits}</TableCell>
                            <TableCell className="text-right">{rate || 0} ش</TableCell>
                            <TableCell className="text-right font-medium">{worker.total_earned} ش</TableCell>
                            <TableCell className="text-right">{worker.total_paid} ش</TableCell>
                            <TableCell className={`text-right font-bold ${balance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{balance} ش</TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => startEdit(worker)}>
                                  <Pencil className="h-3 w-3 me-1" />تعديل
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => startPay(worker)} disabled={balance <= 0}>
                                  <DollarSign className="h-3 w-3 me-1" />دفع
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 2: جلسات العمل ===== */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                جلسات العمل
              </CardTitle>
              <CardDescription>تسجيل وعرض جلسات العمل</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {workers.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">لا يوجد عمال. أضف عاملاً أولاً.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>اختر العامل</Label>
                      <select value={selectedWorkerId} onChange={e => { setSelectedWorkerId(e.target.value); setWorkValue(""); }}
                        className="w-full h-10 p-2 border rounded-md bg-background text-foreground mt-1">
                        <option value="">-- اختر عامل --</option>
                        {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    {selectedWorkerForReg && (
                      <>
                        <div>
                          <Label>{selectedWorkerForReg.type === 'hourly' ? 'عدد الساعات' : 'عدد الشفتات'}</Label>
                          <Input type="number" value={workValue} onChange={e => setWorkValue(e.target.value)}
                            placeholder={selectedWorkerForReg.type === 'hourly' ? 'الساعات' : 'الشفتات'} min="0" step="0.5" />
                        </div>
                        <div>
                          <Label>ملاحظات (اختياري)</Label>
                          <Input value={workNotes} onChange={e => setWorkNotes(e.target.value)} placeholder="ملاحظات..." />
                        </div>
                      </>
                    )}
                  </div>

                  {selectedWorkerForReg && workValue && parseFloat(workValue) > 0 && (
                    <div className="p-3 bg-primary/10 rounded-lg text-sm">
                      المبلغ المحسوب: <span className="font-bold text-primary">
                        {(parseFloat(workValue) * (selectedWorkerForReg.type === 'hourly' ? (selectedWorkerForReg.hourly_rate || 0) : (selectedWorkerForReg.shift_rate || 0))).toFixed(2)} ش
                      </span>
                    </div>
                  )}

                  <Button onClick={registerWork} disabled={!selectedWorkerId || !workValue || parseFloat(workValue) <= 0} className="w-full md:w-auto">
                    <ClipboardList className="h-4 w-4 me-2" />تسجيل الجلسة
                  </Button>

                  {/* Filters */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">فلترة السجلات</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button size="sm" variant={filterToday ? "default" : "outline"} onClick={() => { setFilterToday(!filterToday); setFilterDate(""); }}>
                        اليوم
                      </Button>
                      <Input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setFilterToday(false); }}
                        className="w-44 h-9" />
                      <select value={filterWorker} onChange={e => setFilterWorker(e.target.value)}
                        className="h-9 p-1 border rounded-md bg-background text-foreground text-sm min-w-[140px]">
                        <option value="">كل العمال</option>
                        {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      {(filterWorker || filterDate || filterToday) && (
                        <Button size="sm" variant="ghost" onClick={() => { setFilterWorker(""); setFilterDate(""); setFilterToday(false); }}>مسح الفلاتر</Button>
                      )}
                    </div>
                  </div>

                  {/* Session records */}
                  {filteredRecords.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">العامل</TableHead>
                          <TableHead className="text-right">العمل</TableHead>
                          <TableHead className="text-right">المبلغ</TableHead>
                          <TableHead className="text-right">ملاحظات</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.map(record => {
                          const w = workers.find(x => x.id === record.worker_id);
                          return (
                            <TableRow key={record.id}>
                              <TableCell className="text-right font-medium">{w?.name || '—'}</TableCell>
                              <TableCell className="text-right">{record.hours ? `${record.hours} ساعة` : `${record.shifts} شفت`}</TableCell>
                              <TableCell className="text-right">{record.amount} ش</TableCell>
                              <TableCell className="text-right text-muted-foreground text-xs">{record.notes || '—'}</TableCell>
                              <TableCell className="text-right">{new Date(record.created_at).toLocaleDateString('ar-SA')}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center py-4 text-muted-foreground">لا توجد جلسات مطابقة</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 3: سجل المدفوعات ===== */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                سجل المدفوعات
              </CardTitle>
              <CardDescription>ملخص المستحقات والمدفوعات لكل عامل</CardDescription>
            </CardHeader>
           <CardContent className="space-y-6">
              {workers.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">لا يوجد عمال.</p>
              ) : (
                <>
                  {/* Summary table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">اسم العامل</TableHead>
                        <TableHead className="text-right">إجمالي المستحقات</TableHead>
                        <TableHead className="text-right">إجمالي المدفوعات</TableHead>
                        <TableHead className="text-right">المبلغ المتبقي</TableHead>
                        <TableHead className="text-right">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workers.map(worker => {
                        const balance = worker.total_earned - worker.total_paid;
                        return (
                          <TableRow key={worker.id}>
                            <TableCell className="text-right font-medium">{worker.name}</TableCell>
                            <TableCell className="text-right">{worker.total_earned} ش</TableCell>
                            <TableCell className="text-right">{worker.total_paid} ش</TableCell>
                            <TableCell className={`text-right font-bold ${balance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{balance} ش</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" onClick={() => startPayFromList(worker)} disabled={balance <= 0}>
                                <DollarSign className="h-3 w-3 me-1" />إجراء دفعة
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Payment records with filters */}
                  <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold mb-3">سجل الدفعات التفصيلي</h3>
                    <div className="flex items-center gap-2 mb-3">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">فلترة الدفعات</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mb-4">
                      <Button size="sm" variant={payFilterToday ? "default" : "outline"} onClick={() => { setPayFilterToday(!payFilterToday); setPayFilterDate(""); }}>
                        اليوم
                      </Button>
                      <Input type="date" value={payFilterDate} onChange={e => { setPayFilterDate(e.target.value); setPayFilterToday(false); }}
                        className="w-44 h-9" />
                      <select value={payFilterWorker} onChange={e => setPayFilterWorker(e.target.value)}
                        className="h-9 p-1 border rounded-md bg-background text-foreground text-sm min-w-[140px]">
                        <option value="">كل العمال</option>
                        {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      {(payFilterWorker || payFilterDate || payFilterToday) && (
                        <Button size="sm" variant="ghost" onClick={() => { setPayFilterWorker(""); setPayFilterDate(""); setPayFilterToday(false); }}>مسح الفلاتر</Button>
                      )}
                    </div>

                    {filteredPayments.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">العامل</TableHead>
                            <TableHead className="text-right">المبلغ</TableHead>
                            <TableHead className="text-right">ملاحظات</TableHead>
                            <TableHead className="text-right">التاريخ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPayments.map(payment => {
                            const w = workers.find(x => x.id === payment.worker_id);
                            return (
                              <TableRow key={payment.id}>
                                <TableCell className="text-right font-medium">{w?.name || '—'}</TableCell>
                                <TableCell className="text-right">{payment.amount} ش</TableCell>
                                <TableCell className="text-right text-muted-foreground text-xs">{payment.notes || '—'}</TableCell>
                                <TableCell className="text-right">{new Date(payment.created_at).toLocaleDateString('ar-SA')}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center py-4 text-muted-foreground">لا توجد دفعات مطابقة</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== Edit Worker Dialog ===== */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل بيانات العامل</DialogTitle>
            <DialogDescription>قم بتعديل بيانات العامل</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>الاسم</Label>
              <Input value={editWorker.name} onChange={e => setEditWorker(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>رقم الهاتف</Label>
              <Input value={editWorker.phone} onChange={e => setEditWorker(p => ({ ...p, phone: e.target.value }))} placeholder="رقم الهاتف" />
            </div>
            <div>
              <Label>نوع العمل</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="editType" value="hourly" checked={editWorker.type === 'hourly'} onChange={() => setEditWorker(p => ({ ...p, type: 'hourly' }))} />
                  بالساعة
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="editType" value="shift" checked={editWorker.type === 'shift'} onChange={() => setEditWorker(p => ({ ...p, type: 'shift' }))} />
                  بالشفت
                </label>
              </div>
            </div>
            <div>
              <Label>{editWorker.type === 'hourly' ? 'سعر الساعة' : 'سعر الشفت'}</Label>
              <Input type="number" value={editWorker.rate} onChange={e => setEditWorker(p => ({ ...p, rate: e.target.value }))} min="0" />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>إلغاء</Button>
              <Button onClick={updateWorkerDetails}>حفظ التعديلات</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Pay Worker Dialog (from list) ===== */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>دفعة للعامل: {payingWorker?.name}</DialogTitle>
            <DialogDescription>المتبقي: {payingWorker ? (payingWorker.total_earned - payingWorker.total_paid) : 0} ش</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>المبلغ المراد دفعه</Label>
              <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="المبلغ" min="0"
                max={payingWorker ? payingWorker.total_earned - payingWorker.total_paid : 0} />
            </div>
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="ملاحظات..." />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPayDialogOpen(false)}>إلغاء</Button>
              {payingWorker && (
                <Button variant="outline" onClick={() => payWorker(payingWorker, payingWorker.total_earned - payingWorker.total_paid, payNotes, () => { setPayDialogOpen(false); })}
                  disabled={payingWorker.total_earned - payingWorker.total_paid <= 0}>
                  دفع الكل
                </Button>
              )}
              <Button onClick={() => payingWorker && payWorker(payingWorker, parseFloat(payAmount) || 0, payNotes, () => { setPayDialogOpen(false); })}
                disabled={!payAmount || parseFloat(payAmount) <= 0}>
                <DollarSign className="h-4 w-4 me-1" />دفع
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Pay Worker Dialog (from payments tab) ===== */}
      <Dialog open={payFromListOpen} onOpenChange={setPayFromListOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إجراء دفعة: {payFromListWorker?.name}</DialogTitle>
            <DialogDescription>المتبقي: {payFromListWorker ? (payFromListWorker.total_earned - payFromListWorker.total_paid) : 0} ش</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>المبلغ</Label>
              <Input type="number" value={payFromListAmount} onChange={e => setPayFromListAmount(e.target.value)} placeholder="المبلغ" min="0"
                max={payFromListWorker ? payFromListWorker.total_earned - payFromListWorker.total_paid : 0} />
            </div>
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Input value={payFromListNotes} onChange={e => setPayFromListNotes(e.target.value)} placeholder="ملاحظات..." />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPayFromListOpen(false)}>إلغاء</Button>
              <Button onClick={() => payFromListWorker && payWorker(payFromListWorker, parseFloat(payFromListAmount) || 0, payFromListNotes, () => { setPayFromListOpen(false); })}
                disabled={!payFromListAmount || parseFloat(payFromListAmount) <= 0}>
                <DollarSign className="h-4 w-4 me-1" />دفع
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Workers;
