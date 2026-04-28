import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import defaultLogo from "@/assets/3926e988-d85b-4bf1-8f3e-71bdbe4a2e70.png";
import { LocalDBProvider } from "@/lib/localdb/LocalDBProvider";
import { SyncProvider } from "@/lib/sync/SyncProvider";

const queryClient = new QueryClient();

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Apply dynamic favicon from shop settings
  useEffect(() => {
    supabase
      .from("shop_settings")
      .select("favicon_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.favicon_url) {
          const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
          if (link) link.href = data.favicon_url;
        }
      });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-2xl mb-4 animate-pulse shadow-xl">
            <img src={defaultLogo} alt="Apple Store" className="w-28 h-28 animate-scale-in" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Apple Store</h2>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <LocalDBProvider>
          <SyncProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<Index user={user} />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </SyncProvider>
        </LocalDBProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
