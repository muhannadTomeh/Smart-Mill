import { supabase } from "@/integrations/supabase/client";

export interface DeletedInvoice {
  id: string;
  name: string;
  phone: string | null;
  position: number;
  bags: number;
  notes: string | null;
  status: string;
  season_id?: string | null;
  user_id?: string | null;
  deleted_at: string; // ISO
  expires_at: string; // ISO (24h after deleted_at)
  source?: "queue_completed" | "invoice";
  oil_produced?: number;
}

const STORAGE_PREFIX = "deleted_invoices_";
const CHANNEL_NAME = "smart_mill_deleted_invoices_channel";

/**
 * Returns the storage key for a season or fallback
 */
function getStorageKey(seasonId?: string | null): string {
  return `${STORAGE_PREFIX}${seasonId || "default"}`;
}

/**
 * Clean up expired items (> 24 hours old) and return valid ones
 */
export function getDeletedInvoices(seasonId?: string | null): DeletedInvoice[] {
  try {
    const key = getStorageKey(seasonId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed: DeletedInvoice[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    // Keep only items that have not expired yet (within 24 hours)
    const valid = parsed.filter((item) => {
      const exp = new Date(item.expires_at).getTime();
      return !isNaN(exp) && exp > now;
    });

    // If some were purged, save back the cleaned list
    if (valid.length !== parsed.length) {
      localStorage.setItem(key, JSON.stringify(valid));
    }

    // Sort newest deletion first
    return valid.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
  } catch (err) {
    console.error("Error reading deleted invoices:", err);
    return [];
  }
}

/**
 * Save an invoice to the deleted items pool (persisted for 24 hours)
 */
export function saveDeletedInvoice(item: Omit<DeletedInvoice, "expires_at"> & { expires_at?: string }): void {
  try {
    const key = getStorageKey(item.season_id);
    const existing = getDeletedInvoices(item.season_id);

    // Filter out if already exists
    const filtered = existing.filter((i) => i.id !== item.id);

    const fullItem: DeletedInvoice = {
      ...item,
      expires_at: item.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const updated = [fullItem, ...filtered];
    localStorage.setItem(key, JSON.stringify(updated));

    // Notify other components/tabs
    notifyDeletedChange(item.season_id);
  } catch (err) {
    console.error("Error saving deleted invoice:", err);
  }
}

/**
 * Remove a deleted invoice permanently from the pool
 */
export function removeDeletedInvoice(id: string, seasonId?: string | null): void {
  try {
    const key = getStorageKey(seasonId);
    const existing = getDeletedInvoices(seasonId);
    const updated = existing.filter((i) => i.id !== id);
    localStorage.setItem(key, JSON.stringify(updated));
    notifyDeletedChange(seasonId);
  } catch (err) {
    console.error("Error removing deleted invoice:", err);
  }
}

/**
 * Clear all deleted invoices for a season
 */
export function clearAllDeletedInvoices(seasonId?: string | null): void {
  try {
    const key = getStorageKey(seasonId);
    localStorage.removeItem(key);
    notifyDeletedChange(seasonId);
  } catch (err) {
    console.error("Error clearing deleted invoices:", err);
  }
}

/**
 * Restores a deleted invoice back into the Supabase queue as "completed" (waiting for invoice)
 */
export async function restoreDeletedInvoiceToQueue(
  item: DeletedInvoice,
  targetMillId: string,
  targetUserId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Re-insert or upsert into queue with status "completed"
    const payload: any = {
      id: item.id,
      mill_id: (item as any).mill_id || targetMillId,
      user_id: item.user_id || targetUserId,
      season_id: item.season_id || null,
      name: item.name,
      phone: item.phone,
      bags: item.bags,
      position: item.position,
      notes: item.notes,
      status: "completed", // Places it back in "3. بانتظار الفاتورة"
    };

    const { error } = await supabase.from("queue").upsert(payload);

    if (error) {
      console.error("Failed to restore invoice to queue in Supabase:", error);
      return { success: false, error: error.message };
    }

    // 2. Remove from deleted invoices pool
    removeDeletedInvoice(item.id, item.season_id);
    return { success: true };
  } catch (err: any) {
    console.error("Unexpected error restoring invoice:", err);
    return { success: false, error: err?.message || "حدث خطأ غير متوقع أثناء الاسترجاع" };
  }
}

/**
 * Format remaining time until 24h expiration
 */
export function formatRemainingTime(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "منتهية الصلاحية";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours} ساعة و ${minutes} دقيقة`;
  }
  return `${minutes} دقيقة`;
}

function notifyDeletedChange(seasonId?: string | null) {
  try {
    window.dispatchEvent(new CustomEvent("deleted_invoices_updated", { detail: { seasonId } }));
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage({ type: "DELETED_INVOICES_UPDATED", seasonId });
    bc.close();
  } catch {}
}
