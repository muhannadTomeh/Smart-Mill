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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDisplaySettings, getDynamicItems } from "@/hooks/useDisplaySettings";
import {
  Tv,
  ExternalLink,
  Copy,
  Sparkles,
  Check,
  Plus,
  Trash2,
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
  const [newTitle, setNewTitle] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const { toast } = useToast();
  const { displaySettings, updateSetting, saving } = useDisplaySettings(seasonId);

  const displayUrl = `${window.location.origin}/display/${seasonId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(displayUrl);
    setCopied(true);
    toast({ title: "تم النسخ", description: "تم نسخ رابط شاشة العرض للمتصفح والتلفزيون الذكي" });
    setTimeout(() => setCopied(false), 2000);
  };

  const dynamicItems = getDynamicItems(displaySettings);

  const handleAddDynamicItem = () => {
    if (!newTitle.trim() || !newDetails.trim()) {
      toast({ title: "تنبيه", description: "يرجى كتابة العنوان والتفاصيل", variant: "destructive" });
      return;
    }
    const updated = [
      ...dynamicItems,
      {
        id: Date.now().toString(),
        title: newTitle.trim(),
        details: newDetails.trim(),
        visible: true,
      },
    ];
    updateSetting("dynamic_items", updated);
    updateSetting("custom_faqs", updated.map((i) => ({ id: i.id, q: i.title, a: i.details })));
    setNewTitle("");
    setNewDetails("");
    toast({ title: "تمت الإضافة", description: `تمت إضافة "${newTitle}" لشاشة العرض` });
  };

  const handleToggleVisibility = (id: string) => {
    const updated = dynamicItems.map((item) =>
      item.id === id ? { ...item, visible: !item.visible } : item
    );
    updateSetting("dynamic_items", updated);
    updateSetting("custom_faqs", updated.map((i) => ({ id: i.id, q: i.title, a: i.details })));
  };

  const handleDeleteItem = (id: string) => {
    const updated = dynamicItems.filter((item) => item.id !== id);
    updateSetting("dynamic_items", updated);
    updateSetting("custom_faqs", updated.map((i) => ({ id: i.id, q: i.title, a: i.details })));
  };

  const handleClearAll = () => {
    updateSetting("dynamic_items", []);
    updateSetting("custom_faqs", []);
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
            التحكم بمحتوى شاشة العرض (ديناميكي)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            أضف أو عدّل أي عنصر لعرضه على الشاشة مع زر إظهار وإخفاء مباشر، وتُطبَّق التعديلات فورياً على التلفاز.
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

        {/* Add New Dynamic Item Form */}
        <div className="p-3.5 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Plus className="h-4 w-4 text-primary" />
              <span>إضافة عنصر جديد للشاشة:</span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">العنوان</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="مثال: سعر الزيت بيع"
                className="h-8 text-xs font-medium bg-background"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDynamicItem();
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">التفاصيل / القيمة</Label>
              <Input
                value={newDetails}
                onChange={(e) => setNewDetails(e.target.value)}
                placeholder="مثال: 25"
                className="h-8 text-xs font-medium bg-background"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDynamicItem();
                }}
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              onClick={handleAddDynamicItem}
              disabled={!newTitle.trim() || !newDetails.trim()}
              className="h-8 px-3 text-xs font-bold gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة للشاشة
            </Button>
          </div>
        </div>

        {/* Dynamic Items List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold text-foreground">
              العناصر المضافة ({dynamicItems.length}):
            </Label>
            {dynamicItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-destructive text-[11px] h-6 px-2 hover:bg-destructive/10"
              >
                حذف الكل
              </Button>
            )}
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pe-1">
            {dynamicItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between gap-2.5 p-2.5 rounded-lg border transition-all text-xs",
                  item.visible
                    ? "bg-card border-border shadow-2xs"
                    : "bg-muted/30 border-dashed border-border/70 opacity-60"
                )}
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-foreground">{item.title}</span>
                    {item.visible ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        ظاهر
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                        مخفي
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-primary/90 break-words">{item.details}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-muted-foreground">
                    {item.visible ? "إخفاء" : "إظهار"}
                  </span>
                  <Switch
                    checked={item.visible}
                    onCheckedChange={() => handleToggleVisibility(item.id)}
                    aria-label="إظهار أو إخفاء العنصر"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteItem(item.id)}
                    className="text-destructive hover:bg-destructive/10 h-7 w-7 rounded shrink-0"
                    title="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {dynamicItems.length === 0 && (
              <div className="text-center py-6 px-3 rounded-lg border border-dashed bg-muted/10">
                <p className="text-xs font-semibold text-foreground">لا توجد عناصر مضافة للشاشة</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  اكتب العنوان والقيمة أعلاه واضغط "إضافة للشاشة".
                </p>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Ticker Text Input */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            شريط إخباري متحرك أسفل الشاشة (اختياري)
          </Label>
          <Input
            value={displaySettings.ticker_text || ""}
            onChange={(e) => updateSetting("ticker_text", e.target.value)}
            placeholder="مثال: أهلاً بكم في المعصرة... نرجو من الزبائن الكرام استلام كشوفات الحساب"
            className="text-xs h-8"
          />
          <p className="text-[11px] text-muted-foreground">
            يتحرك كشريط أخبار عاجل أسفل التلفاز. اتركه فارغاً لإخفائه.
          </p>
        </div>

        <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border">
          <span>{saving ? "جارٍ المزامنة..." : "✅ متصل بالشاشة وتُطبَّق التعديلات فورياً"}</span>
          <Button size="sm" onClick={() => setOpen(false)} className="h-8 px-4 text-xs font-bold">
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
