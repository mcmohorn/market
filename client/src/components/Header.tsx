export default function Header() {
  return (
    <header className="border-b border-cyber-border bg-cyber-panel/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-cyber-green glow-green text-xl font-bold tracking-wider">
            MATEO
          </div>
          <div className="text-cyber-muted text-xs tracking-widest uppercase">
            Market Analysis Terminal
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
            <span className="text-xs text-cyber-muted">LIVE</span>
          </div>
          <div className="text-xs text-cyber-muted">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
