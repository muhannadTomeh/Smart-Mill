import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";

export interface Inventory {
  total_oil: number;
  total_cash: number;
}

export function useInventory() {
  const { user, millId } = useAuth();
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
    let query = supabase
      .from("inventory")
      .select("*")
      .eq("season_id", activeSeason.id);

    if (effectiveMillId) {
      query = (query as any).eq("mill_id", effectiveMillId);
    }

    const [invRes, oilRes] = await Promise.all([
      query.maybeSingle(),
      effectiveMillId
        ? supabase
            .from("mill_oil_balance" as any)
            .select("current_balance, oil_balance")
            .eq("season_id", activeSeason.id)
            .eq("mill_id", effectiveMillId)
            .maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    const canonicalOil = (oilRes as any)?.data?.current_balance ?? (oilRes as any)?.data?.oil_balance ?? (invRes as any)?.data?.total_oil ?? 0;

    if (invRes.data) {
      setInventory({
        total_oil: Number(canonicalOil),
        total_cash: Number((invRes.data as any).total_cash ?? 0),
      });
    } else if (user) {
      await supabase.from("inventory").insert({
        user_id: user.id,
        mill_id: effectiveMillId || null,
        season_id: activeSeason.id,
        total_oil: Number(canonicalOil),
        total_cash: 0,
      } as any);
      setInventory({ total_oil: Number(canonicalOil), total_cash: 0 });
    }
    setLoading(false);
  }, [activeSeason?.id, activeSeason?.mill_id, millId, user]);

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
