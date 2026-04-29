import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import defaultLogo from "@/assets/3926e988-d85b-4bf1-8f3e-71bdbe4a2e70.png";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getActiveLocalDB } from "@/lib/localdb";

export interface ShopSettings {
  id: string;
  shop_name: string;
  shop_subtitle: string;
  shop_address: string;
  shop_phone: string;
  logo_url: string;
  favicon_url: string;
}

const DEFAULT_SETTINGS: ShopSettings = {
  id: "",
  shop_name: "Apple Store",
  shop_subtitle: "Sales & Stock Management System",
  shop_address: "Goli No-6, Shop No-13, New Market, Karanihat, Satkania, Chittagong",
  shop_phone: "",
  logo_url: "",
  favicon_url: "",
};

export function useShopSettings() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["shop-settings", isOnline ? "online" : "offline"],
    queryFn: async () => {
      const db = getActiveLocalDB();
      if (!isOnline) {
        if (db) {
          const rows = await db.shop_settings.toArray();
          if (rows.length) return rows[0] as unknown as ShopSettings;
        }
        return DEFAULT_SETTINGS;
      }
      try {
        const { data, error } = await supabase
          .from("shop_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        const row = (data as ShopSettings) || DEFAULT_SETTINGS;
        // Mirror to local cache so offline reads work later
        if (db && row && row.id) {
          await db.shop_settings.put({ ...(row as any), _dirty: 0, _deleted: 0 });
        }
        return row;
      } catch (e) {
        console.error("Error fetching shop settings, falling back to local:", e);
        if (db) {
          const rows = await db.shop_settings.toArray();
          if (rows.length) return rows[0] as unknown as ShopSettings;
        }
        return DEFAULT_SETTINGS;
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const resolvedSettings = settings || DEFAULT_SETTINGS;
  const logoSrc = resolvedSettings.logo_url || defaultLogo;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["shop-settings"] });

  return { settings: resolvedSettings, logoSrc, isLoading, refetch };
}
