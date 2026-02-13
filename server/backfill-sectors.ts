import { pool, initDB } from "./db";

const SECTOR_KEYWORDS: Record<string, string[]> = {
  "Technology": [
    "software", "tech", "digital", "cloud", "cyber", "data", "ai ", "artificial",
    "semiconductor", "chip", "computing", "internet", "saas", "platform",
    "automation", "robotics", "quantum", " it ", "informat",
  ],
  "Healthcare": [
    "health", "pharma", "biotech", "medical", "therapeut", "bioscien",
    "diagnos", "genomic", "oncolog", "clinic", "hospital", "surgic",
    "immuno", "vaccine", "drug", "biopharma", "biosci", "medic", "dental",
  ],
  "Financial Services": [
    "bank", "financ", "capital", "invest", "asset", "insurance", "mortgage",
    "credit", "lending", "payment", "fintech", "wealth", "fund", "trust",
    "securities", "broker", "exchange", "reit",
  ],
  "Energy": [
    "energy", "oil", "gas", "petrol", "solar", "wind", "renewable", "power",
    "nuclear", "fuel", "drilling", "pipeline", "utility", "electric",
    "clean energy", "hydrogen",
  ],
  "Consumer Discretionary": [
    "retail", "restaurant", "hotel", "leisure", "travel", "gaming",
    "entertainment", "media", "apparel", "fashion", "luxury", "auto",
    "vehicle", "motor", "home", "furniture",
  ],
  "Consumer Staples": [
    "food", "beverage", "grocery", "household", "personal care",
    "tobacco", "consumer product", "nutrition",
  ],
  "Industrials": [
    "industrial", "manufactur", "aerospace", "defense", "construct",
    "engineer", "machinery", "transport", "logistic", "freight",
    "shipping", "building", "material", "steel", "metal", "mining",
  ],
  "Real Estate": [
    "real estate", "realty", "property", "propert", "reit", "housing",
    "mortgage", "apartment", "residential", "commercial prop",
  ],
  "Communication Services": [
    "communicat", "telecom", "wireless", "broadcast", "publish",
    "advertis", "social media", "streaming", "content",
  ],
  "Materials": [
    "chemical", "material", "mineral", "gold", "silver", "copper",
    "lithium", "nickel", "platinum", "resource", "commodity",
  ],
  "Utilities": [
    "utility", "utilities", "water", "sewage", "waste",
  ],
};

