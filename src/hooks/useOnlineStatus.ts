import { useEffect, useState } from "react";

/**
 * Tracks browser/Tauri network connectivity.
 * Uses navigator.onLine + online/offline events.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOn = () => setOnline(true);
    const handleOff = () => setOnline(false);
    window.addEventListener("online", handleOn);
    window.addEventListener("offline", handleOff);
    return () => {
      window.removeEventListener("online", handleOn);
      window.removeEventListener("offline", handleOff);
    };
  }, []);

  return online;
}