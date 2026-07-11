terraform {
  required_version = ">= 1.15"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "cognito_local_endpoint" {
  description = "cognito-local のエンドポイント。空文字なら実際の AWS Cognito を使う（本番向け）"
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS リージョン。cognito-local を使う場合は任意の値でよい"
  type        = string
  default     = "ap-northeast-1"
}

variable "create_test_user" {
  description = "動作確認用のテストユーザーを作成するか（ローカル専用。本番では false のまま）"
  type        = bool
  default     = false
}

locals {
  using_cognito_local = var.cognito_local_endpoint != ""
}

provider "aws" {
  region = var.aws_region

  access_key                  = local.using_cognito_local ? "local" : null
  secret_key                  = local.using_cognito_local ? "local" : null
  skip_credentials_validation = local.using_cognito_local
  skip_metadata_api_check     = local.using_cognito_local
  skip_requesting_account_id  = local.using_cognito_local

  dynamic "endpoints" {
    for_each = local.using_cognito_local ? [1] : []
    content {
      cognitoidp = var.cognito_local_endpoint
    }
  }
}
