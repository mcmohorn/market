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
  source                = "./backend"
  env                   = "production"
  branch                = "main"
  project_name          = var.google_cloud_project_name
  cloudbuilder_sa_id    = module.shared.cloudbuilder_service_account_id
  cloudbuilder_sa_email = module.shared.cloudbuilder_service_account_email

}

