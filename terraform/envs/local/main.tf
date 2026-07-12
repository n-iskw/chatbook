terraform {
  required_version = ">= 1.15"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # backend は明示せず local backend (terraform.tfstate をこのディレクトリ直下に
  # 生成、.gitignore 済み)。使い捨て可能な state として扱う。
}

variable "aws_region" {
  description = "AWS リージョン。moto を使う場合は任意の値でよい"
  type        = string
  default     = "ap-northeast-1"
}

variable "cognito_endpoint" {
  description = "ローカル Cognito エミュレーター (moto) のエンドポイント"
  type        = string
  default     = "http://localhost:5001"
}

provider "aws" {
  region = var.aws_region

  access_key                  = "local"
  secret_key                  = "local"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    cognitoidp = var.cognito_endpoint
  }
}

module "cognito" {
  source = "../../modules/cognito"

  create_test_user = true
}
