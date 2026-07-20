#Requires -Version 5.1
$ErrorActionPreference = "SilentlyContinue"

$ROOT = "C:\Users\joris\Documents\Capitalife Terminal"
$NPM  = "C:\Program Files\nodejs\npm.cmd"
$URL  = "http://localhost:3000"

function Http-Ok {
    try { (Invoke-WebRequest $URL -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop).StatusCode -eq 200 } catch { $false }
}

# Already running? Just open browser.
if (Http-Ok) {
    Start-Process $URL
    exit 0
}

# Start Next.js dev server (port 3000)
Start-Process -FilePath $NPM `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $ROOT `
    -WindowStyle Normal

# Wait up to 60 seconds for server to be ready
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if (Http-Ok) { $ready = $true; break }
}

if ($ready) {
    Start-Process $URL
} else {
    # Open anyway after timeout
    Start-Process $URL
}
