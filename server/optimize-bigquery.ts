import { getBigQueryClient, PROJECT_ID, STOCKS_DATASET, CRYPTO_DATASET } from "./bigquery";

const BQ_LOCATION = "us-central1";

async function optimizeTable(dataset: string, tableName: string, partitionField: string, clusterFields: string[]) {
  const bq = getBigQueryClient();
  const fqn = `\`${PROJECT_ID}.${dataset}.${tableName}\``;
  const tmpName = `${tableName}_optimized`;
  const fqnTmp = `\`${PROJECT_ID}.${dataset}.${tmpName}\``;

  console.log(`\n=== Optimizing ${dataset}.${tableName} ===`);

  const [metaRows] = await bq.query({
    query: `SELECT COUNT(*) as cnt FROM ${fqn}`,
    location: BQ_LOCATION,
  });
  console.log(`  Current rows: ${metaRows[0].cnt}`);

  const [schemaResult] = await bq.dataset(dataset).table(tableName).getMetadata();
  const currentPartitioning = schemaResult.timePartitioning;
  const currentClustering = schemaResult.clustering;

  if (currentPartitioning?.field === partitionField &&
      currentClustering?.fields?.join(",") === clusterFields.join(",")) {
    console.log(`  Already optimized with partition=${partitionField}, cluster=${clusterFields.join(",")}`);
    return;
  }

  console.log(`  Current partitioning: ${JSON.stringify(currentPartitioning || "none")}`);
  console.log(`  Current clustering: ${JSON.stringify(currentClustering || "none")}`);

  try {
    await bq.dataset(dataset).table(tmpName).delete();
    console.log(`  Cleaned up existing temp table`);
  } catch {}

  const clusterClause = clusterFields.length > 0 ? `CLUSTER BY ${clusterFields.join(", ")}` : "";
  const createSQL = `
    CREATE TABLE ${fqnTmp}
    PARTITION BY ${partitionField}
    ${clusterClause}
    AS SELECT * FROM ${fqn}
  `;

  console.log(`  Creating optimized table with partition=${partitionField}, cluster=${clusterFields.join(",")}...`);
  await bq.query({ query: createSQL, location: BQ_LOCATION });

  const [newRows] = await bq.query({
    query: `SELECT COUNT(*) as cnt FROM ${fqnTmp}`,
    location: BQ_LOCATION,
  });
  console.log(`  New table rows: ${newRows[0].cnt}`);

  if (Number(newRows[0].cnt) !== Number(metaRows[0].cnt)) {
    console.error(`  ROW COUNT MISMATCH! Original: ${metaRows[0].cnt}, New: ${newRows[0].cnt}`);
    console.error(`  Aborting - keeping original table`);
    await bq.dataset(dataset).table(tmpName).delete();
    return;
  }

  console.log(`  Dropping original table...`);
  await bq.dataset(dataset).table(tableName).delete();

  console.log(`  Renaming optimized table to ${tableName}...`);
  const copySQL = `
    CREATE TABLE ${fqn}
    PARTITION BY ${partitionField}
    ${clusterClause}
    AS SELECT * FROM ${fqnTmp}
  `;
  await bq.query({ query: copySQL, location: BQ_LOCATION });

  const [finalRows] = await bq.query({
    query: `SELECT COUNT(*) as cnt FROM ${fqn}`,
    location: BQ_LOCATION,
  });
  console.log(`  Final table rows: ${finalRows[0].cnt}`);

  await bq.dataset(dataset).table(tmpName).delete();
  console.log(`  Cleanup complete`);

  const [finalMeta] = await bq.dataset(dataset).table(tableName).getMetadata();
  console.log(`  Partitioning: ${JSON.stringify(finalMeta.timePartitioning)}`);
  console.log(`  Clustering: ${JSON.stringify(finalMeta.clustering)}`);
}

async function main() {
  console.log("BigQuery Table Optimization");
  console.log("===========================\n");

  for (const dataset of [STOCKS_DATASET, CRYPTO_DATASET]) {
    await optimizeTable(dataset, "price_history", "date", ["symbol"]);
    await optimizeTable(dataset, "computed_signals", "DATE(computed_at)", ["symbol"]);
  }

  console.log("\nOptimization complete!");
}

main().catch(err => {
  console.error("Optimization failed:", err);
  process.exit(1);
});
