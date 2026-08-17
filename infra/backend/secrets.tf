# Secret Manager — stores sensitive API keys for the updater job.
# The Cloud Run SA is granted accessor on each secret so it can
# mount them as env vars at runtime (no plaintext in job definition).

# ── Alpaca API Key ID ────────────────────────────────────────────────────────

resource "google_secret_manager_secret" "alpaca_api_key_id" {
  project   = var.project_id
  secret_id = "alpaca-api-key-id"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "alpaca_api_key_id" {
  secret      = google_secret_manager_secret.alpaca_api_key_id.id
  secret_data = var.alpaca_api_key_id
}

resource "google_secret_manager_secret_iam_member" "cloudrun_alpaca_key_id" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.alpaca_api_key_id.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# ── Alpaca API Key Secret ────────────────────────────────────────────────────

resource "google_secret_manager_secret" "alpaca_api_key_secret" {
  project   = var.project_id
  secret_id = "alpaca-api-key-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "alpaca_api_key_secret" {
  secret      = google_secret_manager_secret.alpaca_api_key_secret.id
  secret_data = var.alpaca_api_key_secret
}

resource "google_secret_manager_secret_iam_member" "cloudrun_alpaca_key_secret" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.alpaca_api_key_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# ── Tiingo API Token ─────────────────────────────────────────────────────────

resource "google_secret_manager_secret" "tiingo_api_token" {
  project   = var.project_id
  secret_id = "tiingo-api-token"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "tiingo_api_token" {
  secret      = google_secret_manager_secret.tiingo_api_token.id
  secret_data = var.tiingo_api_token
}

resource "google_secret_manager_secret_iam_member" "cloudrun_tiingo_token" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.tiingo_api_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}
