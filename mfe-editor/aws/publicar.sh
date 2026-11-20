#!/usr/bin/env bash
set -euo pipefail

# Ejecutar en CloudShell de Javier una vez autorizado el despliegue.
expected_account="${1:?Indica como primer argumento el ID de la cuenta AWS de Javier.}"
region="${2:-us-east-2}"
stack_name="mfe-todos-editor"
editor_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! "$expected_account" =~ ^[0-9]{12}$ ]]; then
  printf '%s\n' 'El ID de cuenta debe contener 12 dígitos.' >&2
  exit 1
fi
actual_account="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$actual_account" != "$expected_account" ]]; then
  printf '%s\n' 'La sesión AWS pertenece a una cuenta diferente de la indicada.' >&2
  exit 1
fi
if [[ ! -f "$editor_dir/dist/todo-editor.js" || ! -d "$editor_dir/dist/assets" ]]; then
  printf '%s\n' 'Falta dist/. Ejecuta npm ci y npm run build antes de preparar el paquete.' >&2
  exit 1
fi

aws cloudformation validate-template \
  --template-body "file://$editor_dir/aws/editor.yaml" --region "$region" >/dev/null
aws cloudformation deploy \
  --template-file "$editor_dir/aws/editor.yaml" \
  --stack-name "$stack_name" --region "$region" --no-fail-on-empty-changeset

stack_output() {
  aws cloudformation describe-stacks --stack-name "$stack_name" --region "$region" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}

bucket="$(stack_output BucketName)"
distribution="$(stack_output DistributionId)"
editor_url="$(stack_output EditorUrl)"

# Primero los archivos inmutables. La entrada se cambia cuando sus dependencias ya existen.
aws s3 cp "$editor_dir/dist/assets/" "s3://$bucket/assets/" --recursive \
  --exclude '*' --include '*.js' --content-type 'application/javascript; charset=utf-8' \
  --cache-control 'public,max-age=31536000,immutable' --region "$region"
aws s3 cp "$editor_dir/dist/index.html" "s3://$bucket/index.html" \
  --content-type 'text/html; charset=utf-8' --cache-control 'public,max-age=0,must-revalidate' --region "$region"
aws s3 cp "$editor_dir/dist/todo-editor.js" "s3://$bucket/todo-editor.js" \
  --content-type 'application/javascript; charset=utf-8' \
  --cache-control 'public,max-age=0,must-revalidate' --region "$region"

invalidation="$(aws cloudfront create-invalidation --distribution-id "$distribution" \
  --paths '/todo-editor.js' '/index.html' '/' --query Invalidation.Id --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$distribution" --id "$invalidation"
printf 'URL del Editor para el registry de Juan\n%s\n' "$editor_url"
