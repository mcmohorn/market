# Requires the Cloud Build GitHub App to be installed and the repository
# connected before applying. Connect at:
# https://console.cloud.google.com/cloud-build/triggers/connect

# data "google_cloudbuild_connection" "github" {
#   project  = var.project_id
#   location = "us-central1"
#   name     = var.github_connection_name
# }

resource "google_cloudbuildv2_repository" "app" {
  project           = var.project_id
  location          = "us-central1"
  name              = var.github_repo_name
  parent_connection = "gh-conn-1"
  remote_uri        = "https://github.com/${var.github_repo_owner}/${var.github_repo_name}.git"
}


resource "google_cloudbuild_trigger" "deploy_main" {
location        = "us-central1"
  name            = "deploy-${var.env}-on-push"
  description     = "Build and deploy MATEO to Cloud Run on push to ${var.branch}"
  service_account = var.cloudbuilder_sa_id

  repository_event_config {

  repository = google_cloudbuildv2_repository.app.id
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
