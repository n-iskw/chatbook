variable "user_pool_name" {
  description = "Cognito User Pool 名"
  type        = string
  default     = "local-dev-pool"
}

variable "user_pool_client_name" {
  description = "Cognito User Pool Client 名"
  type        = string
  default     = "local-dev-client"
}

variable "test_user_email" {
  description = "create_test_user=true のとき作成するテストユーザーのメールアドレス"
  type        = string
  default     = "test@example.com"
}

variable "test_user_password" {
  description = "create_test_user=true のとき作成するテストユーザーの恒久パスワード"
  type        = string
  default     = "Passw0rd1!"
  sensitive   = true
}

resource "aws_cognito_user_pool" "this" {
  # 既知の制限（cognito-local 使用時）: cognito-local は DeletionProtection を
  # 保持/返却しないため、deletion_protection を明示していても `terraform plan`
  # は常に1件の差分 (INACTIVE への更新) を報告し続ける。実害はなく、実際の AWS
  # に対しては正しく安定する。cognito-local 固有の既知の非互換として許容する。
  name                = var.user_pool_name
  deletion_protection = "INACTIVE"

  # cognito-local はプールの UsernameAttributes を明示指定しないと ["email"] を
  # 独自にデフォルト適用し、terraform plan のたびに差分 (置き換え) が発生する。
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
