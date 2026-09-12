import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { toast } from "sonner";

export interface CashSession {
  id: string;
  mill_id: string;
  season_id: string;
  opened_by: string;
  opener_name?: string;
  opening_balance: number;
  opened_at: string;
  status: "open" | "closed";
  closed_at?: string;
  closed_by?: string;
  expected_balance?: number;
  actual_balance?: number;
  difference?: number;
  closing_note?: string;
  total_cash_in: number;
  total_cash_out: number;
}

/** Formats duration between opened_at and now/closed_at into friendly Arabic text */
export function formatSessionDuration(openedAt: string, closedAt?: string): string {
  try {
    const start = new Date(openedAt).getTime();
    const end = closedAt ? new Date(closedAt).getTime() : Date.now();
    const diffMs = Math.max(0, end - start);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const days = Math.floor(diffMins / (60 * 24));
    const hours = Math.floor((diffMins % (60 * 24)) / 60);
    const minutes = diffMins % 60;

    if (days > 0) {
      return `${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : 'أيام'} و ${hours} ساعة`;
    }
    if (hours > 0) {
      return `${hours} ${hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتان' : 'ساعات'} و ${minutes} دقيقة`;
    }
    return `${minutes} دقيقة`;
  } catch {
    return "";
  }
}

interface CashSessionContextValue {
  session: CashSession | null;
  isOpen: boolean;
  loading: boolean;
  millId: string | null;
  openSession: (openingBalance: number) => Promise<boolean>;
  closeSession: (actualBalance: number, note?: string) => Promise<{ success: boolean; expected?: number; difference?: number }>;
  refresh: () => Promise<void>;
}

const CashSessionContext = createContext<CashSessionContextValue>({
  session: null,
  isOpen: false,
  loading: true,
  millId: null,
  openSession: async () => false,
  closeSession: async () => ({ success: false }),
  refresh: async () => {},
});

export function useCashSession() {
  return useContext(CashSessionContext);
}

export function CashSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { activeSeason } = useSeason();
  const [session, setSession] = useState<CashSession | null>(null);
  const [millId, setMillId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSession(null);
      setMillId(null);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc("get_active_cash_session" as any);
      if (error) {
        // User may be platform admin (no membership) — no session
        setSession(null);
        setMillId(null);
      } else if (data) {
        const result = data as any;
        setMillId(result.mill_id ?? null);
        if (result.session) {
          const s = result.session;
          const openBal = Number(s.opening_balance) || 0;
          const cashIn = Number(s.total_cash_in) || 0;
          const cashOut = Number(s.total_cash_out) || 0;
          const expBal = s.expected_balance !== undefined ? Number(s.expected_balance) : (openBal + cashIn - cashOut);
          setSession({
            ...s,
            opening_balance: openBal,
            total_cash_in: cashIn,
            total_cash_out: cashOut,
            expected_balance: expBal,
          });
        } else {
          setSession(null);
        }
      } else {
        setSession(null);
        setMillId(null);
      }
    } catch {
      setSession(null);
      setMillId(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscription: watch for changes to cash_sessions for this mill
  useEffect(() => {
    if (!millId) return;
    const channel = supabase
      .channel(`cash_sessions_mill_${millId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "cash_sessions",
          filter: `mill_id=eq.${millId}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [millId, refresh]);

  const openSession = useCallback(async (openingBalance: number): Promise<boolean> => {
    if (!activeSeason) {
      toast.error("لا يوجد موسم نشط. يرجى تحديد الموسم أولاً.");
      return false;
    }
    try {
      const { data, error } = await supabase.rpc("open_cash_session" as any, {
        p_season_id: activeSeason.id,
        p_opening_balance: openingBalance,
      });
      if (error) {
        toast.error(error.message || "حدث خطأ أثناء فتح الصندوق");
        return false;
      }
      toast.success(`✅ تم فتح الصندوق بنجاح — الرصيد الافتتاحي: ${openingBalance} ₪`);
      await refresh();
      return true;
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء فتح الصندوق");
      return false;
    }
  }, [activeSeason, refresh]);

  const closeSession = useCallback(async (
    actualBalance: number,
    note?: string
  ): Promise<{ success: boolean; expected?: number; difference?: number }> => {
    if (!session) {
      toast.error("لا يوجد صندوق مفتوح");
      return { success: false };
    }
    try {
      const { data, error } = await supabase.rpc("close_cash_session" as any, {
        p_session_id: session.id,
        p_actual_balance: actualBalance,
        p_closing_note: note ?? null,
      });
      if (error) {
        toast.error(error.message || "حدث خطأ أثناء إغلاق الصندوق");
        return { success: false };
      }
      const result = data as any;
      await refresh();
      return {
        success: true,
        expected: result.expected_balance,
        difference: result.difference,
      };
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء إغلاق الصندوق");
      return { success: false };
    }
  }, [session, refresh]);

  return (
    <CashSessionContext.Provider
      value={{
        session,
        isOpen: session !== null && session.status === "open",
        loading,
        millId,
        openSession,
        closeSession,
        refresh,
      }}
    >
      {children}
    </CashSessionContext.Provider>
  );
}
