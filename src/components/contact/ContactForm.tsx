import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
              <CardTitle>أرسل لنا رسالة عبر الإيميل</CardTitle>
              <CardDescription>
                املأ النموذج وسيتم نقلك مباشرة إلى صفحة البريد أو فتح تطبيق البريد في هاتفك.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                  <Mail className="h-4 w-4" />
                  {isSubmitting ? "جاري التحويل..." : "إرسال لنا رسالة عبر الإيميل"}
                </Button>

                <div className="pt-2 text-center">
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
