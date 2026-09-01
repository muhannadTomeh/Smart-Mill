import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("رابط غير صالح: authorization_id مفقود");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("لم يُرجع خادم التفويض عنوان إعادة توجيه.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>طلب ربط تطبيق</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <p className="text-sm text-destructive">تعذّر تحميل طلب التفويض: {error}</p>
          ) : !details ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-base font-semibold">
                  ربط {details.client?.name ?? "تطبيق خارجي"} بحسابك
                </p>
                <p className="text-sm text-muted-foreground">
                  سيتمكّن {details.client?.name ?? "التطبيق"} من قراءة وإدارة بيانات معصرتك (الطابور،
                  الزبائن، الفواتير، المصاريف، المخزون) نيابةً عنك.
                </p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                  موافقة
                </Button>
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
                  رفض
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
