import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, TrendingUp, TrendingDown, Package, DollarSign, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  price: number;
  total_price: number;
  party_name: string | null;
  notes: string | null;
  created_at: string;
}

const OilTrading = () => {
  const { user } = useAuth();
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const { inventory, updateInventory, refetch: refetchInventory } = useInventory();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTransaction, setNewTransaction] = useState({
    type: 'buy' as 'buy' | 'sell', amount: "", price: "", partyName: "", notes: ""
  });

  useEffect(() => {
    if (user) fetchTransactions();
  }, [user]);

  const fetchTransactions = async () => {
    const { data } = await supabase.from("oil_transactions").select("*").eq("user_id", user!.id).eq("season_id", activeSeason!.id).order("created_at", { ascending: false });
    setTransactions(data as Transaction[] || []);
    setLoading(false);
  };

  const addTransaction = async () => {
    if (!newTransaction.amount || !newTransaction.price) {
      toast({ title: "خطأ", description: "يرجى إدخال الكمية والسعر", variant: "destructive" });
      return;
    }

    const amount = parseFloat(newTransaction.amount);
    const price = parseFloat(newTransaction.price);
    const totalPrice = amount * price;

    if (newTransaction.type === 'sell' && amount > inventory.total_oil) {
      toast({ title: "خطأ", description: `الكمية المتوفرة: ${inventory.total_oil} كغم فقط`, variant: "destructive" });
      return;
    }
    if (newTransaction.type === 'buy' && totalPrice > inventory.total_cash) {
      toast({ title: "خطأ", description: `الكاش المتوفر: ${inventory.total_cash} شيكل فقط`, variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("oil_transactions").insert({
      user_id: user!.id, season_id: activeSeason!.id, type: newTransaction.type, amount, price, total_price: totalPrice,
      party_name: newTransaction.partyName || null, notes: newTransaction.notes || null
    });

    if (!error) {
      await updateInventory({
        total_oil: newTransaction.type === 'buy' ? inventory.total_oil + amount : inventory.total_oil - amount,
        total_cash: newTransaction.type === 'buy' ? inventory.total_cash - totalPrice : inventory.total_cash + totalPrice
      });
      setNewTransaction({ type: 'buy', amount: "", price: "", partyName: "", notes: "" });
      toast({ title: "تمت العملية", description: `تم تسجيل عملية ${newTransaction.type === 'buy' ? 'الشراء' : 'البيع'} بنجاح` });
      fetchTransactions();
      refetchInventory();
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">بيع وشراء الزيت</h1>
      </div>

      






















      

      <Tabs defaultValue="add-transaction" className="w-full" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="add-transaction">إضافة عملية</TabsTrigger>
          <TabsTrigger value="history">سجل العمليات</TabsTrigger>
        </TabsList>

        <TabsContent value="add-transaction">
          <Card>
            <CardHeader>
              <CardTitle>إضافة عملية بيع أو شراء</CardTitle>
              <CardDescription>سجل عملية شراء أو بيع زيت جديدة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>نوع العملية</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="txType" value="buy" checked={newTransaction.type === 'buy'} onChange={() => setNewTransaction((p) => ({ ...p, type: 'buy' }))} />
                    شراء زيت
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="txType" value="sell" checked={newTransaction.type === 'sell'} onChange={() => setNewTransaction((p) => ({ ...p, type: 'sell' }))} />
                    بيع زيت
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>الكمية (كغم)</Label>
                  <Input type="number" value={newTransaction.amount} onChange={(e) => setNewTransaction((p) => ({ ...p, amount: e.target.value }))} placeholder="الكمية" min="0" step="0.1" />
                </div>
                <div>
                  <Label>السعر (شيكل/كغم)</Label>
                  <Input type="number" value={newTransaction.price} onChange={(e) => setNewTransaction((p) => ({ ...p, price: e.target.value }))} placeholder="السعر" min="0" step="0.1" />
                </div>
              </div>
              {newTransaction.amount && newTransaction.price &&
              <div className="p-4 bg-accent/50 rounded-lg">
                  <p className="text-lg font-semibold">الإجمالي: {(parseFloat(newTransaction.amount) * parseFloat(newTransaction.price)).toFixed(2)} شيكل</p>
                </div>
              }
              <div>
                <Label>{newTransaction.type === 'buy' ? 'اسم المورد' : 'اسم المشتري'} (اختياري)</Label>
                <Input value={newTransaction.partyName} onChange={(e) => setNewTransaction((p) => ({ ...p, partyName: e.target.value }))} placeholder={newTransaction.type === 'buy' ? 'اسم المورد' : 'اسم المشتري'} />
              </div>
              <div>
                <Label>ملاحظات (اختياري)</Label>
                <Input value={newTransaction.notes} onChange={(e) => setNewTransaction((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات إضافية" />
              </div>
              <Button onClick={addTransaction} className="w-full">
                {newTransaction.type === 'buy' ? <TrendingDown className="h-4 w-4 me-2" /> : <TrendingUp className="h-4 w-4 me-2" />}
                تسجيل العملية
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>سجل عمليات البيع والشراء</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ?
              <div className="text-center py-12 text-muted-foreground">
                  <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">لا توجد عمليات مسجلة</p>
                </div> :

              <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                      <TableHead className="text-right">السعر</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-right">الطرف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) =>
                  <TableRow key={tx.id}>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(tx.created_at).toLocaleDateString('ar-SA')}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={tx.type === 'buy' ? 'secondary' : 'default'}>
                            {tx.type === 'buy' ? '📥 شراء' : '📤 بيع'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{tx.amount} كغم</TableCell>
                        <TableCell className="text-right">{tx.price} ش/كغم</TableCell>
                        <TableCell className="text-right font-semibold">{tx.total_price} ش</TableCell>
                        <TableCell className="text-right">{tx.party_name || '-'}</TableCell>
                      </TableRow>
                  )}
                  </TableBody>
                </Table>
              }
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>);

};

export default OilTrading;