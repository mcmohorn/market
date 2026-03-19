variable "google_cloud_project_name" {
  type = string
}

variable "google_cloud_project_id" {
  type = string
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Password for the Cloud SQL postgres app user"
}

variable "github_repo_owner" {
  type        = string
  description = "GitHub organization or user that owns the repository"
}

variable "github_repo_name" {
  type        = string
  description = "GitHub repository name"
}

variable "github_connection_name" {
  type        = string
  description = "Name of the existing Cloud Build v2 GitHub connection"
}
