param(
	[string]$ModelUrl = '',
	[string]$OutName = ''
)

function Get-LatestGpt4AllAssetUrl {
	param(
		[string]$Repo = 'nomic-ai/gpt4all'
	)
	$api = "https://api.github.com/repos/$Repo/releases/latest"
	try {
		$resp = Invoke-RestMethod -Uri $api -UseBasicParsing -Headers @{ 'User-Agent' = 'gpt4all-downloader' }
		# prefer .bin assets
		$asset = $resp.assets | Where-Object { $_.name -match '\.bin$' } | Select-Object -First 1
		if ($null -eq $asset) {
			throw "No .bin asset found on latest release for $Repo"
		}
		return @{ url = $asset.browser_download_url; name = $asset.name }
	} catch {
		throw "Failed to query GitHub releases: $_"
	}
}

try {
	$modelsDir = Join-Path $PSScriptRoot '..\models'
	if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Path $modelsDir | Out-Null }

	if (-not $ModelUrl -or $ModelUrl -eq 'github:latest') {
		Write-Host "Resolving latest GPT4All release from GitHub..." -ForegroundColor Cyan
		$asset = Get-LatestGpt4AllAssetUrl
		$ModelUrl = $asset.url
		if (-not $OutName) { $OutName = $asset.name }
	}

	if (-not $OutName) {
		$OutName = [System.IO.Path]::GetFileName($ModelUrl)
		if (-not $OutName) { $OutName = 'gpt4all-model.bin' }
	}

	$out = Join-Path $modelsDir $OutName
	Write-Host "Downloading GPT4All model from: $ModelUrl" -ForegroundColor Cyan
	Write-Host "Saving to: $out" -ForegroundColor Cyan

	Invoke-WebRequest -Uri $ModelUrl -OutFile $out -UseBasicParsing -TimeoutSec 3600 -Verbose

	if (Test-Path $out) {
		Write-Host "Download completed: $out" -ForegroundColor Green
		Write-Host "To use this model with the Python backend set the environment variable (PowerShell):" -ForegroundColor Yellow
		Write-Host "`$env:PY_LLAMA_MODEL_PATH = '$out'" -ForegroundColor Yellow
		Write-Host "Or add it to your system/user environment variables so it persists across sessions." -ForegroundColor Yellow
	} else {
		Write-Error "Download finished but file not found at $out"
	}
} catch {
	Write-Error "Failed to download model: $_"
	throw
}
