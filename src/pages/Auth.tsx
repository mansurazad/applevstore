import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { z } from "zod";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  rememberOnlineLogin,
  offlineSignIn,
  hasOfflineCredential,
  listOfflineEmails,
} from "@/lib/auth/offlineAuth";
import { WifiOff, Wifi } from "lucide-react";

const authSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { settings, logoSrc } = useShopSettings();
  const online = useOnlineStatus();
  const offlineEmails = listOfflineEmails();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) navigate("/");
    };
    checkSession();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validation = authSchema.safeParse({ email, password });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        setLoading(false);
        return;
      }
      // ---------------- OFFLINE PATH ----------------
      if (!online) {
        if (isSignUp) {
          toast.error("অফলাইনে নতুন একাউন্ট তৈরি করা যাবে না");
          setLoading(false);
          return;
        }
        if (!hasOfflineCredential(email)) {
          toast.error(
            "এই ইমেইলের অফলাইন credential নেই — অন্তত একবার অনলাইনে লগইন করুন"
          );
          setLoading(false);
          return;
        }
        try {
          await offlineSignIn(email, password);
          toast.success("অফলাইনে সফলভাবে লগইন হয়েছে");
          navigate("/");
        } catch (err: any) {
          toast.error(err.message || "অফলাইন লগইন ব্যর্থ");
        } finally {
          setLoading(false);
        }
        return;
      }
      // ---------------- ONLINE PATH ----------------
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created! Please sign in.");
        setIsSignUp(false);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Cache credential + session for future offline logins
        try {
          await rememberOnlineLogin(
            email,
            password,
            data.session,
            data.user?.id ?? null
          );
        } catch {
          /* non-fatal */
        }
        toast.success("Signed in successfully!");
        setTimeout(() => ActivityLogger.login(), 100);
        navigate("/");
      }
    } catch (error: any) {
      toast.error(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md space-y-8 animate-slide-up">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-48 h-48 rounded-2xl mb-4 shadow-xl animate-fade-in">
            <img src={logoSrc} alt={settings.shop_name} className="w-36 h-36 animate-scale-in object-cover" />
          </div>
          <h2 className="text-3xl font-bold text-white">{settings.shop_name}</h2>
          <p className="mt-2 text-white/80 text-lg">{settings.shop_subtitle || "Sales & Stock Management System"}</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl p-8 border border-border">
          {/* Connection status banner */}
          <div
            className={`mb-4 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border ${
              online
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400"
            }`}
          >
            {online ? (
              <>
                <Wifi className="w-4 h-4" />
                <span>অনলাইন — স্বাভাবিক লগইন</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" />
                <span>
                  অফলাইন মোড —{" "}
                  {offlineEmails.length > 0
                    ? "ক্যাশড credential দিয়ে লগইন করুন"
                    : "অন্তত একবার অনলাইনে লগইন প্রয়োজন"}
                </span>
              </>
            )}
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">Email address</label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="w-full" />
              {!online && offlineEmails.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {offlineEmails.map((em) => (
                    <button
                      type="button"
                      key={em}
                      onClick={() => setEmail(em)}
                      className="text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">Password</label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="w-full" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-6">
              {loading
                ? "Loading..."
                : isSignUp
                ? "Sign Up"
                : online
                ? "Sign In"
                : "Offline Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
