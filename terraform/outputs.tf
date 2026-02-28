# =============================================================================
# Lambda Infrastructure - Outputs
# =============================================================================

output "function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.auth.arn
}

output "function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.auth.function_name
}

output "invoke_arn" {
  description = "Lambda invoke ARN (used by API Gateway)"
  value       = aws_lambda_function.auth.invoke_arn
}
