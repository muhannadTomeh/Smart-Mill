import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, User, Phone, Building2, Sprout } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AuthView } from "@/pages/Auth";

interface RegisterFormProps {
  loading: boolean;
  onSubmit: (data: {
    millName: string;
    ownerName: string;
    phone: string;
    email: string;
    password: string;
  }) => void;
  onNavigate: (view: AuthView) => void;
}

const RegisterForm = ({ loading, onSubmit, onNavigate }: RegisterFormProps) => {
  const [millName, setMillName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "خطأ", description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "خطأ", description: "كلمتا المرور غير متطابقتين", variant: "destructive" });
      return;
    }
    onSubmit({ millName, ownerName, phone, email, password });
  };

  return (
    <div>
      <div className="lg:hidden text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-9 h-9 olive-gradient rounded-lg flex items-center justify-center">
            <Sprout className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">المعصرة الذكية</h1>
        </div>
        <p className="text-sm text-muted-foreground">نظام إدارة المعاصر</p>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-1">إنشاء حساب جديد</h2>
        <p className="text-muted-foreground">سجّل معصرتك وابدأ الإدارة الذكية</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="mill-name">اسم المعصرة</Label>
            <div className="relative">
              <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="mill-name" value={millName} onChange={(e) => setMillName(e.target.value)} placeholder="معصرة الزيتون" className="pr-10 h-11" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-name">اسم المالك</Label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="الاسم الكامل" className="pr-10 h-11" required />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">رقم الهاتف</Label>
          <div className="relative">
            <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" className="pr-10 h-11" required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reg-email">البريد الإلكتروني</Label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="pr-10 h-11" required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="reg-password">كلمة المرور</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 أحرف على الأقل" className="pr-10 h-11" required minLength={6} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="أعد الإدخال" className="pr-10 h-11" required minLength={6} />
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
          <UserPlus className="h-4 w-4 me-2" />
          {loading ? "جارٍ إنشاء الحساب..." : "إنشاء حساب"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        لديك حساب بالفعل؟{" "}
        <button onClick={() => onNavigate("login")} className="text-primary font-semibold hover:underline">
          تسجيل الدخول
        </button>
      </p>
    </div>
  );
};

export default RegisterForm;
