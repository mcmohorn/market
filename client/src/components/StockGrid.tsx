import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import type { ColDef } from "ag-grid-community";
import { fetchStocks } from "../lib/api";
import type { StockAnalysis } from "../lib/types";

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

export default function StockGrid({ onSelectSymbol }: Props) {
  const [rowData, setRowData] = useState<StockAnalysis[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("change_percent");
  const [sortDir, setSortDir] = useState("desc");
  const gridRef = useRef<AgGridReact<StockAnalysis>>(null);
  const searchTimeout = useRef<NodeJS.Timeout>(undefined);

  const loadData = useCallback(
    async (params?: { signal?: string; sort?: string; order?: string; search?: string }) => {
      setLoading(true);
      try {
        const result = await fetchStocks({
          signal: params?.signal || filter,
          sort: params?.sort || sortCol,
          order: params?.order || sortDir,
          search: params?.search ?? search,
          limit: 200,
          offset: 0,
        });
        setRowData(result.data);
        setTotal(result.total);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    },
    [filter, sortCol, sortDir, search]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      loadData({ search: val });
    }, 300);
  };

  const columnDefs: ColDef<StockAnalysis>[] = useMemo(
    () => [
      {
        field: "symbol",
        headerName: "SYMBOL",
        width: 100,
        pinned: "left",
        cellRenderer: (params: any) => (
          <button
            onClick={() => onSelectSymbol(params.value)}
            className="text-cyber-green hover:text-white hover:underline font-bold cursor-pointer bg-transparent border-none"
          >
            {params.value}
          </button>
        ),
      },
      { field: "name", headerName: "NAME", width: 180, cellClass: "text-cyber-muted" },
      { field: "exchange", headerName: "EXCH", width: 80, cellClass: "text-cyber-muted text-center" },
      {
        field: "price",
        headerName: "PRICE",
        width: 100,
        type: "numericColumn",
        valueFormatter: (p) => p.value != null ? `$${p.value.toFixed(2)}` : "",
      },
      {
        field: "changePercent",
        headerName: "CHG%",
        width: 90,
        type: "numericColumn",
        cellClass: (p) => (p.value >= 0 ? "text-cyber-green font-bold" : "text-cyber-red font-bold"),
        valueFormatter: (p) => p.value != null ? `${p.value >= 0 ? "+" : ""}${p.value.toFixed(2)}%` : "",
      },
      {
        field: "signal",
        headerName: "SIGNAL",
        width: 90,
        cellRenderer: (params: any) => (
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              params.value === "BUY"
                ? "bg-cyber-green/20 text-cyber-green"
                : params.value === "SELL"
                ? "bg-cyber-red/20 text-cyber-red"
                : "bg-cyber-yellow/20 text-cyber-yellow"
            }`}
          >
            {params.value}
          </span>
        ),
      },
      {
        field: "rsi",
        headerName: "RSI",
        width: 80,
        type: "numericColumn",
        cellClass: (p) => {
          if (!p.value) return "";
          if (p.value > 70) return "text-cyber-red";
          if (p.value < 30) return "text-cyber-green";
          return "text-cyber-yellow";
        },
        valueFormatter: (p) => p.value != null ? p.value.toFixed(0) : "",
      },
      {
        field: "macdHistogram",
        headerName: "MACD",
        width: 100,
        type: "numericColumn",
        cellClass: (p) => (p.value >= 0 ? "text-cyber-green" : "text-cyber-red"),
        valueFormatter: (p) => p.value != null ? p.value.toFixed(4) : "",
      },
      {
        field: "signalStrength",
        headerName: "STRENGTH",
        width: 100,
        type: "numericColumn",
        valueFormatter: (p) => p.value != null ? p.value.toFixed(2) : "",
      },
      {
        field: "signalChanges",
        headerName: "CHANGES",
        width: 90,
        type: "numericColumn",
      },
      {
        field: "dataPoints",
        headerName: "DATA PTS",
        width: 90,
        type: "numericColumn",
      },
      {
        field: "volume",
        headerName: "VOLUME",
        width: 110,
        type: "numericColumn",
        valueFormatter: (p) => {
          if (!p.value) return "";
          if (p.value >= 1e9) return `${(p.value / 1e9).toFixed(1)}B`;
          if (p.value >= 1e6) return `${(p.value / 1e6).toFixed(1)}M`;
          if (p.value >= 1e3) return `${(p.value / 1e3).toFixed(1)}K`;
          return String(p.value);
        },
      },
    ],
    [onSelectSymbol]
  );

  const defaultColDef = useMemo(
    () => ({
      sortable: false,
      resizable: true,
      suppressMovable: true,
    }),
    []
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-[10px] text-cyber-green uppercase tracking-[0.2em] flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-cyber-green rounded-full" />
          MARKET SCANNER
        </div>

        <div className="flex gap-1 ml-auto">
          {["ALL", "BUY", "SELL", "HOLD"].map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                loadData({ signal: f });
              }}
              className={`px-3 py-1 text-[11px] font-bold rounded transition-all ${
                filter === f
                  ? f === "BUY"
                    ? "bg-cyber-green/20 text-cyber-green border border-cyber-green/50"
                    : f === "SELL"
                    ? "bg-cyber-red/20 text-cyber-red border border-cyber-red/50"
                    : f === "HOLD"
                    ? "bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow/50"
                    : "bg-cyber-green/10 text-cyber-green border border-cyber-green/30"
                  : "bg-cyber-panel text-cyber-muted border border-cyber-border hover:border-cyber-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search symbol or name..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="bg-cyber-panel border border-cyber-border text-cyber-text text-xs px-3 py-1.5 rounded w-48 focus:border-cyber-green/50 focus:outline-none"
        />

        <div className="text-[10px] text-cyber-muted">
          {total.toLocaleString()} results
        </div>
      </div>

      <div className="ag-theme-alpine-dark panel" style={{ height: "600px", width: "100%" }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          animateRows={true}
          rowSelection={{ mode: "singleRow" }}
          onRowDoubleClicked={(e) => e.data && onSelectSymbol(e.data.symbol)}
          loading={loading}
          overlayNoRowsTemplate={
            '<div class="text-cyber-muted text-sm p-8">No data available. Run seed-db to load market data.</div>'
          }
        />
      </div>
    </div>
  );
}
