$ErrorActionPreference = "Stop"

$LauncherRoot  = $PSScriptRoot
$IconPath      = Join-Path $LauncherRoot "capitalife.ico"
$Desktop       = [Environment]::GetFolderPath("Desktop")

if (-not (Test-Path $IconPath)) { throw "Icon fehlt: $IconPath" }

$shell = New-Object -ComObject WScript.Shell

# Normal Start
$bat1 = Join-Path $LauncherRoot "Start Capitalife Dashboard.bat"
if (-not (Test-Path $bat1)) { throw "BAT fehlt: $bat1" }
$sc1 = $shell.CreateShortcut("$Desktop\Capitalife Dashboard.lnk")
$sc1.TargetPath       = $bat1
$sc1.WorkingDirectory = $LauncherRoot
$sc1.IconLocation     = $IconPath
$sc1.Description      = "Start Capitalife Capitalife Terminal"
$sc1.Save()
Write-Host "Shortcut: $Desktop\Capitalife Dashboard.lnk"

# Clean Start
$bat2 = Join-Path $LauncherRoot "Start Capitalife Dashboard Clean.bat"
if (-not (Test-Path $bat2)) { throw "BAT fehlt: $bat2" }
$sc2 = $shell.CreateShortcut("$Desktop\Capitalife Dashboard Clean Start.lnk")
$sc2.TargetPath       = $bat2
$sc2.WorkingDirectory = $LauncherRoot
$sc2.IconLocation     = $IconPath
$sc2.Description      = "Start Capitalife Capitalife Terminal (Clean Start)"
$sc2.Save()
Write-Host "Shortcut: $Desktop\Capitalife Dashboard Clean Start.lnk"

Write-Host "Fertig."
