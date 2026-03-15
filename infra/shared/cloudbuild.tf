
resource "google_service_account" "cloudbuild_service_account" {
  account_id   = "builder"
  display_name = "builder"
  description  = "Cloud builder service account"

}

resource "google_project_iam_member" "act_as" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.cloudbuild_service_account.email}"
}

resource "google_project_iam_member" "logs_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloudbuild_service_account.email}"
}

resource "google_project_iam_member" "cloudbuild_role_storage_object_creator" {
  project = var.project_id
  role    = "roles/storage.objectCreator"
  member  = "serviceAccount:${google_service_account.cloudbuild_service_account.email}"
}

resource "google_project_iam_member" "cloudbuild_role_storage_object_viewer" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.cloudbuild_service_account.email}"
}

resource "google_project_iam_member" "cloudbuild_role_builder" {
  project = var.project_id
  role    = "roles/cloudbuild.builds.builder"
  member  = "serviceAccount:${google_service_account.cloudbuild_service_account.email}"
}



resource "google_project_iam_custom_role" "cloud_sql_instance_get_role" {
  role_id     = "CloudSqlInstanceGetter"
  title       = "Cloud SQL Instance Getter"
  description = "Provides permission to get Cloud SQL instance details"
  permissions = [
    "cloudsql.instances.get",
    "cloudsql.instances.connect"
  ]
  project = var.project_id
}


resource "google_project_iam_custom_role" "cloudrun_role_for_cloudbuilder" {
  role_id     = "CloudRunForCloudBuild"
  title       = "Cloud Run Things for Cloudbuiilder"
  description = "Provides necessary permissions for Cloudbuilder SA to do CloudRun things"
  permissions = [
    "run.services.get",
    "run.services.create",
    "run.services.update"
  ]
  project = var.project_id
}

resource "google_project_iam_member" "cloudbuild_role_get_cloudsql_instances" {
  project = var.project_id
  role    = google_project_iam_custom_role.cloud_sql_instance_get_role.id

  member = "serviceAccount:${google_service_account.cloudbuild_service_account.email}"
}

resource "google_project_iam_member" "cloudbuild_role_cloudrun" {
  project = var.project_id
  role    = google_project_iam_custom_role.cloudrun_role_for_cloudbuilder.id

  member = "serviceAccount:${google_service_account.cloudbuild_service_account.email}"
}

resource "google_project_iam_member" "cloudbuild_role_artifact_registry_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cloudbuild_service_account.email}"
}

output "cloudbuilder_service_account_id" {
  value = google_service_account.cloudbuild_service_account.id
}

output "cloudbuilder_service_account_email" {
  value = google_service_account.cloudbuild_service_account.email
}

