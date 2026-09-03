import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Mail, Lock, User, Phone, Building2, Sprout, MapPin, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AuthView } from "@/pages/Auth";

interface RegisterFormProps {
  loading: boolean;
  onSubmit: (data: {
    millName: string;
    ownerName: string;
    phone: string;
    secondaryPhone?: string;
    country: string;
    millLocation: string;
    email: string;
    password: string;
  }) => void;
  onNavigate: (view: AuthView) => void;
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

const RegisterForm = ({ loading, onSubmit, onNavigate }: RegisterFormProps) => {
  const [millName, setMillName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [country, setCountry] = useState("فلسطين");
  const [millLocation, setMillLocation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!millName.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم المعصرة", variant: "destructive" });
      return;
    }
    if (!millLocation.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال موقع/مدينة المعصرة", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "خطأ", description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "خطأ", description: "كلمتا المرور غير متطابقتين", variant: "destructive" });
      return;
    }
    onSubmit({ 
      millName: millName.trim(), 
      ownerName: ownerName.trim(), 
      phone: phone.trim(), 
      secondaryPhone: secondaryPhone.trim() || undefined,
      country,
      millLocation: millLocation.trim(),
      email: email.trim(), 
      password 
    });
  };

  return (
    <div>
      <div className="lg:hidden text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-9 h-9 olive-gradient rounded-lg flex items-center justify-center">
            <Sprout className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">المعصرة الذكية</h1>
        </div>
        <p className="text-sm text-muted-foreground">نظام إدارة المعاصر</p>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-1">إنشاء حساب جديد</h2>
        <p className="text-muted-foreground text-sm">سجّل معصرتك وابدأ الإدارة الذكية المتطورة</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Mill Name & Owner Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mill-name" className="text-xs font-semibold">اسم المعصرة *</Label>
            <div className="relative">
              <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                id="mill-name" 
                value={millName} 
                onChange={(e) => setMillName(e.target.value)} 
                placeholder="مثال: معصرة النور الحديثة" 
                className="pr-10 h-10 text-sm" 
                required 
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-name" className="text-xs font-semibold">اسم المالك / المدير *</Label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                id="owner-name" 
                value={ownerName} 
                onChange={(e) => setOwnerName(e.target.value)} 
                placeholder="الاسم الكامل" 
                className="pr-10 h-10 text-sm" 
                required 
              />
            </div>
          </div>
        </div>

        {/* Country & Mill Location */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">الدولة *</Label>
            <div className="relative">
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="اختر الدولة" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mill-location" className="text-xs font-semibold">موقع / مدينة المعصرة *</Label>
            <div className="relative">
              <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                id="mill-location" 
                value={millLocation} 
                onChange={(e) => setMillLocation(e.target.value)} 
                placeholder="مثال: جنين - كفر راعي" 
                className="pr-10 h-10 text-sm" 
                required 
              />
            </div>
          </div>
        </div>

        {/* Primary & Secondary Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs font-semibold">رقم الهاتف الأساسي *</Label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                id="phone" 
                type="tel" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                placeholder="059XXXXXXX" 
                className="pr-10 h-10 text-sm" 
                required 
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secondary-phone" className="text-xs font-semibold text-muted-foreground">رقم هاتف إضافي (اختياري)</Label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                id="secondary-phone" 
                type="tel" 
                value={secondaryPhone} 
                onChange={(e) => setSecondaryPhone(e.target.value)} 
                placeholder="رقم آخر أو هاتف أرضي" 
                className="pr-10 h-10 text-sm" 
              />
            </div>
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="reg-email" className="text-xs font-semibold">البريد الإلكتروني *</Label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              id="reg-email" 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="name@example.com" 
              className="pr-10 h-10 text-sm" 
              required 
            />
          </div>
        </div>

        {/* Password & Confirm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reg-password" className="text-xs font-semibold">كلمة المرور *</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                id="reg-password" 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="6 أحرف على الأقل" 
                className="pr-10 h-10 text-sm" 
                required 
                minLength={6} 
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-xs font-semibold">تأكيد كلمة المرور *</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                id="confirm-password" 
                type="password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                placeholder="أعد إدخال كلمة المرور" 
                className="pr-10 h-10 text-sm" 
                required 
                minLength={6} 
              />
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full h-11 text-base mt-2" disabled={loading}>
          <UserPlus className="h-4 w-4 me-2" />
          {loading ? "جارٍ إنشاء حساب المعصرة..." : "تسجيل المعصرة"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-5">
        لديك حساب بالفعل؟{" "}
        <button onClick={() => onNavigate("login")} className="text-primary font-semibold hover:underline">
          تسجيل الدخول
        </button>
      </p>
    </div>
  );
};

export default RegisterForm;
