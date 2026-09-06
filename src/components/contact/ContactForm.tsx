import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const WhatsAppIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    className={className}
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const ContactForm = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const [settings, setSettings] = useState({
    email: "muhannad.tomeh22@gmail.com",
    phone: "0569945677",
    whatsapp: "+972594596906"
  });

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value");
      
      if (data) {
        const newSettings = { ...settings };
        data.forEach(s => {
          if (s.key === "contact_email") newSettings.email = s.value;
          if (s.key === "contact_phone") newSettings.phone = s.value;
          if (s.key === "contact_whatsapp") newSettings.whatsapp = s.value;
        });
        setSettings(newSettings);
      }
    };

    const fetchUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setEmail(user.email);
      }
    };

    fetchSettings();
    fetchUserEmail();
  }, []);

  const targetEmail = settings.email || "muhannad.tomeh22@gmail.com";
  const emailSubject = subject.trim() || "رسالة من موقع المعصرة الذكية";
  const bodyText = `السلام عليكم ورحمة الله وبركاته،\n\nالاسم: ${name.trim()}\nالبريد الإلكتروني: ${email.trim()}\n\nالموضوع:\n${subject.trim()}\n\n---\nأُرسلت من منصة المعصرة الذكية`;
  
  const encodedSubject = encodeURIComponent(emailSubject);
  const encodedBody = encodeURIComponent(bodyText);
  const mailtoLink = `mailto:${targetEmail}?subject=${encodedSubject}&body=${encodedBody}`;
  const gmailWebLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodedSubject}&body=${encodedBody}`;

  const validateForm = () => {
    if (!name.trim()) {
      toast({
        title: "الاسم مطلوب",
        description: "يرجى إدخال اسمك للمتابعة.",
        variant: "destructive",
      });
      return false;
    }
    if (!email.trim() || !email.includes("@")) {
      toast({
        title: "البريد الإلكتروني مطلوب",
        description: "يرجى إدخال بريد إلكتروني صحيح.",
        variant: "destructive",
      });
      return false;
    }
    if (!subject.trim()) {
      toast({
        title: "الموضوع مطلوب",
        description: "يرجى كتابة الموضوع أو الاستفسار.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSendEmail = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

    if (isMobile) {
      // فتح تطبيق الإيميل في الهاتف
      window.location.href = mailtoLink;
      toast({
        title: "جاري فتح تطبيق البريد",
        description: "يتم الآن توجيهك إلى تطبيق البريد الإلكتروني في هاتفك.",
      });
    } else {
      // فتح صفحة الإيميل (Gmail) في المتصفح للكمبيوتر
      window.open(gmailWebLink, "_blank", "noopener,noreferrer");
      toast({
        title: "تم فتح صفحة البريد",
        description: "تم توجيهك إلى صفحة البريد الإلكتروني لإرسال رسالتك.",
      });
    }

    setIsSubmitting(false);
  };

  const handleSendWhatsApp = () => {
    if (!validateForm()) return;

    const cleanNumber = settings.whatsapp.replace(/[^0-9]/g, "");
    const whatsappText = `*رسالة جديدة من موقع المعصرة الذكية*\n\n*الاسم:* ${name.trim()}\n*البريد الإلكتروني:* ${email.trim()}\n*الموضوع:* ${subject.trim()}\n\n---\nأُرسلت عبر منصة المعصرة الذكية`;
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(whatsappText)}`;

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    toast({
      title: "جاري فتح واتساب",
      description: "تم توجيهك إلى محادثة واتساب لإرسال رسالتك.",
    });
  };

  return (
    <section id="contact" className="py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">تواصل معنا</h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              فريق الدعم الفني لدينا جاهز لمساعدتك في أي استفسار أو مشكلة تواجهها في نظام المعصرة الذكية.
            </p>
            
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-4 bg-background p-4 rounded-xl border">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">البريد الإلكتروني الرسمي</p>
                  <p className="font-bold">{settings.email}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 bg-background p-4 rounded-xl border">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">واتساب الدعم الفني</p>
                  <a 
                    href={`https://wa.me/${settings.whatsapp.replace('+', '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-bold hover:text-green-600 transition-colors ltr inline-block"
                  >
                    {settings.whatsapp}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-background p-4 rounded-xl border">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Phone className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">رقم التواصل الرسمي</p>
                  <p className="font-bold ltr inline-block">{settings.phone}</p>
                </div>
              </div>
            </div>
          </div>

          <Card className="border shadow-lg">
            <CardHeader>
              <CardTitle>أرسل لنا رسالة</CardTitle>
              <CardDescription>
                املأ البيانات واختر طريقة الإرسال المناسبة لك (عبر الإيميل أو عبر واتساب مباشرة).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendEmail} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم</Label>
                  <Input 
                    id="name" 
                    required 
                    placeholder="أدخل اسمك" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">الايميل</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    required 
                    placeholder="name@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">الموضوع</Label>
                  <Input 
                    id="subject" 
                    required 
                    placeholder="اكتب موضوع رسالتك أو استفسارك..." 
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <Button 
                    type="submit" 
                    className="w-full gap-2" 
                    disabled={isSubmitting}
                  >
                    <Mail className="h-4 w-4" />
                    إرسال عبر الإيميل
                  </Button>

                  <Button 
                    type="button" 
                    onClick={handleSendWhatsApp} 
                    className="w-full gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white" 
                    disabled={isSubmitting}
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    إرسال عبر واتساب
                  </Button>
                </div>

                <div className="pt-1 text-center">
                  <a
                    href={mailtoLink}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors underline"
                  >
                    أو اضغط هنا لفتح تطبيق البريد الافتراضي في جهازك
                  </a>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;
