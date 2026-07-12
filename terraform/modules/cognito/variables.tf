variable "create_test_user" {
  description = "動作確認用のテストユーザーを作成するか（ローカル専用。本番では false のまま）"
  type        = bool
  default     = false
}

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
