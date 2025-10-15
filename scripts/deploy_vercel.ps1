<#
deploy_vercel.ps1

Helper script to deploy this Next.js project to Vercel from your local machine.
This is an interactive helper that calls the Vercel CLI. It does NOT store secrets.

Usage:
  1) Install Vercel CLI: npm i -g vercel
  2) Run this script: ./scripts/deploy_vercel.ps1

Notes:
- The script can use an environment variable VERCEL_TOKEN for non-interactive login.
- You must still configure environment variables in the Vercel dashboard (or using `vercel env` CLI) for production.
#>

param(
    [string]$ProjectName = ''
)

function Ensure-VercelCli {
    if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
        Write-Host "Vercel CLI not found. Install with: npm i -g vercel" -ForegroundColor Yellow
        throw "vercel CLI missing"
    }
}

Ensure-VercelCli

if ($env:VERCEL_TOKEN) {
    Write-Host "Using VERCEL_TOKEN from environment for authentication" -ForegroundColor Green
    vercel login --token $env:VERCEL_TOKEN
} else {
    Write-Host "Please complete the interactive login in your browser when prompted by the Vercel CLI." -ForegroundColor Yellow
    vercel login
}

Write-Host "Deploying project to Vercel (production)..." -ForegroundColor Cyan
if ($ProjectName) {
    vercel --prod --confirm --name $ProjectName
} else {
    vercel --prod --confirm
}

Write-Host "Deployment finished. Visit the Vercel dashboard to set the following production environment variables if needed:" -ForegroundColor Green
Write-Host "  - NEXT_PUBLIC_PY_API_URL= https://<your-backend> (optional)" -ForegroundColor Yellow
Write-Host "  - PY_TGI_ENDPOINT= <tgi endpoint> (backend-only)" -ForegroundColor Yellow
Write-Host "  - PY_GENAI_ENDPOINT / PY_GENAI_KEY (if using external provider)" -ForegroundColor Yellow

Write-Host "Tip: you can set environment variables non-interactively using the vercel CLI:`n  vercel env add NEXT_PUBLIC_PY_API_URL production`" -ForegroundColor Cyan
