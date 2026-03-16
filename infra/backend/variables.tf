variable "env" {
  type = string
}

variable "branch" {
  type = string
}

variable "project_id" {
  type = string
}

variable "project_name" {
  type = string
}

variable "cloudbuilder_sa_id" {
  type = string
}

variable "cloudbuilder_sa_email" {
  type = string
}

variable "cloudsql_instance_name" {
  type        = string
  description = "Name of the shared Cloud SQL instance"
}

variable "cloudsql_connection_name" {
  type        = string
  description = "Connection name of the shared Cloud SQL instance (project:region:instance)"
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