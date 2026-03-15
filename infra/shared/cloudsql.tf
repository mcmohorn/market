resource "google_sql_database_instance" "main" {
  name             = "${var.project_id}-pg"
  database_version = "POSTGRES_15"
  region           = "us-central1"

  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_type         = "PD_HDD"
    disk_size         = 10

    backup_configuration {
      enabled = false
    }

    ip_configuration {
      ipv4_enabled = true
    }
  }

  deletion_protection = false
}

resource "google_artifact_registry_repository" "app" {
  location      = "us-central1"
  repository_id = "mateo"
  format        = "DOCKER"
  description   = "Docker images for MATEO app"
}

output "cloudsql_instance_name" {
  value = google_sql_database_instance.main.name
}

output "cloudsql_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "artifact_registry_repo" {
  value = "us-central1-docker.pkg.dev/${var.project_id}/mateo"
}
