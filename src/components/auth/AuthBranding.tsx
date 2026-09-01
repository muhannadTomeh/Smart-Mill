import authIllustration from "@/assets/auth-illustration.jpg";
import { Sprout } from "lucide-react";

const AuthBranding = () => {
  return (
    <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between relative overflow-hidden bg-primary">
      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/90 via-primary/70 to-primary/90 z-10" />

      {/* Background image */}
      <img
        src={authIllustration}
        alt="Olive grove illustration"
        className="absolute inset-0 w-full h-full object-cover opacity-30"
      />

      {/* Content */}
      <div className="relative z-20 flex flex-col justify-center h-full p-10 xl:p-14">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center">
              <Sprout className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary-foreground tracking-tight">
                المعصرة الذكية
              </h1>
              <p className="text-sm text-primary-foreground/70">
                Olive Mill Management
              </p>
            </div>
          </div>

          <h2 className="text-3xl xl:text-4xl font-bold text-primary-foreground leading-tight mb-4">
            نظام إدارة المعاصر
            <br />
            <span className="text-primary-foreground/80">الأكثر تطوراً</span>
          </h2>
          <p className="text-primary-foreground/70 text-base leading-relaxed max-w-sm">
            إدارة شاملة لمعصرتك — من الطابور إلى الفواتير، العمال، المخزون، والتقارير المالية. كل شيء في مكان واحد.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="space-y-3">
          {[
            "إدارة الطابور والإنتاج بسهولة",
            "فواتير تلقائية وتقارير مالية دقيقة",
            "نظام مواسم متكامل",
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-3 text-primary-foreground/80">
              <div className="w-5 h-5 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-20 p-10 xl:p-14 pt-0">
        <p className="text-xs text-primary-foreground/40">
          © {new Date().getFullYear()} المعصرة الذكية. جميع الحقوق محفوظة.
        </p>
      </div>
    </div>
  );
};

export default AuthBranding;
