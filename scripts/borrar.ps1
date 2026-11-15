$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$region = "us-east-1"
$stack = "aulalibre-dev"

$bucket = aws cloudformation describe-stacks --stack-name $stack --region $region --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text
if ($bucket) {
  aws s3 rm "s3://$bucket" --recursive --region $region
}

npx serverless remove
Write-Host "Pila eliminada. Revisa la consola de Billing por si quedó algún cargo residual."