const KNOWN_SECTORS: Record<string, string> = {
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology", GOOG: "Technology",
  AMZN: "Consumer Discretionary", META: "Technology", NVDA: "Technology",
  TSLA: "Consumer Discretionary", BRK: "Financial Services",
  JPM: "Financial Services", JNJ: "Healthcare", V: "Financial Services",
  PG: "Consumer Staples", UNH: "Healthcare", HD: "Consumer Discretionary",
  MA: "Financial Services", DIS: "Communication Services", PYPL: "Financial Services",
  BAC: "Financial Services", ADBE: "Technology", CMCSA: "Communication Services",
  NFLX: "Communication Services", XOM: "Energy", NKE: "Consumer Discretionary",
  VZ: "Communication Services", T: "Communication Services", INTC: "Technology",
  WFC: "Financial Services", CRM: "Technology", ABT: "Healthcare",
  CVX: "Energy", PFE: "Healthcare", TMO: "Healthcare", AVGO: "Technology",
  CSCO: "Technology", ACN: "Technology", MRK: "Healthcare", ABBV: "Healthcare",
  QCOM: "Technology", COST: "Consumer Staples", PEP: "Consumer Staples",
  TXN: "Technology", ORCL: "Technology", DHR: "Healthcare", WMT: "Consumer Staples",
  MCD: "Consumer Discretionary", HON: "Industrials", NEE: "Utilities",
  PM: "Consumer Staples", UNP: "Industrials", LIN: "Materials",
  BMY: "Healthcare", LOW: "Consumer Discretionary", UPS: "Industrials",
  RTX: "Industrials", SCHW: "Financial Services", AMD: "Technology",
  AMAT: "Technology", GS: "Financial Services", BLK: "Financial Services",
  MS: "Financial Services", C: "Financial Services", AXP: "Financial Services",
  GE: "Industrials", CAT: "Industrials", BA: "Industrials", DE: "Industrials",
  MMM: "Industrials", SYK: "Healthcare", GILD: "Healthcare", ISRG: "Healthcare",
  MDLZ: "Consumer Staples", ADP: "Industrials", BKNG: "Consumer Discretionary",
  NOW: "Technology", SNOW: "Technology", UBER: "Technology", LYFT: "Technology",
  COIN: "Financial Services", ABNB: "Consumer Discretionary", PLTR: "Technology",
  SOFI: "Financial Services", SQ: "Financial Services", SHOP: "Technology",
  ROKU: "Communication Services", SNAP: "Communication Services",
  PINS: "Communication Services", TWLO: "Technology", ZM: "Technology",
  CRWD: "Technology", DDOG: "Technology", NET: "Technology", ZS: "Technology",
  MDB: "Technology", OKTA: "Technology", PANW: "Technology", FTNT: "Technology",
  COP: "Energy", SLB: "Energy", EOG: "Energy", OXY: "Energy", MPC: "Energy",
  PSX: "Energy", VLO: "Energy", PXD: "Energy", HAL: "Energy", DVN: "Energy",
  KO: "Consumer Staples", CL: "Consumer Staples", KMB: "Consumer Staples",
  GIS: "Consumer Staples", SJM: "Consumer Staples", K: "Consumer Staples",
  HSY: "Consumer Staples", MO: "Consumer Staples", STZ: "Consumer Staples",
  F: "Consumer Discretionary", GM: "Consumer Discretionary",
  TGT: "Consumer Discretionary", SBUX: "Consumer Discretionary",
  CMG: "Consumer Discretionary", YUM: "Consumer Discretionary",
  MAR: "Consumer Discretionary", HLT: "Consumer Discretionary",
  LLY: "Healthcare", AMGN: "Healthcare", REGN: "Healthcare", VRTX: "Healthcare",
  MRNA: "Healthcare", BIIB: "Healthcare", ILMN: "Healthcare",
  CI: "Healthcare", HUM: "Healthcare", ELV: "Healthcare", CVS: "Healthcare",
  WBA: "Healthcare", MCK: "Healthcare", CAH: "Healthcare",
  SO: "Utilities", DUK: "Utilities", D: "Utilities", AEP: "Utilities",
  EXC: "Utilities", SRE: "Utilities", ED: "Utilities", WEC: "Utilities",
  PEG: "Utilities", ES: "Utilities", XEL: "Utilities",
  AMT: "Real Estate", PLD: "Real Estate", CCI: "Real Estate",
  EQIX: "Real Estate", SPG: "Real Estate", PSA: "Real Estate",
  DLR: "Real Estate", O: "Real Estate", VICI: "Real Estate",
  WELL: "Real Estate", AVB: "Real Estate", EQR: "Real Estate",
  APD: "Materials", ECL: "Materials", SHW: "Materials", NEM: "Materials",
  FCX: "Materials", DOW: "Materials", NUE: "Materials", VMC: "Materials",
  TMUS: "Communication Services", CHTR: "Communication Services",
  ATVI: "Communication Services", EA: "Communication Services",
  TTWO: "Communication Services", WBD: "Communication Services",
  PARA: "Communication Services", FOX: "Communication Services",
  LMT: "Industrials", NOC: "Industrials", GD: "Industrials",
  HII: "Industrials", FDX: "Industrials", DAL: "Industrials",
  UAL: "Industrials", AAL: "Industrials", LUV: "Industrials",
  WM: "Industrials", RSG: "Industrials", JCI: "Industrials",
  ETN: "Industrials", EMR: "Industrials", ROK: "Industrials",
  SPGI: "Financial Services", ICE: "Financial Services",
  CME: "Financial Services", MCO: "Financial Services",
  MSCI: "Financial Services", TRV: "Financial Services",
  ALL: "Financial Services", MET: "Financial Services",
  PNC: "Financial Services", USB: "Financial Services",
  TFC: "Financial Services", COF: "Financial Services",
  ALLY: "Financial Services", DFS: "Financial Services",
  MRVL: "Technology", MU: "Technology", LRCX: "Technology",
  KLAC: "Technology", ON: "Technology", ADI: "Technology",
  NXPI: "Technology", MCHP: "Technology", SWKS: "Technology",
  MPWR: "Technology", ENPH: "Technology", SEDG: "Technology",
  FSLR: "Energy", RUN: "Energy", PLUG: "Energy",
  IBM: "Technology", HPQ: "Technology", HPE: "Technology",
  DELL: "Technology", NTAP: "Technology",
  RIVN: "Consumer Discretionary", LCID: "Consumer Discretionary",
  NIO: "Consumer Discretionary", XPEV: "Consumer Discretionary",
  LI: "Consumer Discretionary",
  SQ: "Financial Services", AFRM: "Financial Services",
  HOOD: "Financial Services", UPST: "Financial Services",
  RBLX: "Communication Services", U: "Technology", TTWO: "Communication Services",
  SPOT: "Communication Services", MTCH: "Communication Services",
  WDAY: "Technology", SPLK: "Technology", TEAM: "Technology",
  DOCU: "Technology", BILL: "Technology", HUBS: "Technology",
  VEEV: "Technology", PAYC: "Technology", PCTY: "Technology",
  INTU: "Technology", FISV: "Financial Services", FIS: "Financial Services",
  GPN: "Financial Services", WEX: "Financial Services",
  CARR: "Industrials", OTIS: "Industrials", TT: "Industrials",
  IR: "Industrials", PH: "Industrials", AME: "Industrials",
  DOV: "Industrials", SWK: "Industrials", ITW: "Industrials",
  FAST: "Industrials", NDSN: "Industrials", ROP: "Industrials",
  IEX: "Industrials", GNRC: "Industrials",
  DXCM: "Healthcare", ALGN: "Healthcare", PODD: "Healthcare",
  HOLX: "Healthcare", IDXX: "Healthcare", ZBH: "Healthcare",
  BSX: "Healthcare", EW: "Healthcare", MDT: "Healthcare",
  BDX: "Healthcare", BAX: "Healthcare", A: "Healthcare",
  WAT: "Healthcare", IQV: "Healthcare", CRL: "Healthcare",
  TECH: "Healthcare", MTD: "Healthcare",
  AWK: "Utilities", WTRG: "Utilities", CMS: "Utilities",
  DTE: "Utilities", LNT: "Utilities", AES: "Utilities",
  ATO: "Utilities", NI: "Utilities", EVRG: "Utilities",
  PPL: "Utilities", FE: "Utilities", CNP: "Utilities",
  BXP: "Real Estate", ARE: "Real Estate", MAA: "Real Estate",
  ESS: "Real Estate", UDR: "Real Estate", CPT: "Real Estate",
  REG: "Real Estate", KIM: "Real Estate", SUI: "Real Estate",
  ELS: "Real Estate", INVH: "Real Estate", AMH: "Real Estate",
  ALB: "Materials", LYB: "Materials", CE: "Materials",
  EMN: "Materials", PPG: "Materials", RPM: "Materials",
  BALL: "Materials", PKG: "Materials", IP: "Materials",
  WRK: "Materials", CLF: "Materials", X: "Materials",
  AA: "Materials", STLD: "Materials", RS: "Materials",
};

