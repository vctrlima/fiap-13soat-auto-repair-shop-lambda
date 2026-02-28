# Lambda Infrastructure - CPF Authentication

Terraform infrastructure and application code for the CPF-based authentication Lambda function used by the Auto Repair Shop project.

## Architecture

This Lambda function handles customer authentication via CPF. It is invoked by the API Gateway (`POST /api/auth/cpf`) provisioned in the [K8s Infrastructure](https://github.com/fiap-13soat/fiap-13soat-auto-repair-shop-k8s) repository.

```
API Gateway (K8s repo) → Lambda (this repo) → RDS PostgreSQL (DB repo)
```

## Project Structure

```
fiap-13soat-auto-repair-shop-lambda/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint, test, terraform validate on PRs
│       └── cd.yml              # Build, deploy infra, deploy code on merge
├── terraform/
│   ├── main.tf                 # Lambda resources + remote state
│   ├── variables.tf            # Input variables
│   ├── outputs.tf              # Exported values (consumed by K8s repo)
│   ├── placeholder.zip         # Initial dummy deployment package
│   └── environments/
│       ├── staging/
│       │   └── terraform.tfvars
│       └── production/
│           └── terraform.tfvars
├── src/
│   └── handlers/
│       ├── auth-handler.ts     # Lambda handler
│       └── auth-handler.test.ts
├── package.json
├── tsconfig.json
├── jest.config.js
├── eslint.config.mjs
└── README.md
```

## Prerequisites

- Node.js >= 22.x
- Terraform >= 1.5.0
- AWS CLI configured with appropriate credentials
- S3 bucket for state: `auto-repair-shop-terraform-state`
- DynamoDB table for locking: `auto-repair-shop-terraform-locks`
- K8s Infrastructure must be provisioned first (this project reads its Terraform remote state for VPC/subnet info)

## Local Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Create deployment package
npm run package
```

## Terraform Usage

```bash
cd terraform

# Initialize
terraform init

# Plan (staging)
terraform plan -var-file=environments/staging/terraform.tfvars

# Plan (production)
terraform plan -var-file=environments/production/terraform.tfvars -out=tfplan

# Apply
terraform apply tfplan
```

### Required Terraform Variables (via CI/CD secrets or `-var`)

| Variable                  | Description           | Sensitive |
| ------------------------- | --------------------- | --------- |
| `db_host`                 | RDS database hostname | No        |
| `db_username`             | Database username     | Yes       |
| `db_password`             | Database password     | Yes       |
| `jwt_access_token_secret` | JWT signing secret    | Yes       |

## Key Outputs

| Output          | Description                      |
| --------------- | -------------------------------- |
| `function_arn`  | Lambda function ARN              |
| `function_name` | Lambda function name             |
| `invoke_arn`    | Invoke ARN (used by API Gateway) |

These outputs are consumed by the K8s Infrastructure repository via `terraform_remote_state`.

## Deployment

Deployed automatically via GitHub Actions:

- **CI** (`.github/workflows/ci.yml`): Runs on pull requests — lint, test, terraform validate
- **CD** (`.github/workflows/cd.yml`): Runs on merge to `main` — build, deploy infra (terraform apply), deploy function code

### Deploy Order

> **Important**: This Lambda infrastructure must be provisioned **before** the K8s infrastructure, since the K8s repo reads Lambda outputs via `terraform_remote_state`.

### Required GitHub Secrets

| Secret                    | Description        |
| ------------------------- | ------------------ |
| `AWS_ACCESS_KEY_ID`       | AWS credentials    |
| `AWS_SECRET_ACCESS_KEY`   | AWS credentials    |
| `DB_HOST`                 | RDS hostname       |
| `DB_USERNAME`             | Database username  |
| `DB_PASSWORD`             | Database password  |
| `JWT_ACCESS_TOKEN_SECRET` | JWT signing secret |
