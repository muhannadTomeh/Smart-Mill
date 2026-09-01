import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ContactForm from "@/components/contact/ContactForm";
import {
  Sprout,
  BarChart3,
  Users,
  Clock,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";

const marketingFeatures = [
  {
    icon: Clock,
    title: "توفير الوقت",
    description: "حساب الفاتورة تلقائياً بدل اليدوي المعقد، سرعة في الإنجاز ودقة في الحسابات.",
  },
  {
    icon: Users,
    title: "تنظيم الطابور",
    description: "وداعاً لفوضى الزبائن، نظام ذكي لإدارة الأدوار وتتبع حالة كل دور لحظة بلحظة.",
  },
  {
    icon: BarChart3,
    title: "تقارير مالية فورية",
    description: "اعرف أرباحك، مصاريفك، وكميات الزيت الناتجة لحظة بلحظة ومن أي مكان.",
  },
  {
    icon: ShieldCheck,
    title: "أرشفة كاملة",
    description: "سجل كامل لكل الزبائن والمواسم السابقة، بياناتك محفوظة ومنظمة للرجوع إليها دائماً.",
  },
];

const howItWorks = [
  {
    step: "1",
    title: "تسجيل الزبون",
    description: "سجل بيانات الزبون وعدد الشوالات في الطابور بضغطة زر.",
  },
  {
    step: "2",
    title: "إدخال كمية الزيت",
    description: "بعد العصر، أدخل كمية الزيت المستخرج في شاشة الفاتورة السريعة.",
  },
  {
    step: "3",
    title: "حساب الفاتورة",
    description: "يتم حساب الفاتورة تلقائياً مع خيارات دفع متعددة (زيت، نقدي، أو مختلط).",
  },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [contactLink, setContactLink] = useState("https://wa.me/972594596906?text=" + encodeURIComponent("مرحباً، أريد الاشتراك بنظام المعصرة الذكية"));

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "contact_link")
        .single();
      
      if (data?.value) {
        setContactLink(data.value);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 olive-gradient rounded-lg flex items-center justify-center">
              <Sprout className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">المعصرة الذكية</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/auth")}>
              تسجيل الدخول
            </Button>
            <Button onClick={() => window.open(contactLink, "_blank")}>
              اطلب اشتراكك
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 subtle-gradient opacity-60" />
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-36 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-8">
            <Sprout className="h-4 w-4" />
            نظام إدارة معاصر الزيتون الحديث
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-foreground leading-tight mb-6 max-w-3xl mx-auto">
            تخلص من فوضى الدفاتر والحسابات اليدوية — <span className="text-primary">شغّل معصرتك بذكاء</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            نظم الطابور، احسب الفواتير أوتوماتيكياً، واحصل على تقارير فورية عن أرباحك وإنتاجك في مكان واحد.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="text-base px-8 h-12" onClick={() => window.open(contactLink, "_blank")}>
              اطلب اشتراكك الآن
              <ArrowLeft className="h-5 w-5 mr-2" />
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12" onClick={() => {
              document.getElementById("why-us")?.scrollIntoView({ behavior: "smooth" });
            }}>
              ليش هذا النظام؟
            </Button>
          </div>
        </div>
      </section>

      {/* Why Us Section */}
      <section id="why-us" className="max-w-6xl mx-auto px-6 py-20 bg-muted/30 rounded-3xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">ليش هذا النظام؟</h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            القيمة الحقيقية التي ستحصل عليها لإدارة معصرتك بكفاءة
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {marketingFeatures.map((f) => (
            <Card key={f.title} className="group hover:shadow-olive transition-smooth border-border">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-smooth">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{f.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it Works Section */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">كيف يعمل؟</h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            3 خطوات بسيطة لإدارة عملية العصر بالكامل
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-12 relative">
          {howItWorks.map((step, index) => (
            <div key={index} className="flex flex-col items-center text-center relative z-10">
              <div className="w-16 h-16 rounded-full olive-gradient flex items-center justify-center text-2xl font-bold text-primary-foreground mb-6 shadow-lg">
                {step.step}
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
          {/* Connector line for desktop */}
          <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-0.5 bg-border -z-0" />
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="olive-gradient rounded-2xl p-10 md:p-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            جاهز لتطوير إدارة معصرتك؟
          </h2>
          <p className="text-primary-foreground/80 text-lg mb-8 max-w-xl mx-auto">
            تواصل معنا الآن لتفعيل حسابك والبدء في تنظيم معصرتك بذكاء.
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="text-base px-8 h-12"
            onClick={() => window.open(contactLink, "_blank")}
          >
            اطلب اشتراكك الآن
            <ArrowLeft className="h-5 w-5 mr-2" />
          </Button>
        </div>
      </section>

      {/* Contact Section */}
      <ContactForm />

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Sprout className="h-4 w-4 text-primary" />
            نظام إدارة معاصر الزيتون المعصرة الذكية © {new Date().getFullYear()}
          </div>
          <p className="text-muted-foreground text-sm">صُنع بعناية لأصحاب المعاصر في فلسطين والوطن العربي</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
