# ── Remote State Bootstrap ────────────────────────────────────────────────────
#
# FIRST APPLY: leave this block commented out.
#   Run:  terraform init && terraform apply -target=module.state
#   This creates the GCS bucket used to store state.
#
# SECOND APPLY: uncomment the block below, replace <PROJECT_ID> with your
#   actual project ID, then run:
#   terraform init -migrate-state   (answer "yes" to copy local → GCS)
#   terraform apply                 (applies the rest of the infrastructure)
#
# After migration all state lives in GCS — safe to delete the local
# terraform.tfstate file.
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  backend "gcs" {
    bucket = "mateo-trader-terraform-state-bucket"
    prefix = ""
  }
}
