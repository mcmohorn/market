# Requires the Cloud Build GitHub App to be installed and the repository
# connected before applying. Connect at:
# https://console.cloud.google.com/cloud-build/triggers/connect
resource "google_cloudbuild_trigger" "deploy_main" {
  name            = "deploy-${var.env}-on-push"
  description     = "Build and deploy MATEO to Cloud Run on push to ${var.branch}"
  service_account = var.cloudbuilder_sa_id

  github {
    owner = var.github_repo_owner
    name  = var.github_repo_name
    push {
      branch = "^${var.branch}$"
    }
  }

  filename = "cloudbuild.yaml"

  # These override the defaults defined in cloudbuild.yaml
  substitutions = {
    _REGION              = "us-central1"
    _SERVICE_NAME        = "mateo"
    _REPOSITORY          = "mateo"
    _CLOUDSQL_CONNECTION = var.cloudsql_connection_name
    _CLOUDRUN_SA         = google_service_account.cloudrun_sa.email
    _DB_PASSWORD         = var.db_password
  }
}
