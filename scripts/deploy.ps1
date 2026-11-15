$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Exigir($nombre) {
  if (-not (Get-Command $nombre -ErrorAction SilentlyContinue)) {
    throw "No se encontró '$nombre'. Instálalo y vuelve a ejecutar este script."
  }
}

Exigir node
Exigir npm
Exigir aws

Write-Host "Cuenta que va a recibir el proyecto:"
aws sts get-caller-identity
npm install
npx serverless deploy

$region = "us-east-1"
$stack = "aulalibre-dev"
$outputs = aws cloudformation describe-stacks --stack-name $stack --region $region --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
$mapa = @{}
foreach ($salida in $outputs) { $mapa[$salida.OutputKey] = $salida.OutputValue }

$api = $mapa["HttpApiUrl"].TrimEnd("/")
$bucket = $mapa["FrontendBucketName"]
$distribucion = $mapa["DistributionId"]
$sitio = $mapa["FrontendUrl"]

$config = "// Generado por scripts/deploy.ps1`r`nwindow.AULALIBRE_API = `"$api`";`r`n"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $root "frontend\config.js"), $config, $utf8)

aws s3 sync (Join-Path $root "frontend") "s3://$bucket" --region $region --delete
aws s3 cp (Join-Path $root "frontend\index.html") "s3://$bucket/index.html" --region $region --cache-control "no-cache" --content-type "text/html; charset=utf-8"
aws s3 cp (Join-Path $root "frontend\config.js") "s3://$bucket/config.js" --region $region --cache-control "no-cache" --content-type "application/javascript; charset=utf-8"
aws s3 cp (Join-Path $root "frontend\styles.css") "s3://$bucket/styles.css" --region $region --cache-control "public,max-age=60" --content-type "text/css; charset=utf-8"
aws s3 cp (Join-Path $root "frontend\app.js") "s3://$bucket/app.js" --region $region --cache-control "public,max-age=60" --content-type "application/javascript; charset=utf-8"

if ($distribucion) {
  aws cloudfront create-invalidation --distribution-id $distribucion --paths "/*"
}

Write-Host ""
Write-Host "Sitio: $sitio"
Write-Host "API:   $api"
Write-Host "CloudFront tarda unos minutos en el primer despliegue. Si el sitio aún no abre, espera y recarga."
Write-Host "Cuando tomes la captura de la EC2, apágala con:  .\scripts\apagar-ec2.ps1"
