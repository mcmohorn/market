# Cloud Run web service — serves the Express + React app.
#
# Terraform creates the service shell (Cloud SQL wiring, SA, IAM).
# Cloud Build owns the image and env vars after first deploy:
#   lifecycle.ignore_changes = [template] prevents Terraform from
#   overwriting what Cloud Build sets on every push.

resource "google_cloud_run_v2_service" "web" {
  name     = "mateo"
  location = "us-central1"
  project  = var.project_id

  template {
    service_account = google_service_account.cloudrun_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.cloudsql_connection_name]
      }
    }

    containers {
      # Placeholder image — Cloud Build replaces this on first push to main.
      image = "gcr.io/cloudrun/placeholder"

      resources {
        limits = {
          cpu    = "1"
          memory = "2Gi"
        }
        cpu_idle = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "DATABASE_URL"
        value = "postgresql://mateo:${var.db_password}@/mateo?host=/cloudsql/${var.cloudsql_connection_name}"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PRO_WHITELIST"
        value = var.pro_whitelist
      }
    }
  }

  # Cloud Build fully manages the template after initial creation.
  lifecycle {
    ignore_changes = [template]
  }

  depends_on = [google_project_iam_member.cloudrun_cloudsql_client]
}

# Allow unauthenticated public access.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = "us-central1"
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "web_service_url" {
  value       = google_cloud_run_v2_service.web.uri
  description = "Public URL of the MATEO web service"
}
