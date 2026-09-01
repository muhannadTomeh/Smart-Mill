import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Mail, ArrowRight, Sprout } from "lucide-react";
import type { AuthView } from "@/pages/Auth";

interface ForgotPasswordFormProps {
  loading: boolean;
  onSubmit: (email: string) => void;
  onNavigate: (view: AuthView) => void;
}

const ForgotPasswordForm = ({ loading, onSubmit, onNavigate }: ForgotPasswordFormProps) => {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(email);
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

      <button
        onClick={() => onNavigate("login")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
      >
        <ArrowRight className="h-4 w-4" />
        العودة لتسجيل الدخول
      </button>

      <div className="mb-8">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <KeyRound className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-1">نسيت كلمة المرور؟</h2>
        <p className="text-muted-foreground">أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="reset-email">البريد الإلكتروني</Label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="pr-10 h-12"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
          {loading ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-8">
        تذكرت كلمة المرور؟{" "}
        <button onClick={() => onNavigate("login")} className="text-primary font-semibold hover:underline">
          تسجيل الدخول
        </button>
      </p>
    </div>
  );
};

export default ForgotPasswordForm;
