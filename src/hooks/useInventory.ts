import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";

export interface Inventory {
  total_oil: number | null;
}
export function useInventory() {
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const [inventory, setInventory] = useState<Inventory>({ total_oil: null });
  const [loading, setLoading] = useState(true);

  const fetchInventory = useCallback(async () => {
    if (!activeSeason) {
      setInventory({ total_oil: null });
      setLoading(false);
      return;
    }

    const effectiveMillId = millId || activeSeason.mill_id;
    const { data } = effectiveMillId
      ? await supabase
        .from("mill_oil_balance" as any)
        .select("current_balance")
        .eq("season_id", activeSeason.id)
        .eq("mill_id", effectiveMillId)
        .maybeSingle()
      : { data: null };

    // Oil is derived from mill_oil_balance. The legacy inventory row is neither
    // created nor used as a fallback for canonical read models.
    setInventory({
      total_oil: Number((data as any)?.current_balance ?? 0),
    });
    setLoading(false);
  }, [activeSeason?.id, activeSeason?.mill_id, millId]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!activeSeason || !effectiveMillId) return;
    const channel = supabase
      .channel(`inventory_${effectiveMillId}_${activeSeason.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "oil_movements" }, () => {
        void fetchInventory();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeSeason?.id, activeSeason?.mill_id, millId, fetchInventory]);

  return { inventory, loading, refetch: fetchInventory };
}
