import { useState, useEffect } from 'react';

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowBanner(false);
    }

    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  useEffect(() => {
    const handleInstalled = () => {
      setShowBanner(false);
      setInstallPrompt(null);
    };

    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a2e] text-white px-4 py-3 shadow-lg border-t border-white/10">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm font-medium flex-1">
          Install app on your device
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleInstall}
            className="px-4 py-2 bg-white text-[#1a1a2e] rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2 text-white/70 hover:text-white transition-colors text-lg"
            aria-label="Dismiss install prompt"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
