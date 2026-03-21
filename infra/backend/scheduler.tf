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

# Cloud Run Job — runs server/update.ts every 6 hours
resource "google_cloud_run_v2_job" "updater" {
  name     = "mateo-updater"
  location = "us-central1"
  project  = var.project_id

  template {
    template {
      service_account = google_service_account.cloudrun_sa.email
      max_retries     = 1
      timeout         = "3600s"

      containers {
        image = "us-central1-docker.pkg.dev/${var.project_id}/mateo/mateo-updater:latest"

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name  = "DATABASE_URL"
          value = "postgresql://mateo:${var.db_password}@/mateo?host=/cloudsql/${var.cloudsql_connection_name}"
        }

        env {
          name  = "ALPACA_API_KEY_ID"
          value = var.alpaca_api_key_id
        }

        env {
          name  = "ALPACA_API_KEY_SECRET"
          value = var.alpaca_api_key_secret
        }

        env {
          name  = "TIINGO_API_TOKEN"
          value = var.tiingo_api_token
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.cloudsql_connection_name]
        }
      }
    }
  }
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
