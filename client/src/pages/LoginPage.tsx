import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage({ onClose }: { onClose?: () => void }) {
  const { loginWithGoogle, loginWithYahoo } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      onClose?.();
    } catch (e: any) {
      setError(e.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleYahoo() {
    setError(null);
    setLoading(true);
    try {
      await loginWithYahoo();
      onClose?.();
    } catch (e: any) {
      setError(e.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="border border-cyber-green/50 bg-cyber-bg p-8 w-full max-w-sm space-y-6 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-4 text-cyber-muted hover:text-cyber-green text-lg font-mono"
          >
            ✕
          </button>
        )}
        <div className="text-center space-y-1">
          <div className="text-cyber-green font-mono text-2xl tracking-widest font-bold">MATEO</div>
          <div className="text-cyber-muted font-mono text-xs uppercase tracking-widest">Market Analysis Terminal</div>
        </div>

        <div className="border-t border-cyber-grid" />

        <div className="space-y-2">
          <p className="text-cyber-muted font-mono text-xs text-center uppercase tracking-wider mb-4">Sign in to access full features</p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-cyber-green/40 text-cyber-text font-mono text-sm hover:bg-cyber-green/10 hover:border-cyber-green transition-all disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>

          <button
            onClick={handleYahoo}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-purple-500/40 text-cyber-text font-mono text-sm hover:bg-purple-500/10 hover:border-purple-500 transition-all disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#6001D2">
              <path d="M0 0l5.5 11.5L0 24h4l3.5-7.5L11 24h4l-5.5-12.5L15 0H11L7.5 7 4 0z"/>
              <path d="M14 5h3l2 4.5L21 5h3l-4.5 9.5V22h-3v-7.5z"/>
            </svg>
            Sign in with Yahoo
          </button>
        </div>

        {error && (
          <p className="text-red-400 font-mono text-xs text-center">{error}</p>
        )}

        <div className="border-t border-cyber-grid pt-3">
          <p className="text-cyber-muted font-mono text-[10px] text-center leading-relaxed">
            Free accounts get Market Scanner access.<br />
            Pro accounts unlock all features.
          </p>
        </div>
      </div>
    </div>
  );
}
