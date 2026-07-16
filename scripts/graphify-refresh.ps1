# Graphify Refresh Script
# Baut Brain + Dashboard Graphs neu
# Aufruf: powershell -ExecutionPolicy Bypass -File ".\scripts\graphify-refresh.ps1"

$localBin = Join-Path $HOME ".local\bin"
$env:PATH = "$localBin;$env:PATH"
$BRAIN = $env:CAPITALIFE_BRAIN_PATH
$DASHBOARD = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $BRAIN) {
    Write-Error "CAPITALIFE_BRAIN_PATH fehlt. Bitte lokal in .env.local oder Shell setzen."
    exit 1
}
$LOG = "$BRAIN\07_Technology\Graphify Refresh Log.md"

function Check-Graphify {
    $exe = Get-Command graphify -ErrorAction SilentlyContinue
    if (-not $exe) {
        Write-Error "graphify nicht gefunden. Installiere via: uv tool install graphifyy"
        exit 1
    }
    Write-Host "graphify gefunden: $($exe.Source)"
}

function Build-Graph($path, $label) {
    Write-Host "`n=== $label ==="
    Push-Location $path
    try {
        graphify extract . --code-only 2>&1
        $graphPath = Join-Path $path "graphify-out\graph.json"
        if (Test-Path $graphPath) {
            $g = Get-Content $graphPath -Raw | ConvertFrom-Json
            Write-Host "OK: $($g.nodes.Count) Nodes, $($g.links.Count) Links"
            return @{ success=$true; nodes=$g.nodes.Count; links=$g.links.Count }
        }
        return @{ success=$false; nodes=0; links=0 }
    } finally {
        Pop-Location
    }
}

Check-Graphify

$now = Get-Date -Format "yyyy-MM-dd HH:mm"
$brain = Build-Graph $BRAIN "Brain Graph"
$dash  = Build-Graph $DASHBOARD "Dashboard Graph"

$log = @"
# Graphify Refresh Log

**Letzter Lauf:** $now

## Ergebnisse

| Graph | Status | Nodes | Links |
|-------|--------|-------|-------|
| Brain | $(if ($brain.success) { "OK" } else { "FEHLER" }) | $($brain.nodes) | $($brain.links) |
| Dashboard | $(if ($dash.success) { "OK" } else { "FEHLER" }) | $($dash.nodes) | $($dash.links) |

## Hinweis
- Brain: --code-only überspringt Markdown. Für Docs: ANTHROPIC_API_KEY setzen und --backend=claude nutzen.
- Dashboard: AST-Extraktion ohne LLM. Vollständig für TypeScript-Code.
"@

Set-Content -Path $LOG -Value $log -Encoding utf8
Write-Host "`nLog geschrieben: $LOG"
