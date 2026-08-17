variable "google_cloud_project_name" {
  type        = string
  description = "Human-readable project name (used for labeling the state bucket)"
}

variable "google_cloud_project_id" {
  type        = string
  description = "GCP project ID (e.g. my-project-123456)"
}

variable "google_cloud_project_number" {
  type        = string
  description = "GCP project number — find it in the console Overview or via: gcloud projects describe <id> --format='value(projectNumber)'"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Password for the Cloud SQL postgres app user (mateo@mateo DB)"
}

variable "github_repo_owner" {
  type        = string
  description = "GitHub organization or username that owns the repository"
}

variable "github_repo_name" {
  type        = string
  description = "GitHub repository name (without the owner prefix)"
}

variable "github_connection_name" {
  type        = string
  description = "Name of the existing Cloud Build v2 GitHub connection — create it at: https://console.cloud.google.com/cloud-build/triggers/connect"
}

variable "alpaca_api_key_id" {
  type        = string
  description = "Alpaca API key ID (stored in Secret Manager)"
}

variable "alpaca_api_key_secret" {
  type        = string
  sensitive   = true
  description = "Alpaca API key secret (stored in Secret Manager)"
}

variable "tiingo_api_token" {
  type        = string
  sensitive   = true
  description = "Tiingo API token (stored in Secret Manager)"
}

variable "pro_whitelist" {
  type        = string
  default     = ""
  description = "Comma-separated email addresses with pro access. Leave empty to use the server's built-in default."
}
