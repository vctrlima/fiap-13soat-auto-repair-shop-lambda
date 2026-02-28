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

# --- Database ---
variable "db_host" {
  description = "RDS database hostname"
  type        = string
}

variable "db_port" {
  description = "RDS database port"
  type        = number
  default     = 5432
}

variable "db_name" {
  description = "Name of the PostgreSQL database"
  type        = string
  default     = "auto_repair_shop"
}

variable "db_username" {
  description = "Master username for the database"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Master password for the database"
  type        = string
  sensitive   = true
}

# --- Auth ---
variable "jwt_access_token_secret" {
  description = "Secret key for JWT access tokens"
  type        = string
  sensitive   = true
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
