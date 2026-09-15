import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";

export interface Inventory {
  total_oil: number;
  total_cash: number;
}

export function useInventory() {
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const [inventory, setInventory] = useState<Inventory>({ total_oil: 0, total_cash: 0 });
  const [loading, setLoading] = useState(true);

  const fetchInventory = useCallback(async () => {
    if (!activeSeason) {
      setInventory({ total_oil: 0, total_cash: 0 });
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

    // Oil is derived from oil_movements. The legacy inventory row is neither
    // created nor used as a fallback for canonical read models.
    setInventory({
      total_oil: Number((data as any)?.current_balance ?? 0),
      total_cash: 0,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        void fetchInventory();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "oil_movements" }, () => {
        void fetchInventory();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeSeason?.id, activeSeason?.mill_id, millId, fetchInventory]);

  const updateInventory = async (changes: Partial<Inventory>) => {
    if (!activeSeason) return;
    const effectiveMillId = millId || activeSeason.mill_id;
    let query = supabase
      .from("inventory")
      .update(changes)
      .eq("season_id", activeSeason.id);

    if (effectiveMillId) {
      query = (query as any).eq("mill_id", effectiveMillId);
    }

    const { error } = await query;
    if (!error) {
      setInventory((prev) => ({ ...prev, ...changes }));
    }
    return { error };
  };

  return { inventory, loading, updateInventory, refetch: fetchInventory };
}
