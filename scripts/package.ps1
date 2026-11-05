$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$releasePath = Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Force -Path $releasePath | Out-Null
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectRoot 'manifest.json') | ConvertFrom-Json
$archivePath = Join-Path $releasePath "chatgpt-conversation-map-$($manifest.version).zip"
Compress-Archive -Path (Join-Path $projectRoot 'manifest.json'), (Join-Path $projectRoot 'src'), (Join-Path $projectRoot 'popup'), (Join-Path $projectRoot 'icons'), (Join-Path $projectRoot 'LICENSE') -DestinationPath $archivePath -Force
Write-Output $archivePath
