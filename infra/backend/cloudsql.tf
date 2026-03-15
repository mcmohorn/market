resource "google_sql_database" "mateo" {
  name     = "mateo"
  instance = var.cloudsql_instance_name
}

resource "google_sql_user" "app" {
  name     = "mateo"
  instance = var.cloudsql_instance_name
  password = var.db_password
}

# Service account for the Cloud Run service to connect to Cloud SQL
resource "google_service_account" "cloudrun_sa" {
  account_id   = "cloudrun-${var.env}"
  display_name = "Cloud Run SA (${var.env})"
  description  = "Service account used by the Cloud Run service"
}

resource "google_project_iam_member" "cloudrun_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

output "cloudrun_sa_email" {
  value = google_service_account.cloudrun_sa.email
}
