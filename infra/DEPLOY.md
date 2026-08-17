# MATEO — Google Cloud Deployment Guide

## Architecture

| Component | GCP Service | Purpose |
|-----------|-------------|---------|
| Web app | Cloud Run (service) | Serves Express API + React frontend |
| Data updater | Cloud Run (job) | Runs `server/update.ts` — fetches prices, recomputes signals |
| Database | Cloud SQL (PostgreSQL 15) | Primary data store |
| Images | Artifact Registry | Docker image storage |
| CI/CD | Cloud Build | Builds + deploys on push to `main` |
| Schedule | Cloud Scheduler | Triggers updater at 0, 6, 12, 18 EST |
| Secrets | Secret Manager | Alpaca + Tiingo API keys |

---

## Prerequisites

1. **GCP project** with billing enabled
2. **`gcloud` CLI** — authenticated (`gcloud auth application-default login`)
3. **Terraform** ≥ 1.5 (`brew install terraform` or https://developer.hashicorp.com/terraform/install)
4. **GitHub repository** — your code must be pushed there before Cloud Build can trigger

---

## Step 1 — Create the tfvars file

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Open terraform.tfvars and fill in every value
```

Key values you need:
- `google_cloud_project_id` — from GCP Console → Project Overview
- `db_password` — generate with `openssl rand -base64 32`
- `github_repo_owner` / `github_repo_name` — your GitHub identity
- `github_connection_name` — see Step 2
- `alpaca_api_key_id`, `alpaca_api_key_secret`, `tiingo_api_token` — your API credentials

---

## Step 2 — Connect GitHub to Cloud Build

This must be done **manually in the console** before terraform apply.

1. Go to https://console.cloud.google.com/cloud-build/triggers/connect
2. Select **GitHub (Cloud Build GitHub App)**
3. Authorize and choose your repository
4. Set a connection name (e.g. `github-connection`) — use the same name in `terraform.tfvars`

---

## Step 3 — Bootstrap the state bucket (first apply only)

`backend.tf` is commented out on purpose. The GCS bucket must exist before Terraform can use it as a backend.

```bash
cd infra

# Initialize with local state
terraform init

# Create only the state bucket
terraform apply -target=module.state
```

When prompted, type `yes`.

---

## Step 4 — Enable the GCS backend

Edit `infra/backend.tf` — uncomment the block and replace `<PROJECT_ID>`:

```hcl
terraform {
  backend "gcs" {
    bucket = "YOUR_PROJECT_ID-terraform-state-bucket"
    prefix = ""
  }
}
```

Then migrate local state to GCS:

```bash
terraform init -migrate-state
# Type "yes" when asked to copy state
```

---

## Step 5 — Apply all infrastructure

```bash
terraform apply
```

Review the plan (you'll see ~30–40 resources), then type `yes`.

This creates:
- Cloud SQL instance + `mateo` database + `mateo` user
- Artifact Registry repository (`us-central1-docker.pkg.dev/<project>/mateo`)
- Service accounts: `builder1`, `cloudrun-production`, `scheduler-production`
- IAM bindings for each SA
- Secret Manager secrets: `alpaca-api-key-id`, `alpaca-api-key-secret`, `tiingo-api-token`
- Cloud Run service `mateo` (placeholder image — Cloud Build takes over)
- Cloud Run job `mateo-updater` (placeholder image — Cloud Build takes over)
- Cloud Scheduler job firing at 0, 6, 12, 18 EST
- Cloud Build trigger on `main`

At the end, Terraform prints `web_service_url` — the public URL of your app.

---

## Step 6 — First deploy

Push to `main` (or manually trigger the Cloud Build trigger in the console).
Cloud Build will:
1. Build the web image (`Dockerfile`)
2. Build the updater image (`Dockerfile.updater`)
3. Push both to Artifact Registry
4. Deploy the Cloud Run service
5. Update the Cloud Run job image

Wait ~5 minutes for the build to complete, then visit the URL from Step 5.

---

## Step 7 — Seed the database

The Cloud SQL instance is only reachable via the Cloud SQL Auth Proxy or from Cloud Shell.

**Option A — Cloud Shell (easiest):**
```bash
# In GCP Cloud Shell
gcloud sql connect <PROJECT_ID>-pg --user=mateo --database=mateo
# Run your schema DDL here
```

**Option B — Cloud SQL Auth Proxy (local machine):**
```bash
# Install: https://cloud.google.com/sql/docs/postgres/sql-proxy
cloud-sql-proxy <PROJECT_ID>:us-central1:<PROJECT_ID>-pg

# In another terminal:
DATABASE_URL="postgresql://mateo:<password>@127.0.0.1:5432/mateo" yarn seed-db
```

---

## Day-to-day Operations

| Task | Command |
|------|---------|
| Re-apply infrastructure changes | `cd infra && terraform apply` |
| Rotate an API key | Update `terraform.tfvars`, run `terraform apply` — Secret Manager gets a new version |
| Trigger a manual data update | GCP Console → Cloud Run → Jobs → `mateo-updater` → Execute |
| View web app logs | GCP Console → Cloud Run → Services → `mateo` → Logs |
| View updater logs | GCP Console → Cloud Run → Jobs → `mateo-updater` → Execution history |

---

## Destroying Everything

```bash
cd infra
terraform destroy
```

> ⚠️ This deletes the Cloud SQL instance and all data. The `deletion_protection = false`
> setting in `shared/cloudsql.tf` means Terraform won't prompt twice — be sure.
