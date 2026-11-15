$ErrorActionPreference = "Stop"
$region = "us-east-1"
$id = aws cloudformation describe-stack-resources --stack-name aulalibre-dev --region $region --query "StackResources[?ResourceType=='AWS::EC2::Instance'].PhysicalResourceId" --output text
if (-not $id) { throw "No encontré la instancia en la pila aulalibre-dev." }
aws ec2 stop-instances --instance-ids $id --region $region
Write-Host "Instancia $id en proceso de apagado. El resto del proyecto sigue disponible."
