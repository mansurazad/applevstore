import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDB, type AppleStoreLocalDB } from "./index";

type Ctx = {
  db: AppleStoreLocalDB | null;
  userId: string | null;
  ready: boolean;
};

const LocalDBContext = createContext<Ctx>({ db: null, userId: null, ready: false });

/**
 * Watches Supabase auth and (re)initializes the per-user local DB.
 * Mount once near the root, inside any AuthProvider.
 */
export function LocalDBProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Ctx>({ db: null, userId: null, ready: false });

  useEffect(() => {
    let cancelled = false;

    const apply = (uid: string | null) => {
      if (cancelled) return;
      const db = getLocalDB(uid);
      setState({ db, userId: uid, ready: true });
    };

    // Initial session
    supabase.auth.getSession().then(({ data }) => {
      apply(data.session?.user?.id ?? null);
    });

    // Listen for changes
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      apply(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <LocalDBContext.Provider value={state}>{children}</LocalDBContext.Provider>;
}

export function useLocalDB() {
  return useContext(LocalDBContext);
}