import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LogIn, User, Lock, Sprout } from "lucide-react";
import type { AuthView } from "@/pages/Auth";

interface LoginFormProps {
  loading: boolean;
  onSubmit: (emailOrUsername: string, password: string) => void;
  onNavigate: (view: AuthView) => void;
}

const LoginForm = ({ loading, onSubmit, onNavigate }: LoginFormProps) => {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(usernameOrEmail, password);
  };

  return (
    <div>
      {/* Mobile branding */}
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
        <h2 className="text-2xl font-bold text-foreground mb-1">تسجيل الدخول</h2>
        <p className="text-muted-foreground">أدخل اسم المستخدم أو البريد وكلمة المرور للبدء</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="login-username">اسم المستخدم أو البريد</Label>
          <div className="relative">
            <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="login-username"
              type="text"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              placeholder="مثال: ahmed أو cashier1"
              className="pr-10 h-12"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-password">كلمة المرور</Label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="أدخل كلمة المرور"
              className="pr-10 h-12"
              required
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id="remember" defaultChecked />
            <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">تذكرني</Label>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("forgot-password")}
            className="text-sm text-primary hover:underline font-medium"
          >
            نسيت كلمة المرور؟
          </button>
        </div>

        <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
          <LogIn className="h-4 w-4 me-2" />
          {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        </Button>
      </form>
    </div>
  );
};

export default LoginForm;
