resource "google_storage_bucket" "terraform_state" {
  name          = "${var.project_id}-terraform-state-bucket"
  location      = "US"
  project = var.project_id
  force_destroy = false

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true
}