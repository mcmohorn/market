# Requires the Cloud Build v2 GitHub connection and repository to exist.
# Connect at: https://console.cloud.google.com/cloud-build/triggers/connect
resource "google_cloudbuild_trigger" "deploy_main" {
  name            = "deploy-${var.env}-on-push"
  description     = "Build and deploy MATEO to Cloud Run on push to ${var.branch}"
  location        = "us-central1"
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
    _REPOSITORY          = "mateo"
    _CLOUDSQL_CONNECTION = var.cloudsql_connection_name
    _CLOUDRUN_SA         = google_service_account.cloudrun_sa.email
    _DB_PASSWORD         = var.db_password

    # Firebase client config — baked into the Docker image at build time
    _VITE_FIREBASE_API_KEY              = var.vite_firebase_api_key
    _VITE_FIREBASE_APP_ID               = var.vite_firebase_app_id
    _VITE_FIREBASE_AUTH_DOMAIN          = var.vite_firebase_auth_domain
    _VITE_FIREBASE_MESSAGING_SENDER_ID  = var.vite_firebase_messaging_sender_id
    _VITE_FIREBASE_PROJECT_ID           = var.vite_firebase_project_id
  }
}

data "google_cloudbuildv2_connection" "github" {
  project  = var.project_id
  location = "us-central1"
  name     = var.github_connection_name
}

resource "google_cloudbuildv2_repository" "app" {
  project           = var.project_id
  location          = "us-central1"
  name              = var.github_repo_name
  parent_connection = data.google_cloudbuildv2_connection.github.id
  remote_uri        = "https://github.com/${var.github_repo_owner}/${var.github_repo_name}.git"
}
