# Deploy the Nimbus cloud brain in one go. Run AFTER adding Anthropic credit:
#   powershell -ExecutionPolicy Bypass -File workers\nimbus-brain\deploy.ps1
# It opens the Cloudflare login in your browser once, makes the spend counter, stores the API key as a secret
# (read from your local env file, never printed or saved in the repo), deploys, and prints the URL.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

npx -y wrangler@4 whoami | Out-String | Select-String 'not authenticated' | ForEach-Object { npx -y wrangler@4 login }

$toml = Get-Content wrangler.toml -Raw
if ($toml -notmatch '(?m)^\[\[kv_namespaces\]\]') {
  $out = npx -y wrangler@4 kv namespace create SPEND | Out-String
  if ($out -notmatch 'id\s*=\s*"([0-9a-f]+)"') { throw "Could not read the KV id from: $out" }
  $toml = $toml -replace '(?m)^# \[\[kv_namespaces\]\]\r?\n# binding = "SPEND"\r?\n# id = "<id>"', "[[kv_namespaces]]`nbinding = `"SPEND`"`nid = `"$($Matches[1])`""
  Set-Content wrangler.toml $toml -NoNewline
}

$key = $null
foreach ($f in 'C:\Users\wjack\ghl-cli\.env', 'C:\Users\wjack\wing-digital-os\.env.local') {
  if (-not $key -and (Test-Path $f)) { $m = Select-String -Path $f -Pattern '^\s*ANTHROPIC_API_KEY\s*=\s*["'']?([^\s"'']+)' | Select-Object -First 1; if ($m) { $key = $m.Matches[0].Groups[1].Value } }
}
if (-not $key) { throw 'No ANTHROPIC_API_KEY in the local env files.' }
$key | npx -y wrangler@4 secret put ANTHROPIC_API_KEY
$key = $null

npx -y wrangler@4 deploy
Write-Host ''
Write-Host 'Done. Copy the https://nimbus-brain...workers.dev URL above into NIMBUS_CLOUD in tour/product.html.'
