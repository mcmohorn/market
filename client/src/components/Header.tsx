export type AssetType = "stock" | "crypto";

interface AppUser {
  email: string;
  display_name: string;
  account_type: "free" | "pro";
}

interface Props {
  assetType: AssetType;
  onAssetTypeChange: (type: AssetType) => void;
  user?: AppUser | null;
  onLogin?: () => void;
  onLogout?: () => void;
}

export default function Header({ assetType, onAssetTypeChange, user, onLogin, onLogout }: Props) {
  return (
    <header className="border-b border-cyber-border bg-cyber-panel/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-cyber-green glow-green text-xl font-bold tracking-wider">
            MATEO
          </div>
          <div className="text-cyber-muted text-xs tracking-widest uppercase hidden sm:block">
            Market Analysis Terminal
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-cyber-bg rounded border border-cyber-border overflow-hidden">
            <button
              onClick={() => onAssetTypeChange("stock")}
              className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                assetType === "stock"
                  ? "bg-cyber-green/20 text-cyber-green border-r border-cyber-green/30"
                  : "text-cyber-muted hover:text-cyber-green/70 border-r border-cyber-border"
              }`}
            >
              Stocks
            </button>
            <button
              onClick={() => onAssetTypeChange("crypto")}
              className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                assetType === "crypto"
                  ? "bg-cyber-green/20 text-cyber-green"
                  : "text-cyber-muted hover:text-cyber-green/70"
              }`}
            >
              Crypto
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
            <span className="text-xs text-cyber-muted">LIVE</span>
          </div>

          <div className="text-xs text-cyber-muted hidden md:block">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-cyber-green/20 border border-cyber-green/40 flex items-center justify-center text-cyber-green text-[10px] font-bold uppercase">
                  {user.display_name?.[0] || user.email[0]}
                </div>
                <div className="hidden sm:block">
                  <div className="text-cyber-text text-[11px] font-mono leading-none">{user.display_name || user.email.split("@")[0]}</div>
                  {user.account_type === "pro" && (
                    <div className="text-cyber-green text-[9px] font-mono uppercase tracking-wider">PRO</div>
                  )}
                </div>
              </div>
              <button
                onClick={onLogout}
                className="text-cyber-muted text-[10px] font-mono hover:text-cyber-green transition-colors uppercase tracking-wider"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-cyber-green/40 text-cyber-green hover:bg-cyber-green/10 transition-all"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
