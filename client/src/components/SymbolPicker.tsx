import { useEffect, useState, useRef, useCallback } from "react";
import { fetchSymbols } from "../lib/api";

interface Props {
  selectedSymbols: string[];
  onChange: (symbols: string[]) => void;
  assetType?: string;
}

export default function SymbolPicker({ selectedSymbols, onChange, assetType }: Props) {
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    fetchSymbols(assetType)
      .then(setAllSymbols)
      .catch(() => setAllSymbols([]))
      .finally(() => setLoading(false));
    onChange([]);
  }, [assetType]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = search.trim()
    ? allSymbols.filter(s => s.toLowerCase().includes(search.toLowerCase())).slice(0, 50)
    : [];

  const toggleSymbol = useCallback((sym: string) => {
    if (selectedSymbols.includes(sym)) {
      onChange(selectedSymbols.filter(s => s !== sym));
    } else {
      onChange([...selectedSymbols, sym]);
    }
    setSearch("");
    inputRef.current?.focus();
  }, [selectedSymbols, onChange]);

  const removeSymbol = useCallback((sym: string) => {
    onChange(selectedSymbols.filter(s => s !== sym));
  }, [selectedSymbols, onChange]);

  return (
    <div ref={containerRef} className="relative">
      <span className="text-cyber-muted text-xs font-mono flex justify-between mb-1">
        <span>Portfolio (optional)</span>
        {selectedSymbols.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-cyber-red/70 hover:text-cyber-red text-[10px]"
          >
            CLEAR ALL
          </button>
        )}
      </span>

      <div
        className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-2 py-1 text-sm font-mono focus-within:border-cyber-green cursor-text flex flex-wrap gap-1 min-h-[30px]"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {selectedSymbols.map(sym => (
          <span
            key={sym}
            className="inline-flex items-center gap-1 bg-cyber-green/15 text-cyber-green border border-cyber-green/30 px-1.5 py-0 text-[11px] leading-5"
          >
            {sym}
            <button
              onClick={e => { e.stopPropagation(); removeSymbol(sym); }}
              className="hover:text-cyber-red text-cyber-green/60 text-[10px] leading-none"
            >
              x
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selectedSymbols.length === 0 ? "Type to search symbols (e.g. BTC, AAPL)..." : "Add more..."}
          className="bg-transparent outline-none text-sm flex-1 min-w-[120px] placeholder:text-cyber-muted/40"
        />
      </div>

      {selectedSymbols.length > 0 && (
        <div className="text-[10px] text-cyber-muted mt-1">
          {selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? "s" : ""} selected — simulation will only trade these
        </div>
      )}

      {open && search.trim().length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#0a0a0a] border border-cyber-grid max-h-[200px] overflow-y-auto">
          {loading ? (
            <div className="p-2 text-cyber-muted text-xs font-mono">Loading symbols...</div>
          ) : filtered.length === 0 ? (
            <div className="p-2 text-cyber-muted text-xs font-mono">No matching symbols</div>
          ) : (
            filtered.map(sym => {
              const isSelected = selectedSymbols.includes(sym);
              return (
                <button
                  key={sym}
                  onClick={() => toggleSymbol(sym)}
                  className={`w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-cyber-green/10 flex items-center justify-between ${
                    isSelected ? "text-cyber-green bg-cyber-green/5" : "text-cyber-text"
                  }`}
                >
                  <span>{sym}</span>
                  {isSelected && <span className="text-cyber-green text-xs">&#10003;</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
