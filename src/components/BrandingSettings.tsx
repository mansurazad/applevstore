import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useShopSettings } from "@/hooks/useShopSettings";
import { Palette, Type, MapPin, Phone } from "lucide-react";
import { CloudinaryUpload } from "./CloudinaryUpload";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";

export function BrandingSettings() {
  const { settings, logoSrc, refetch } = useShopSettings();
  const isOnline = useOnlineStatus();
  const [shopName, setShopName] = useState("");
  const [shopSubtitle, setShopSubtitle] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    const initSettings = async () => {
      if (settings && settings.id) {
        setSettingsId(settings.id);
        setShopName(settings.shop_name || "");
        setShopSubtitle(settings.shop_subtitle || "");
        setShopAddress(settings.shop_address || "");
        setShopPhone(settings.shop_phone || "");
      } else {
        const { data, error } = await supabase
          .from("shop_settings")
          .insert({
            shop_name: "Apple Store",
            shop_subtitle: "Sales & Stock Management System",
          })
          .select()
          .single();

        if (!error && data) {
          setSettingsId(data.id);
          setShopName(data.shop_name || "");
          setShopSubtitle(data.shop_subtitle || "");
          setShopAddress(data.shop_address || "");
          setShopPhone(data.shop_phone || "");
          refetch();
        }
      }
    };
    initSettings();
  }, [settings?.id]);

  const handleSave = async () => {
    if (!isOnline) { toast.error("অফলাইনে ব্র্যান্ডিং সংরক্ষণ করা যাবে না"); return; }
    if (!settingsId) {
      toast.error("সেটিংস লোড হয়নি, অনুগ্রহ করে পেজ রিফ্রেশ করুন।");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("shop_settings")
        .update({
          shop_name: shopName,
          shop_subtitle: shopSubtitle,
          shop_address: shopAddress,
          shop_phone: shopPhone,
        })
        .eq("id", settingsId);

      if (error) throw error;
      toast.success("ব্র্যান্ডিং সেটিংস সংরক্ষিত হয়েছে!");
      refetch();
    } catch (error: any) {
      toast.error("সংরক্ষণ ব্যর্থ: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (url: string) => {
    if (!isOnline) { toast.error("অফলাইনে লোগো আপলোড করা যাবে না"); return; }
    if (!settingsId) return;
    try {
      const { error } = await supabase
        .from("shop_settings")
        .update({ logo_url: url })
        .eq("id", settingsId);
      if (error) throw error;
      toast.success("লোগো আপডেট হয়েছে!");
      refetch();
    } catch (error: any) {
      toast.error("লোগো আপডেট ব্যর্থ: " + error.message);
    }
  };

  const handleFaviconUpload = async (url: string) => {
    if (!isOnline) { toast.error("অফলাইনে ফেভিকন আপলোড করা যাবে না"); return; }
    if (!settingsId) return;
    try {
      const { error } = await supabase
        .from("shop_settings")
        .update({ favicon_url: url })
        .eq("id", settingsId);
      if (error) throw error;
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (link) link.href = url;
      toast.success("ফেভিকন আপডেট হয়েছে!");
      refetch();
    } catch (error: any) {
      toast.error("ফেভিকন আপডেট ব্যর্থ: " + error.message);
    }
  };

  return (
    <Card className="p-6 border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
      <OfflineBanner message="অফলাইনে ব্র্যান্ডিং তথ্য ক্যাশ থেকে দেখানো হচ্ছে — পরিবর্তন অনলাইনে ফিরলে চালু হবে।" />
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Palette className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">ব্র্যান্ডিং সেটিংস</h2>
          <p className="text-sm text-muted-foreground">
            দোকানের নাম, লোগো, ফেভিকন এবং ঠিকানা পরিবর্তন করুন।
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Logo Upload via Cloudinary */}
        <div className="flex items-center gap-6 p-4 rounded-xl bg-muted/50">
          <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-accent/30 flex items-center justify-center overflow-hidden bg-card shadow-sm">
            <img src={logoSrc} alt="Shop Logo" className="w-20 h-20 object-cover" />
          </div>
          <CloudinaryUpload
            currentImageUrl={settings.logo_url}
            onUpload={handleLogoUpload}
            folder="apple-store/branding"
            label="📸 দোকানের লোগো"
          />
        </div>

        {/* Favicon Upload via Cloudinary */}
        <div className="flex items-center gap-6 p-4 rounded-xl bg-muted/50">
          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-accent/30 flex items-center justify-center overflow-hidden bg-card shadow-sm">
            {settings.favicon_url ? (
              <img src={settings.favicon_url} alt="Favicon" className="w-12 h-12 object-cover" />
            ) : (
              <span className="text-2xl">🌐</span>
            )}
          </div>
          <CloudinaryUpload
            currentImageUrl={settings.favicon_url}
            onUpload={handleFaviconUpload}
            folder="apple-store/branding"
            label="📸 ফেভিকন আইকন"
          />
        </div>

        {/* Text Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
              <Type className="w-4 h-4 text-accent" /> দোকানের নাম
            </label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Apple Store" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
              <Type className="w-4 h-4 text-accent" /> সাবটাইটেল
            </label>
            <Input value={shopSubtitle} onChange={(e) => setShopSubtitle(e.target.value)} placeholder="Sales & Stock Management System" className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" /> ঠিকানা
            </label>
            <Input value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="আপনার দোকানের ঠিকানা" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
              <Phone className="w-4 h-4 text-accent" /> ফোন নম্বর
            </label>
            <Input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder="01XXXXXXXXX" className="mt-1" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving || !settingsId || !isOnline} className="w-full md:w-auto bg-accent hover:bg-accent/90 text-white">
          {saving ? "⏳ সংরক্ষণ হচ্ছে..." : "💾 সংরক্ষণ করুন"}
        </Button>
      </div>
    </Card>
  );
}