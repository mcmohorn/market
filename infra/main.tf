provider "google" {
  project = var.google_cloud_project_id
  region  = "us-central1"
  zone    = "us-central1-c"
}

module "shared" {
  source     = "./shared"
  project_id = var.google_cloud_project_id
}

module "backend" {
  source     = "./backend"
  env        = "production"
  branch     = "main"
  project_id = var.google_cloud_project_id

  cloudbuilder_sa_id = module.shared.cloudbuilder_service_account_id

  cloudsql_instance_name   = module.shared.cloudsql_instance_name
  cloudsql_connection_name = module.shared.cloudsql_connection_name

  db_password            = var.db_password
  github_repo_owner      = var.github_repo_owner
  github_repo_name       = var.github_repo_name
  github_connection_name = var.github_connection_name

  vite_firebase_api_key             = var.vite_firebase_api_key
  vite_firebase_app_id              = var.vite_firebase_app_id
  vite_firebase_auth_domain         = var.vite_firebase_auth_domain
  vite_firebase_messaging_sender_id = var.vite_firebase_messaging_sender_id
  vite_firebase_project_id          = var.vite_firebase_project_id
}