function classifySector(symbol: string, name: string): string {
  if (KNOWN_SECTORS[symbol]) return KNOWN_SECTORS[symbol];

  const nameLower = name.toLowerCase();

  if (nameLower.includes("etf") || nameLower.includes("fund") || nameLower.includes("trust") ||
      nameLower.includes("index") || symbol.length >= 4 && (
        nameLower.includes("ishares") || nameLower.includes("vanguard") ||
        nameLower.includes("spdr") || nameLower.includes("proshares") ||
        nameLower.includes("invesco") || nameLower.includes("direxion") ||
        nameLower.includes("wisdomtree") || nameLower.includes("global x")
      )) {
    return "ETF/Fund";
  }

  if (nameLower.includes("acquisition") || nameLower.includes("spac") ||
      nameLower.includes("blank check")) {
    return "SPAC";
  }

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    for (const kw of keywords) {
      if (nameLower.includes(kw)) return sector;
    }
  }

  return "Other";
}

async function main() {
  console.log("=== Sector Backfill ===");
  await initDB();

  const result = await pool.query(
    `SELECT symbol, name FROM stocks WHERE asset_type = 'stock' ORDER BY symbol`
  );

  const sectorCounts: Record<string, number> = {};
  let updated = 0;

  for (const row of result.rows) {
    const sector = classifySector(row.symbol, row.name || "");
    if (!sectorCounts[sector]) sectorCounts[sector] = 0;
    sectorCounts[sector]++;

    await pool.query(
      `UPDATE stocks SET sector = $1 WHERE symbol = $2`,
      [sector, row.symbol]
    );
    await pool.query(
      `UPDATE computed_signals SET sector = $1 WHERE symbol = $2`,
      [sector, row.symbol]
    );

    updated++;
    if (updated % 500 === 0) {
      console.log(`  Updated ${updated}/${result.rows.length} stocks...`);
    }
  }

  console.log(`\nSector distribution:`);
  const sorted = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]);
  for (const [sector, count] of sorted) {
    console.log(`  ${sector}: ${count}`);
  }

  console.log(`\nUpdated ${updated} stocks total`);
  process.exit(0);
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
