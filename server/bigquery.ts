import { BigQuery } from "@google-cloud/bigquery";

const PROJECT_ID = "market-487302";
const STOCKS_DATASET = "stocks";
const CRYPTO_DATASET = "crypto";
const BQ_LOCATION = "us-central1";

let bqClient: BigQuery | null = null;

function getCredentials(): object | null {
  const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credsJson) return null;
  try {
    return JSON.parse(credsJson);
  } catch {
    console.error("Failed to parse GOOGLE_CREDENTIALS_JSON");
    return null;
  }
}

export function getBigQueryClient(): BigQuery {
  if (bqClient) return bqClient;

  const creds = getCredentials();
  if (creds) {
    bqClient = new BigQuery({
      projectId: PROJECT_ID,
      credentials: creds as any,
    });
  } else {
    bqClient = new BigQuery({
      projectId: PROJECT_ID,
    });
  }

  return bqClient;
}

export async function ensureBigQueryTables() {
  const bq = getBigQueryClient();

  const stocksDataset = bq.dataset(STOCKS_DATASET);
  const cryptoDataset = bq.dataset(CRYPTO_DATASET);

  const [stocksExists] = await stocksDataset.exists();
  if (!stocksExists) {
    await stocksDataset.create({ location: BQ_LOCATION });
    console.log(`Created dataset: ${STOCKS_DATASET}`);
  }

  const [cryptoExists] = await cryptoDataset.exists();
  if (!cryptoExists) {
    await cryptoDataset.create({ location: BQ_LOCATION });
    console.log(`Created dataset: ${CRYPTO_DATASET}`);
  }

  const priceHistorySchema = [
    { name: "symbol", type: "STRING", mode: "REQUIRED" },
    { name: "date", type: "DATE", mode: "REQUIRED" },
    { name: "open", type: "FLOAT64" },
    { name: "high", type: "FLOAT64" },
    { name: "low", type: "FLOAT64" },
    { name: "close", type: "FLOAT64" },
    { name: "volume", type: "INT64" },
  ];

  const metadataSchema = [
    { name: "symbol", type: "STRING", mode: "REQUIRED" },
    { name: "name", type: "STRING" },
    { name: "exchange", type: "STRING" },
    { name: "sector", type: "STRING" },
    { name: "asset_type", type: "STRING" },
  ];

  const signalsSchema = [
    { name: "symbol", type: "STRING", mode: "REQUIRED" },
    { name: "name", type: "STRING" },
    { name: "exchange", type: "STRING" },
    { name: "sector", type: "STRING" },
    { name: "asset_type", type: "STRING" },
    { name: "price", type: "FLOAT64" },
    { name: "change_val", type: "FLOAT64" },
    { name: "change_percent", type: "FLOAT64" },
    { name: "signal", type: "STRING" },
    { name: "macd_histogram", type: "FLOAT64" },
    { name: "macd_histogram_adjusted", type: "FLOAT64" },
    { name: "rsi", type: "FLOAT64" },
    { name: "signal_strength", type: "FLOAT64" },
    { name: "last_signal_change", type: "STRING" },
    { name: "signal_changes", type: "INT64" },
    { name: "data_points", type: "INT64" },
    { name: "volume", type: "INT64" },
    { name: "computed_at", type: "TIMESTAMP" },
  ];

  await ensureTable(stocksDataset, "price_history", priceHistorySchema);
  await ensureTable(stocksDataset, "metadata", metadataSchema);
  await ensureTable(stocksDataset, "computed_signals", signalsSchema);

  await ensureTable(cryptoDataset, "price_history", priceHistorySchema);
  await ensureTable(cryptoDataset, "metadata", metadataSchema);
  await ensureTable(cryptoDataset, "computed_signals", signalsSchema);

  console.log("BigQuery tables verified");
}

async function ensureTable(dataset: any, tableName: string, schema: any[]) {
  const table = dataset.table(tableName);
  const [exists] = await table.exists();
  if (!exists) {
    await dataset.createTable(tableName, { schema: { fields: schema } });
    console.log(`Created table: ${dataset.id}.${tableName}`);
  }
}

export async function insertRows(dataset: string, table: string, rows: any[]) {
  if (rows.length === 0) return;
  const bq = getBigQueryClient();
  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      await bq.dataset(dataset).table(table).insert(batch);
    } catch (err: any) {
      if (err.name === "PartialFailureError") {
        const insertErrors = err.errors || [];
        console.warn(`Partial insert failure in ${dataset}.${table}: ${insertErrors.length} row errors`);
      } else {
        throw err;
      }
    }
  }
}

export async function queryBigQuery(sql: string, params?: any): Promise<any[]> {
  const bq = getBigQueryClient();
  const options: any = { query: sql, location: BQ_LOCATION };
  if (params) {
    options.params = params;
  }
  const [rows] = await bq.query(options);
  return rows;
}

export async function clearTable(dataset: string, table: string) {
  const bq = getBigQueryClient();
  const tableRef = bq.dataset(dataset).table(table);
  const [exists] = await tableRef.exists();
  if (exists) {
    await tableRef.delete();
  }
}

export async function dropAndRecreateTables() {
  for (const ds of [STOCKS_DATASET, CRYPTO_DATASET]) {
    await clearTable(ds, "price_history");
    await clearTable(ds, "metadata");
    await clearTable(ds, "computed_signals");
  }

  await new Promise(resolve => setTimeout(resolve, 5000));

  await ensureBigQueryTables();
  console.log("BigQuery tables recreated");
}

export { PROJECT_ID, STOCKS_DATASET, CRYPTO_DATASET };
