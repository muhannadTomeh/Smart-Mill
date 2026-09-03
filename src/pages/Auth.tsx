import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import AuthBranding from "@/components/auth/AuthBranding";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { lookupCashierEmail } from "@/lib/authUtils";

export type AuthView = "login" | "register" | "forgot-password";

const Auth = () => {
  const [view, setView] = useState<AuthView | "employee">("login");
  const [employeePin, setEmployeePin] = useState("");
  const [isVerifyingEmployee, setIsVerifyingEmployee] = useState(false);
  const [searchParams] = useSearchParams();
  const employeeOwnerId = searchParams.get("employee");

  useState(() => {
    if (employeeOwnerId) {
      setView("employee");
    }
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Only same-origin relative paths are accepted as a post-login destination.
  const rawNext = params.get("next") ?? "";
  const nextPath = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "";
  const returnUrl = nextPath ? `${window.location.origin}${nextPath}` : window.location.origin;

  const handleLogin = async (usernameOrEmail: string, password: string) => {
    localStorage.removeItem('employee_owner_id');
    setLoading(true);

    let emailToUse: string;

    // If the input contains @ it's a real email (mill owner) — use directly
    if (usernameOrEmail.trim().includes("@")) {
      emailToUse = usernameOrEmail.trim().toLowerCase();
    } else {
      // Plain username → look up via RPC to find correct mill
      const result = await lookupCashierEmail(supabase, usernameOrEmail.trim());

      if ("ambiguous" in result) {
        setLoading(false);
        toast({
          title: "يوجد أكثر من حساب بهذا الاسم",
          description: "يرجى التواصل مع مسؤول النظام لتوضيح رمز المعصرة الخاص بك.",
          variant: "destructive",
        });
        return;
      }

      if ("notFound" in result) {
        // Fallback: try standard pattern before giving up
        emailToUse = `${usernameOrEmail.trim().toLowerCase()}@smartmill.com`;
      } else {
        emailToUse = result.email;
      }
    }

    let { data, error } = await supabase.auth.signInWithPassword({ email: emailToUse, password });

    // If first attempt failed and we used @smartmill.com, try with legacy @mill.local
    if (error && emailToUse.endsWith("@smartmill.com")) {
      const legacyEmail = emailToUse.replace("@smartmill.com", "@mill.local");
      const retry = await supabase.auth.signInWithPassword({ email: legacyEmail, password });
      if (!retry.error) {
        data = retry.data;
        error = null;
      }
    }

    setLoading(false);
    if (error) {
      toast({ title: "خطأ في تسجيل الدخول", description: "اسم المستخدم أو كلمة المرور غير صحيحة", variant: "destructive" });
    } else {
      toast({ title: "تم تسجيل الدخول بنجاح" });
      if (nextPath) {
        window.location.href = nextPath;
      } else if (data?.user) {
        const { data: isAdminRole } = await supabase.rpc('has_role', {
          _user_id: data.user.id,
          _role: 'platform_admin'
        });
        if (isAdminRole) {
          navigate("/admin");
        } else {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('parent_mill_id')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (profileRow?.parent_mill_id) {
            navigate("/queue");
          } else {
            navigate("/seasons");
          }
        }
      } else {
        navigate("/seasons");
      }
    }
  };


  const handleRegister = async (data: {
    millName: string;
    ownerName: string;
    phone: string;
    secondaryPhone?: string;
    country: string;
    millLocation: string;
    email: string;
    password: string;
  }) => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          display_name: data.ownerName,
          mill_name: data.millName,
          phone: data.phone,
          secondary_phone: data.secondaryPhone,
          country: data.country,
          mill_location: data.millLocation,
        },
        emailRedirectTo: returnUrl,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "خطأ في إنشاء الحساب", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "تم إنشاء الحساب بنجاح",
        description: "تحقق من بريدك الإلكتروني لتأكيد الحساب",
      });
      setView("login");
    }
  };

  const handleForgotPassword = async (email: string) => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الإرسال", description: "تحقق من بريدك الإلكتروني لإعادة تعيين كلمة المرور" });
    }
  };

  const handleEmployeeLogin = async () => {
    if (!employeeOwnerId || !employeePin) return;
    setIsVerifyingEmployee(true);
    try {
      const { data, error } = await supabase.rpc("verify_employee_pin" as any, {
        owner_id: employeeOwnerId,
        input_pin: employeePin
      });
      
      if (error) throw error;
      
      if (data) {
        localStorage.setItem('employee_owner_id', employeeOwnerId);
        toast({ title: "تم تسجيل الدخول", description: "مرحباً بك في وضع الموظف" });
        window.location.href = "/queue";
      } else {
        toast({ title: "خطأ", description: "رمز الدخول غير صحيح", variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "خطأ", description: "فشل التحقق من الرمز", variant: "destructive" });
    } finally {
      setIsVerifyingEmployee(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" dir="rtl">
      {/* Branding Panel */}
      <AuthBranding />

      {/* Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-md">
          {view === "login" && (
            <LoginForm loading={loading} onSubmit={handleLogin} onNavigate={setView} />
          )}
          {view === "register" && (
            <RegisterForm loading={loading} onSubmit={handleRegister} onNavigate={setView} />
          )}
          {view === "forgot-password" && (
            <ForgotPasswordForm loading={loading} onSubmit={handleForgotPassword} onNavigate={setView} />
          )}
          {view === "employee" && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">دخول الموظف</h2>
                <p className="text-muted-foreground">أدخل الرمز المكون من 4 أرقام للمتابعة</p>
              </div>
              <div className="space-y-4">
                <div className="flex justify-center">
                  <input
                    type="password"
                    maxLength={6}
                    value={employeePin}
                    onChange={(e) => setEmployeePin(e.target.value.replace(/\D/g, ""))}
                    className="w-48 h-14 text-center text-3xl tracking-[1em] font-bold border-2 border-primary/20 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                    autoFocus
                  />
                </div>
                <Button 
                  onClick={handleEmployeeLogin} 
                  disabled={isVerifyingEmployee || employeePin.length < 4} 
                  className="w-full h-12 text-lg"
                >
                  {isVerifyingEmployee ? "جارٍ التحقق..." : "تسجيل الدخول"}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => setView("login")} 
                  className="w-full"
                >
                  الرجوع لتسجيل دخول المالك
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
