# Firebase Admin SDK on Cloud Run uses Application Default Credentials (ADC)
# from the built-in Cloud Run service account — no secrets needed at runtime.
#
# If you need to grant the Cloud Run SA access to Firebase Admin APIs beyond
# token verification (e.g. creating users, FCM), add roles here:
#
# resource "google_project_iam_member" "cloudrun_firebase_viewer" {
#   project = var.project_id
#   role    = "roles/firebase.viewer"
#   member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
# }
