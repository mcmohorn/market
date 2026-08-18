# Cloud Build v2 trigger — fires on push to the tracked branch.
# The GitHub connection must exist before terraform apply:
#   https://console.cloud.google.com/cloud-build/triggers/connect
#
# NOTE: the repository/trigger `location` below must match wherever the
# `github_connection_name` connection actually lives — the console flow does
# NOT default to us-central1 (it landed in northamerica-northeast2 here).
# Check with: gcloud builds connections list --region=<region> --project=<id>
# The deploy target region (Cloud SQL/Cloud Run/Artifact Registry) is
# independent of this and stays us-central1 via the _REGION substitution below.

resource "google_cloudbuildv2_repository" "app" {
  project           = var.project_id
  location          = "northamerica-northeast2"
  name              = var.github_repo_name
  parent_connection = var.github_connection_name
  remote_uri        = "https://github.com/${var.github_repo_owner}/${var.github_repo_name}.git"
}

resource "google_cloudbuild_trigger" "deploy_main" {
  name            = "deploy-${var.env}-on-push"
  description     = "Build and deploy MATEO to Cloud Run on push to ${var.branch}"
  location        = "northamerica-northeast2"
  service_account = var.cloudbuilder_sa_id

  repository_event_config {
    repository = google_cloudbuildv2_repository.app.id
    push {
      branch = "^${var.branch}$"
    }
  }

  filename = "cloudbuild.yaml"

  substitutions = {
    _REGION              = "us-central1"
    _SERVICE_NAME        = "mateo"
    _UPDATER_NAME        = "mateo-updater"
    _REPOSITORY          = "mateo"
    _CLOUDSQL_CONNECTION = var.cloudsql_connection_name
    _CLOUDRUN_SA         = google_service_account.cloudrun_sa.email
    _DB_PASSWORD         = var.db_password
    _PRO_WHITELIST       = var.pro_whitelist
  }
}
