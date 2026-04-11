export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">📡</div>
        <h1 className="text-2xl font-bold text-white mb-3">
          You're offline / คุณออฟไลน์อยู่
        </h1>
        <p className="text-white/70 mb-8">
          Check your connection and try again. Some cached data may still be available.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-white text-[#1a1a2e] rounded-lg font-semibold hover:bg-white/90 transition-colors"
        >
          Retry / ลองอีกครั้ง
        </button>
      </div>
    </div>
  );
}
