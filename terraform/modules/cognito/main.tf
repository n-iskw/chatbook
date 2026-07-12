resource "aws_cognito_user_pool" "this" {
  name                = var.user_pool_name
  deletion_protection = "INACTIVE"

  # 実際の AWS でもこの値は ForceNew のため明示しておく。
  username_attributes = ["email"]

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  # 既知の制限（moto 使用時）: moto の describe_user_pool は
  # software_token_mfa_configuration をレスポンスに含めないため、明示していても
  # `terraform plan` は常に1件の差分 (このブロックの追加) を報告し続ける。実害は
  # なく、実際の AWS に対しては正しく安定する。moto 固有の既知の非互換として許容する。
  software_token_mfa_configuration {
    enabled = false
  }
}

resource "aws_cognito_user_pool_client" "this" {
  name                = var.user_pool_client_name
  user_pool_id        = aws_cognito_user_pool.this.id
  generate_secret     = false
  explicit_auth_flows = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_cognito_user" "test" {
  count = var.create_test_user ? 1 : 0

  user_pool_id   = aws_cognito_user_pool.this.id
  username       = var.test_user_email
  password       = var.test_user_password
  message_action = "SUPPRESS"

  attributes = {
    email          = var.test_user_email
    email_verified = true
  }
}
