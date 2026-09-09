import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (!activeSeason) {
      setInventory({ total_oil: 0, total_cash: 0 });
      setLoading(false);
      return;
    }
    fetchInventory();
  }, [activeSeason?.id]);

  const fetchInventory = async () => {
    if (!activeSeason) return;
    const effectiveMillId = millId || activeSeason.mill_id;
    let query = supabase
      .from("inventory")
      .select("*")
      .eq("season_id", activeSeason.id);

    if (effectiveMillId) {
      query = (query as any).eq("mill_id", effectiveMillId);
    }

    const { data } = await query.maybeSingle();

    if (data) {
      setInventory({ total_oil: Number(data.total_oil), total_cash: Number(data.total_cash) });
    } else if (user) {
      await supabase.from("inventory").insert({
        user_id: user.id,
        mill_id: effectiveMillId || null,
        season_id: activeSeason.id,
      } as any);
    }
    setLoading(false);
  };

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
