import { useState, useEffect } from "react";
import { urlBase64ToUint8Array, arrayBufferToBase64 } from "@/lib/push-utils";

export default function PushNotificationToggle() {
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch (err) {
      console.warn("[PushNotification] checkSubscription failed:", err);
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    try {
      // Request permission
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPermission(perm);
        setError(
          "Permission denied. Please enable notifications in your browser settings.",
        );
        return;
      }
      setPermission(perm);

      // Get VAPID key
      const configRes = await fetch("/notifications/config", {
        credentials: "include",
      });
      if (!configRes.ok) {
        throw new Error("Failed to fetch notification config from server");
      }
      const config = await configRes.json();
      const vapidKey = config.vapidPublicKey;

      if (!vapidKey) {
        setError("VAPID key not configured on server. Please contact support.");
        return;
      }

      // Subscribe via service worker
      console.log("test");
      const reg = await navigator.serviceWorker.ready;
      console.log(reg);
      if (!reg.pushManager) {
        throw new Error(
          "Push notifications are not supported in this browser.",
        );
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      // Send to backend
      const subRes = await fetch("/notifications/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: arrayBufferToBase64(sub.getKey("p256dh")!),
          auth: arrayBufferToBase64(sub.getKey("auth")!),
        }),
      });

      if (!subRes.ok) {
        const errorText = await subRes.text();
        throw new Error(
          `Failed to save subscription: ${subRes.status} ${errorText}`,
        );
      }

      setSubscribed(true);
    } catch (err: any) {
      console.error("[PushNotification] Failed to enable:", err);
      const message = err?.message || "Failed to enable notifications";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        setSubscribed(false);
      }
    } catch (err: any) {
      console.error("[PushNotification] Failed to disable:", err);
      setError(err?.message || "Failed to disable notifications");
    }
  };

  if (!("Notification" in window)) {
    return (
      <div className="text-sm text-gray-400">
        Notifications not supported in this browser.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white">Push Notifications</h3>
          <p className="text-xs text-gray-400">
            {permission === "granted" && subscribed
              ? "Enabled — you will receive workout reminders"
              : permission === "denied"
                ? "Blocked — enable in browser settings"
                : "Get notified about scheduled workouts"}
          </p>
        </div>
        {permission === "granted" && subscribed ? (
          <button
            onClick={handleDisable}
            disabled={loading}
            className="px-3 py-1.5 text-sm rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50"
          >
            Disable
          </button>
        ) : (
          <button
            onClick={handleEnable}
            disabled={loading}
            className="px-3 py-1.5 text-sm rounded-md bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
          >
            {loading ? "Enabling..." : "Enable"}
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
