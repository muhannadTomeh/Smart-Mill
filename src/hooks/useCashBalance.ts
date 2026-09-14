import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";

/** Canonical cash total derived from active cash financial events. */
export function useCashBalance() {
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const [cashBalance, setCashBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!activeSeason || !effectiveMillId) {
      setCashBalance(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("mill_cash_balance" as any)
      .select("cash_balance")
      .eq("mill_id", effectiveMillId)
      .eq("season_id", activeSeason.id)
      .maybeSingle();
    setCashBalance(Number((data as any)?.cash_balance || 0));
    setLoading(false);
  }, [activeSeason?.id, activeSeason?.mill_id, millId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!activeSeason || !effectiveMillId) return;
    const channel = supabase
      .channel(`cash_ledger_${effectiveMillId}_${activeSeason.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "financial_transactions", filter: `mill_id=eq.${effectiveMillId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeSeason?.id, activeSeason?.mill_id, millId, refresh]);

  return { cashBalance, loading, refetch: refresh };
}
