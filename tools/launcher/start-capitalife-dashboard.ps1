#Requires -Version 5.1
<#
.SYNOPSIS
  Startet das Capitalife Terminal lokal.

.PARAMETER Clean
  Wenn gesetzt: loescht .next vor dem Start fuer einen sauberen Build.
  Standard: kein Loeschen (schnellerer Start).

.EXAMPLE
  .\start-capitalife-dashboard.ps1
  .\start-capitalife-dashboard.ps1 -Clean

.NOTES
  - Kein Start-Job. Dev-Server laeuft in sichtbarem Terminal.
  - Kein Ausweichen auf Port 3001.
  - Keine Orderausfuehrung. Monitoring only. Forward tracking / not live execution.
#>
param(
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

# ── Pfade ────────────────────────────────────────────────────────────────────
# Repo-Root wird aus dem Skript-Pfad abgeleitet (tools\launcher\ -> zwei Ebenen hoch).
# Alle Nachbar-Pfade sind per ENV ueberschreibbar; Fallback ist der Ordner neben dem Repo.
$LauncherRoot         = $PSScriptRoot
$DashboardRoot        = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$WorkspaceRoot        = Split-Path $DashboardRoot -Parent

function Resolve-ConfiguredPath {
  param([string]$EnvValue, [string]$Fallback)
  if ([string]::IsNullOrWhiteSpace($EnvValue)) { return $Fallback }
  return $EnvValue.Trim()
}

$BrainPath            = Resolve-ConfiguredPath $env:CAPITALIFE_BRAIN_PATH      (Join-Path $WorkspaceRoot "Capitalife Brain")
$InvoriaPath          = Resolve-ConfiguredPath $env:INVORIA_DASHBOARD_PATH     (Join-Path $WorkspaceRoot "Invoria Dashboard")
$MonitoringCachePath  = Resolve-ConfiguredPath $env:INVORIA_MONITORING_CACHE_DIR (Join-Path $WorkspaceRoot ".capitalife-cache\invoria-monitoring")
$TvCachePath          = Resolve-ConfiguredPath $env:TRADINGVIEW_CACHE_DIR      (Join-Path $WorkspaceRoot ".capitalife-cache\market-data\tradingview")
$LogsRoot             = Join-Path $LauncherRoot "logs"
$WorkerBatPath        = Join-Path $DashboardRoot "tools\market-data\start_tv_minute_worker.bat"
$Port                 = 3000
$Url                  = "http://localhost:$Port"
$SentinelHealthUrl    = "$Url/api/sentinel/health"
$MarketDataUrl        = "$Url/api/market-data/status"
$OllamaUrl            = "http://127.0.0.1:11434/api/tags"
$LogFile              = Join-Path $LogsRoot ("launcher-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
$StartWorker          = $env:CAPITALIFE_START_MARKET_DATA_WORKER -eq "true"

New-Item -ItemType Directory -Force $LogsRoot | Out-Null

# ── Logging ──────────────────────────────────────────────────────────────────
function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  switch ($Level) {
    "ERROR" { Write-Host $line -ForegroundColor Red }
    "WARN"  { Write-Host $line -ForegroundColor Yellow }
    "OK"    { Write-Host $line -ForegroundColor Green }
    default { Write-Host $line }
  }
}

# ── HTTP Helpers ─────────────────────────────────────────────────────────────
function Test-Http {
  param([string]$TargetUrl, [int]$TimeoutSeconds = 3)
  try {
    $r = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec $TimeoutSeconds -ErrorAction SilentlyContinue
    return @{ Ok = $true; StatusCode = [int]$r.StatusCode; Body = $r.Content }
  } catch {
    return @{ Ok = $false; StatusCode = $null; Body = $null; Error = $_.Exception.Message }
  }
}

function Test-JsonEndpoint {
  param([string]$TargetUrl, [int]$TimeoutSeconds = 3)
  $r = Test-Http -TargetUrl $TargetUrl -TimeoutSeconds $TimeoutSeconds
  if (-not $r.Ok) { return @{ Ok = $false; Data = $null; Error = $r.Error } }
  try {
    return @{ Ok = $true; Data = ($r.Body | ConvertFrom-Json); Error = $null }
  } catch {
    return @{ Ok = $false; Data = $null; Error = "JSON parse failed: $($_.Exception.Message)" }
  }
}

function Wait-ForUrl {
  param([string]$TargetUrl, [int]$TimeoutSeconds = 90)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    if ((Test-Http -TargetUrl $TargetUrl -TimeoutSeconds 3).Ok) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

# ── Port 3000 Analyse ─────────────────────────────────────────────────────────
# Gibt alle PIDs auf Port 3000 zurueck, aufgeteilt nach Prozessname
function Get-Port3000Info {
  $pids = @(netstat -ano 2>$null | Select-String ":$Port\s" | ForEach-Object {
    ($_ -split '\s+')[-1]
  } | Where-Object { $_ -match '^\d+$' } | Sort-Object -Unique)

  $nodePids  = @()
  $otherPids = @()

  foreach ($pid in $pids) {
    try {
      $proc = Get-Process -Id ([int]$pid) -ErrorAction SilentlyContinue
      if ($proc -and ($proc.ProcessName -match '^node$')) {
        $nodePids  += $pid
      } elseif ($proc) {
        $otherPids += "$pid ($($proc.ProcessName))"
      }
    } catch { $otherPids += $pid }
  }

  return @{ NodePids = $nodePids; OtherPids = $otherPids; AllPids = $pids }
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   CAPITALIFE  -  Capitalife Terminal Launcher" -ForegroundColor Cyan
Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Log "CAPITALIFE LOCAL LAUNCHER - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Log "Log: $LogFile"
if ($Clean) { Write-Log "Mode: CLEAN START (-Clean)" "WARN" } else { Write-Log "Mode: normal" }

# ── Voraussetzungen pruefen ───────────────────────────────────────────────────
Set-Location $DashboardRoot

$dashExists    = Test-Path $DashboardRoot
$pkgExists     = Test-Path (Join-Path $DashboardRoot "package.json")
$envExists     = Test-Path (Join-Path $DashboardRoot ".env.local")
$nmExists      = Test-Path (Join-Path $DashboardRoot "node_modules")
$brainExists   = Test-Path $BrainPath
$invoriaExists = Test-Path $InvoriaPath
$monCacheExists = Test-Path $MonitoringCachePath
$tvCacheExists  = Test-Path $TvCachePath

try { $nodeVer = (& node --version 2>$null) } catch { $nodeVer = $null }
try { $npmVer  = (& npm  --version 2>$null) } catch { $npmVer  = $null }

Write-Host "  Checks:" -ForegroundColor DarkGray
if ($dashExists)    { Write-Log "  [OK]   Dashboard path:     $DashboardRoot" "OK" }   else { Write-Log "  [MISS] Dashboard path missing: $DashboardRoot" "ERROR" }
if ($pkgExists)     { Write-Log "  [OK]   package.json found" "OK" }                   else { Write-Log "  [MISS] package.json missing" "ERROR" }
if ($nmExists)      { Write-Log "  [OK]   node_modules found" "OK" }                   else { Write-Log "  [WARN] node_modules missing - run npm install" "WARN" }
if ($envExists)     { Write-Log "  [OK]   .env.local found" "OK" }                     else { Write-Log "  [WARN] .env.local not found" "WARN" }
if ($nodeVer)       { Write-Log "  [OK]   Node $nodeVer" "OK" }                        else { Write-Log "  [ERR]  Node not in PATH" "ERROR" }
if ($npmVer)        { Write-Log "  [OK]   npm $npmVer" "OK" }                          else { Write-Log "  [ERR]  npm not in PATH" "ERROR" }
if ($brainExists)   { Write-Log "  [OK]   Capitalife Brain found" "OK" }               else { Write-Log "  [WARN] Capitalife Brain missing: $BrainPath" "WARN" }
if ($invoriaExists) { Write-Log "  [OK]   Invoria Dashboard found (optional)" "OK" }   else { Write-Log "  [WARN] Invoria Dashboard missing (optional): $InvoriaPath" "WARN" }
if ($monCacheExists){ Write-Log "  [OK]   Monitoring cache found (optional)" "OK" }    else { Write-Log "  [WARN] Monitoring cache missing (optional): $MonitoringCachePath" "WARN" }
Write-Host ""

# Pflichtvoraussetzungen
if (-not $dashExists) { throw "Dashboard-Pfad fehlt: $DashboardRoot" }
if (-not $pkgExists)  { throw "package.json fehlt. Falscher Ordner?" }
if (-not $nodeVer)    { throw "Node.js nicht gefunden. Bitte installieren." }
if (-not $npmVer)     { throw "npm nicht gefunden. Bitte Node.js installieren." }

# ── -Clean: .next loeschen ────────────────────────────────────────────────────
if ($Clean) {
  $nextDir = Join-Path $DashboardRoot ".next"
  if (Test-Path $nextDir) {
    Write-Log "Clean Start: loesche .next ..." "WARN"
    Remove-Item -Recurse -Force $nextDir
    Write-Log "Clean Start: .next geloescht" "OK"
  } else {
    Write-Log "Clean Start: kein .next Ordner gefunden, nichts zu loeschen" "INFO"
  }
}

# ── Port 3000 / Dashboard Status ──────────────────────────────────────────────
$dashProbe = Test-Http -TargetUrl $Url -TimeoutSeconds 2
$dashStatus = "starting"
$dashDetail = ""

if ($dashProbe.Ok) {
  $dashStatus = "ok"
  $dashDetail = "bereits erreichbar"
  Write-Log "Dashboard laeuft bereits auf $Url" "OK"
} else {
  $portInfo = Get-Port3000Info

  if ($portInfo.OtherPids.Count -gt 0) {
    $others = $portInfo.OtherPids -join ", "
    Write-Log "Port $Port ist belegt durch FREMDEN Prozess: $others" "ERROR"
    Write-Host ""
    Write-Host "  FEHLER: Port 3000 ist belegt durch: $others" -ForegroundColor Red
    Write-Host "  Dies ist kein Node/Next-Prozess - manuell beenden und neu starten." -ForegroundColor Red
    Write-Host ""
    $dashStatus = "error"
    $dashDetail = "Port $Port blockiert durch fremden Prozess: $others"

  } elseif ($portInfo.NodePids.Count -gt 0) {
    $nodePidList = $portInfo.NodePids -join ", "
    Write-Log "Port $Port belegt durch node.exe (PID: $nodePidList) - beende alten Prozess..." "WARN"
    foreach ($p in $portInfo.NodePids) {
      try {
        Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue
        Write-Log "  node.exe PID $p beendet" "OK"
      } catch {
        Write-Log "  Konnte PID $p nicht beenden: $($_.Exception.Message)" "WARN"
      }
    }
    Start-Sleep -Seconds 2

    # Starte Dev Server nach Bereinigung
    Write-Log "Starte npm run dev auf Port $Port (sichtbares Terminal) ..." "INFO"
    $devCmd = "Set-Location '$DashboardRoot'; npm run dev -- --port $Port"
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $devCmd
    Write-Log "Warte bis zu 90 Sekunden auf http://localhost:$Port ..." "INFO"
    if (Wait-ForUrl -TargetUrl $Url -TimeoutSeconds 90) {
      $dashStatus = "ok"
      $dashDetail = "gestartet (alter node.exe Prozess wurde beendet)"
      Write-Log "Dashboard gestartet - $Url erreichbar" "OK"
    } else {
      $dashStatus = "error"
      $dashDetail = "Timeout - $Url nicht erreichbar nach 90 Sekunden"
      Write-Log "Dashboard nicht erreichbar nach 90 Sekunden. Terminal-Fenster pruefen." "ERROR"
    }

  } else {
    # Port frei, Server nicht erreichbar - normaler Kaltstart
    Write-Log "Starte npm run dev auf Port $Port (sichtbares Terminal) ..." "INFO"
    $devCmd = "Set-Location '$DashboardRoot'; npm run dev -- --port $Port"
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $devCmd
    Write-Log "Warte bis zu 90 Sekunden auf http://localhost:$Port ..." "INFO"
    if (Wait-ForUrl -TargetUrl $Url -TimeoutSeconds 90) {
      $dashStatus = "ok"
      $dashDetail = "gestartet"
      Write-Log "Dashboard gestartet - $Url erreichbar" "OK"
    } else {
      $dashStatus = "error"
      $dashDetail = "Timeout - $Url nicht erreichbar nach 90 Sekunden"
      Write-Log "Dashboard nicht erreichbar nach 90 Sekunden. Terminal-Fenster pruefen." "ERROR"
      Write-Host ""
      Write-Host "  FEHLER: http://localhost:$Port hat nicht innerhalb von 90 Sekunden geantwortet." -ForegroundColor Red
      Write-Host "  Bitte das geoeffnete Next.js-Fenster auf Fehlermeldungen pruefen." -ForegroundColor Red
      Write-Host "  Log: $LogFile" -ForegroundColor DarkGray
      Write-Host ""
    }
  }
}

# ── Browser oeffnen ────────────────────────────────────────────────────────────
if ($dashStatus -eq "ok") {
  Start-Process $Url
  Write-Log "Browser geoeffnet: $Url" "OK"
}

# ── Optionale Service-Checks ──────────────────────────────────────────────────
$sentinelCheck  = Test-JsonEndpoint -TargetUrl $SentinelHealthUrl -TimeoutSeconds 4
$marketCheck    = Test-JsonEndpoint -TargetUrl $MarketDataUrl      -TimeoutSeconds 4
$ollamaCheck    = Test-JsonEndpoint -TargetUrl $OllamaUrl          -TimeoutSeconds 3

$sentinelStatus = if ($sentinelCheck.Ok)  { "ok" } else { "warn (optional)" }
$ollamaStatus   = if ($ollamaCheck.Ok)    { "ok" } else { "warn (optional)" }

$marketStatus = "warn"
if ($marketCheck.Ok -and $marketCheck.Data) {
  $ov = [string]$marketCheck.Data.overallStatus
  $marketStatus = if ($ov -eq "ok") { "ok" } elseif ($ov -eq "stale") { "stale" } else { "warn" }
}

# Optionaler TradingView Worker
if ($WorkerBatPath -and (Test-Path $WorkerBatPath) -and $StartWorker) {
  Write-Log "Starte optionalen TradingView Worker (CAPITALIFE_START_MARKET_DATA_WORKER=true)" "INFO"
  Start-Process -FilePath $WorkerBatPath -WorkingDirectory (Split-Path $WorkerBatPath -Parent)
} elseif (Test-Path $WorkerBatPath) {
  Write-Log "TradingView Worker verfuegbar aber nicht automatisch gestartet (CAPITALIFE_START_MARKET_DATA_WORKER != true)" "INFO"
}

# ── Status-Zusammenfassung ────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ─────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "   Status-Zusammenfassung" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ("   Dashboard :  {0}  ({1})" -f $dashStatus.ToUpper(), $dashDetail)
Write-Host ("   Sentinel  :  {0}" -f $sentinelStatus)
Write-Host ("   Ollama    :  {0}" -f $ollamaStatus)
Write-Host ("   Market    :  {0}" -f $marketStatus)
Write-Host ("   Brain     :  {0}" -f $(if ($brainExists)    { "ok" } else { "MISSING" }))
Write-Host ("   Invoria   :  {0}" -f $(if ($invoriaExists)  { "ok" } else { "warn (optional)" }))
Write-Host ("   Mon.Cache :  {0}" -f $(if ($monCacheExists) { "ok" } else { "warn (optional)" }))
Write-Host ("   URL       :  {0}" -f $Url)
Write-Host "  ─────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# Warnungen loggen
if (-not $sentinelCheck.Ok)  { Write-Log "Sentinel nicht erreichbar: $($sentinelCheck.Error)" "WARN" }
if (-not $ollamaCheck.Ok)    { Write-Log "Ollama nicht erreichbar (optional): $($ollamaCheck.Error)" "WARN" }
if (-not $marketCheck.Ok)    { Write-Log "Market Data nicht erreichbar: $($marketCheck.Error)" "WARN" }
if (-not $brainExists)       { Write-Log "Capitalife Brain Pfad fehlt: $BrainPath" "WARN" }
if (-not $invoriaExists)     { Write-Log "Invoria Pfad nicht gefunden (optional): $InvoriaPath" "WARN" }
if (-not $monCacheExists)    { Write-Log "Monitoring Cache nicht gefunden (optional): $MonitoringCachePath" "WARN" }

if ($dashStatus -eq "error") {
  Write-Log "Launcher beendet MIT FEHLER. Taste druecken zum Schliessen." "ERROR"
  Read-Host | Out-Null
  exit 1
}

Write-Log "Launcher erfolgreich abgeschlossen"

