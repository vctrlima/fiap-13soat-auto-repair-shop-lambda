# =============================================================================
# Lambda Infrastructure - Variables
# =============================================================================

# --- Project ---
variable "project_name" {
  description = "Name of the project, used for resource naming"
  type        = string
  default     = "auto-repair-shop"
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be one of: dev, staging, production."
  }
}

variable "region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"
}

# --- Auth ---
variable "jwt_access_token_secret" {
  description = "Secret key for JWT access tokens"
  type        = string
  sensitive   = true
}

variable "customer_service_url" {
  description = "Internal URL of the customer-vehicle-service (via ALB), e.g. http://alb-dns/internal"
  type        = string
}

# --- Tags ---
variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project   = "auto-repair-shop"
    ManagedBy = "terraform"
  }
}
