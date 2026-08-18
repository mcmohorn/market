# Dedicated service account for Cloud Scheduler to invoke the Cloud Run Job
resource "google_service_account" "scheduler_sa" {
  project      = var.project_id
  account_id   = "scheduler-${var.env}"
  display_name = "Scheduler SA (${var.env})"
  description  = "Service account used by Cloud Scheduler to invoke the updater Cloud Run Job"
}

# Grant the scheduler SA permission to run Cloud Run Jobs
resource "google_project_iam_member" "scheduler_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.scheduler_sa.email}"
}

# Cloud Run Job — runs server/update.ts at 0, 6, 12, 18 EST every day.
# API keys are mounted from Secret Manager (not stored as plaintext).
# Cloud Build updates the image on push; lifecycle.ignore_changes prevents
# Terraform from reverting back to the placeholder on subsequent applies.
resource "google_cloud_run_v2_job" "updater" {
  name                = "mateo-updater"
  location            = "us-central1"
  project             = var.project_id
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.cloudrun_sa.email
      max_retries     = 1
      timeout         = "3600s"

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.cloudsql_connection_name]
        }
      }

      containers {
        # Placeholder — Cloud Build replaces this on first push to main.
        image = "us-central1-docker.pkg.dev/${var.project_id}/mateo/mateo-updater:latest"

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
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

        # API keys sourced from Secret Manager at runtime.
        env {
          name = "ALPACA_API_KEY_ID"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.alpaca_api_key_id.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "ALPACA_API_KEY_SECRET"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.alpaca_api_key_secret.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "TIINGO_API_TOKEN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.tiingo_api_token.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  # Cloud Build updates the image; Terraform must not revert it.
  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.cloudrun_alpaca_key_id,
    google_secret_manager_secret_iam_member.cloudrun_alpaca_key_secret,
    google_secret_manager_secret_iam_member.cloudrun_tiingo_token,
  ]
}

# Cloud Scheduler — fires at 0, 6, 12, 18 EST every day
resource "google_cloud_scheduler_job" "updater" {
  project          = var.project_id
  region           = "us-central1"
  name             = "mateo-updater-schedule"
  description      = "Trigger the MATEO updater job at 0, 6, 12, 18 EST daily"
  schedule         = "0 0,6,12,18 * * *"
  time_zone        = "America/New_York"
  attempt_deadline = "320s"

  http_target {
    http_method = "POST"
    uri         = "https://us-central1-run.googleapis.com/v2/projects/${var.project_id}/locations/us-central1/jobs/${google_cloud_run_v2_job.updater.name}:run"

    oidc_token {
      service_account_email = google_service_account.scheduler_sa.email
      audience              = "https://us-central1-run.googleapis.com/"
    }
  }
}
