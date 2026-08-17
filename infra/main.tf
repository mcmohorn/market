terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.google_cloud_project_id
  region  = "us-central1"
  zone    = "us-central1-c"
}

module "state" {
  source       = "./state"
  project_id   = var.google_cloud_project_id
  project_name = var.google_cloud_project_name
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

  alpaca_api_key_id     = var.alpaca_api_key_id
  alpaca_api_key_secret = var.alpaca_api_key_secret
  tiingo_api_token      = var.tiingo_api_token
  pro_whitelist         = var.pro_whitelist
}

output "web_service_url" {
  value       = module.backend.web_service_url
  description = "Public URL of the deployed MATEO web service"
}
