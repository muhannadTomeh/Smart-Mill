import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useDisplaySettings } from "@/hooks/useDisplaySettings";
import {
  Tv,
  Clock,
  ExternalLink,
  Copy,
  Sparkles,
  ShoppingBag,
  HelpCircle,
  Check,
  Eye,
  SlidersHorizontal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DisplaySettingsDialogProps {
  seasonId: string;
  trigger?: React.ReactNode;
}

export function DisplaySettingsDialog({ seasonId, trigger }: DisplaySettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { displaySettings, updateSetting, saving } = useDisplaySettings(seasonId);

  const displayUrl = `${window.location.origin}/display/${seasonId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(displayUrl);
    setCopied(true);
    toast({ title: "تم النسخ", description: "تم نسخ رابط شاشة العرض للمتصفح والتلفزيون الذكي" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 rounded-lg border-border hover:bg-accent text-xs font-medium text-foreground gap-1.5"
            title="التحكم بالعناصر الظاهرة على شاشة العرض"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <span>التحكم بالشاشة</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Tv className="h-5 w-5 text-primary" />
            التحكم بمحتوى شاشة العرض (التلفزيون)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            أي تغيير تقوم به هنا يتم تطبيقه فوراً وبشكل حي (Live) على شاشة الانتظار
          </DialogDescription>
        </DialogHeader>

        {/* Action link bar */}
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border text-xs">
          <span className="font-mono text-muted-foreground truncate max-w-[240px] sm:max-w-xs" dir="ltr">
            {displayUrl}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={copyLink}
              className="h-7 px-2.5 text-xs gap-1"
              title="نسخ الرابط لفتحه على شاشة التلفاز"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? "تم النسخ" : "نسخ"}</span>
            </Button>
            <Button
              size="sm"
              variant="default"
              asChild
              className="h-7 px-2.5 text-xs gap-1 bg-primary text-primary-foreground"
            >
              <a href={displayUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
                <span>فتح الشاشة</span>
              </a>
            </Button>
          </div>
        </div>

        {/* Toggles Grid */}
        <div className="space-y-3 pt-1">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-primary" />
            إظهار وإخفاء عناصر الشاشة
          </h4>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {/* Estimated time */}
            <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-card hover:bg-muted/20 transition-colors">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  الوقت التقديري والمتبقي
                </Label>
                <p className="text-[11px] text-muted-foreground">عرض العداد ووقت الدور</p>
              </div>
              <Switch
                checked={Boolean(displaySettings.show_estimated_time)}
                onCheckedChange={(val) => updateSetting("show_estimated_time", val)}
              />
            </div>

            {/* Bags count */}
            <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-card hover:bg-muted/20 transition-colors">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                  <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
                  عدد الشوالات
                </Label>
                <p className="text-[11px] text-muted-foreground">عرض أكياس الزيتون للأدوار</p>
              </div>
              <Switch
                checked={Boolean(displaySettings.show_bags_count)}
                onCheckedChange={(val) => updateSetting("show_bags_count", val)}
              />
            </div>

            {/* Digital Clock */}
            <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-card hover:bg-muted/20 transition-colors">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                  🕒 الساعة الرقمية
                </Label>
                <p className="text-[11px] text-muted-foreground">عرض الساعة الكبيرة أعلى الشاشة</p>
              </div>
              <Switch
                checked={Boolean(displaySettings.show_clock)}
                onCheckedChange={(val) => updateSetting("show_clock", val)}
              />
            </div>

            {/* Oil prices bar */}
            <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-card hover:bg-muted/20 transition-colors">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                  🫒 شريط أسعار الزيت
                </Label>
                <p className="text-[11px] text-muted-foreground">عرض شريط الأسعار بالأسفل</p>
              </div>
              <Switch
                checked={Boolean(displaySettings.show_oil_prices)}
                onCheckedChange={(val) => updateSetting("show_oil_prices", val)}
              />
            </div>

            {/* Sell price */}
            <div className={`flex items-center justify-between p-3 border border-border rounded-xl bg-card transition-colors ${!displaySettings.show_oil_prices ? "opacity-50" : "hover:bg-muted/20"}`}>
              <div className="space-y-0.5">
                <Label className="text-xs font-bold cursor-pointer">سعر بيع الزيت</Label>
                <p className="text-[11px] text-muted-foreground">إظهار سعر البيع (₪/كغم)</p>
              </div>
              <Switch
                disabled={!displaySettings.show_oil_prices}
                checked={Boolean(displaySettings.show_sell_price)}
                onCheckedChange={(val) => updateSetting("show_sell_price", val)}
              />
            </div>

            {/* Buy price */}
            <div className={`flex items-center justify-between p-3 border border-border rounded-xl bg-card transition-colors ${!displaySettings.show_oil_prices ? "opacity-50" : "hover:bg-muted/20"}`}>
              <div className="space-y-0.5">
                <Label className="text-xs font-bold cursor-pointer">سعر شراء الزيت</Label>
                <p className="text-[11px] text-muted-foreground">إظهار سعر الشراء (₪/كغم)</p>
              </div>
              <Switch
                disabled={!displaySettings.show_oil_prices}
                checked={Boolean(displaySettings.show_buy_price)}
                onCheckedChange={(val) => updateSetting("show_buy_price", val)}
              />
            </div>

            {/* FAQs and Notices */}
            <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-card hover:bg-muted/20 transition-colors sm:col-span-2">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                  <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                  المعلومات الدوارة والإعلانات
                </Label>
                <p className="text-[11px] text-muted-foreground">عرض الإرشادات والأسئلة الشائعة أسفل الشاشة</p>
              </div>
              <Switch
                checked={Boolean(displaySettings.show_faqs)}
                onCheckedChange={(val) => updateSetting("show_faqs", val)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Ticker Text Input */}
        <div className="space-y-2">
          <Label className="text-xs font-bold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            شريط إخباري متحرك أسفل الشاشة (اختياري)
          </Label>
          <Input
            value={displaySettings.ticker_text || ""}
            onChange={(e) => updateSetting("ticker_text", e.target.value)}
            placeholder="مثال: أهلاً بكم في المعصرة... نرجو من الزبائن الكرام استلام كشوفات الحساب"
            className="text-xs h-9"
          />
          <p className="text-[11px] text-muted-foreground">
            النص يتحرك كشريط أخبار عاجل على شاشة التلفاز. اتركه فارغاً لإخفائه.
          </p>
        </div>

        <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border">
          <span>{saving ? "جارٍ الحفظ والمزامنة..." : "✅ متصل بالشاشة وتُطبَّق التعديلات فورياً"}</span>
          <Button size="sm" onClick={() => setOpen(false)} className="h-8 px-4 text-xs font-bold">
            تم
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
