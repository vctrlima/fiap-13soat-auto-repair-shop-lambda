# =============================================================================
# Lambda Infrastructure - CPF Authentication Function
# Standalone Terraform project for the authentication Lambda
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "auto-repair-shop-terraform-state"
    region         = "us-east-2"
    dynamodb_table = "auto-repair-shop-terraform-locks"
    encrypt        = true
    # key is passed dynamically via -backend-config in CI/CD:
    # staging:    key = "lambda-infrastructure/staging/terraform.tfstate"
    # production: key = "lambda-infrastructure/production/terraform.tfstate"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = var.tags
  }
}

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  resource_suffix = random_id.suffix.hex
}

# -----------------------------------------------------------------------------
# Remote State - K8s Infrastructure (VPC, Subnets)
# -----------------------------------------------------------------------------

data "terraform_remote_state" "k8s" {
  backend = "s3"

  config = {
    bucket = "auto-repair-shop-terraform-state"
    key    = "k8s-infrastructure/terraform.tfstate"
    region = "us-east-2"
  }
}

# -----------------------------------------------------------------------------
# Security Group for Lambda (VPC access to RDS)
# -----------------------------------------------------------------------------

resource "aws_security_group" "lambda" {
  name_prefix = "${var.project_name}-${var.environment}-lambda-auth-"
  vpc_id      = data.terraform_remote_state.k8s.outputs.vpc_id
  description = "Security group for ${var.environment} authentication Lambda function"

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-lambda-auth-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# -----------------------------------------------------------------------------
# IAM Role for Lambda
# -----------------------------------------------------------------------------

resource "aws_iam_role" "lambda_auth" {
  name = "${var.project_name}-${var.environment}-lambda-auth-${local.resource_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-lambda-auth-role"
  }
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_auth.name
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.lambda_auth.name
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda_auth" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-auth-${local.resource_suffix}"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-lambda-auth-logs"
  }
}

# -----------------------------------------------------------------------------
# Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "auth" {
  function_name = "${var.project_name}-${var.environment}-auth-${local.resource_suffix}"
  description   = "CPF-based authentication for ${var.project_name} (${var.environment})"
  role          = aws_iam_role.lambda_auth.arn
  handler       = "handlers/auth-handler.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 256

  # The deployment package is uploaded via CI/CD
  # Initial placeholder: use a dummy zip
  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")

  vpc_config {
    subnet_ids         = data.terraform_remote_state.k8s.outputs.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DB_HOST                 = var.db_host
      DB_PORT                 = tostring(var.db_port)
      DB_NAME                 = var.db_name
      DB_USER                 = var.db_username
      DB_PASSWORD             = var.db_password
      JWT_ACCESS_TOKEN_SECRET = var.jwt_access_token_secret
      JWT_EXPIRES_IN          = "15m"
      NODE_ENV                = var.environment
    }
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.lambda_auth.name
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-auth-lambda"
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic,
    aws_iam_role_policy_attachment.lambda_vpc,
    aws_cloudwatch_log_group.lambda_auth,
  ]
}
