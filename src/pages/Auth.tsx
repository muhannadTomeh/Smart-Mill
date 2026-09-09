import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import AuthBranding from "@/components/auth/AuthBranding";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { lookupCashierEmail } from "@/lib/authUtils";

export type AuthView = "login" | "register" | "forgot-password";

const Auth = () => {
  const [view, setView] = useState<AuthView>("login");
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
        // 1. Platform admin check
        const isCanonicalAdmin = data.user.id === '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114';
        let isAdminRole = isCanonicalAdmin;
        if (!isAdminRole) {
          const { data: hasAdmin } = await supabase.rpc('has_role', {
            _user_id: data.user.id,
            _role: 'platform_admin'
          });
          isAdminRole = !!hasAdmin;
        }

        if (isAdminRole) {
          navigate("/admin");
          return;
        }

        // 2. Canonical membership role check & is_active check
        const { data: memberRow } = await supabase
          .from('mill_memberships')
          .select('role, mill_id, is_active')
          .eq('user_id', data.user.id)
          .maybeSingle();

        if (memberRow && memberRow.is_active === false) {
          await supabase.auth.signOut();
          toast({
            title: "الحساب معطّل",
            description: "تم تعطيل هذا الحساب من قبل إدارة المعصرة أو المشرف العام.",
            variant: "destructive"
          });
          return;
        }

        if (memberRow?.role === 'mill_employee') {
          navigate("/queue");
        } else {
          // Check if an active season already exists for this mill or user
          let millId = memberRow?.mill_id;
          if (!millId) {
            const { data: millRecord } = await supabase
              .from('mills')
              .select('id')
              .eq('owner_user_id', data.user.id)
              .maybeSingle();
            millId = millRecord?.id;
          }

          let activeSeasonQuery = supabase
            .from('seasons')
            .select('id')
            .eq('status', 'active');

          if (millId) {
            activeSeasonQuery = activeSeasonQuery.eq('mill_id', millId);
          } else {
            activeSeasonQuery = activeSeasonQuery.eq('user_id', data.user.id);
          }

          const { data: activeSeasonRow } = await activeSeasonQuery.maybeSingle();

          if (activeSeasonRow) {
            navigate("/dashboard");
          } else {
            navigate("/seasons");
          }
        }
      } else {
        navigate("/dashboard");
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

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" dir="rtl">
      {/* Branding Panel */}
      <AuthBranding />

      {/* Form Panel */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 bg-background relative min-h-screen lg:min-h-0">
        {/* Top Header with Home Icon Button */}
        <div className="w-full flex items-center justify-start">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            title="الرئيسية"
            aria-label="الرئيسية"
            className="rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Home className="h-5 w-5 text-primary" />
          </Button>
        </div>

        {/* Form Container in Center */}
        <div className="w-full max-w-md mx-auto my-auto py-6">
          {view === "login" && (
            <LoginForm loading={loading} onSubmit={handleLogin} onNavigate={setView} />
          )}
          {view === "register" && (
            <RegisterForm loading={loading} onSubmit={handleRegister} onNavigate={setView} />
          )}
          {view === "forgot-password" && (
            <ForgotPasswordForm loading={loading} onSubmit={handleForgotPassword} onNavigate={setView} />
          )}
        </div>

        {/* Footer info */}
        <div className="w-full text-center text-xs text-muted-foreground py-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="hover:text-primary transition-colors inline-flex items-center gap-1.5"
          >
            <span>المعصرة الذكية — نظام إدارة معاصر الزيتون المتطور</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
