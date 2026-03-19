# Secret Manager secret for the Firebase Admin SDK service account JSON.
# After applying, populate the secret value manually:
#   gcloud secrets versions add google-credentials-json \
#     --data-file=/path/to/service-account.json \
#     --project=PROJECT_ID
resource "google_secret_manager_secret" "google_credentials" {
  project   = var.project_id
  secret_id = "google-credentials-json"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "cloudrun_sa_secret_access" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.google_credentials.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}
