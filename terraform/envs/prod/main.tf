terraform {
  required_version = ">= 1.15"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Cloudflare R2 (S3 互換) に state を保管する。bucket/endpoint 等の接続情報は
  # リポジトリに含めず `terraform init -backend-config=backend.hcl` で注入する
  # (backend.hcl.example を参照して各自 backend.hcl を作成、gitignore 済み)。
  backend "s3" {}
}

variable "aws_region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

provider "aws" {
  region = var.aws_region
}

module "cognito" {
  source = "../../modules/cognito"
}
