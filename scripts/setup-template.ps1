<#
.SYNOPSIS
    Macro Recorder Windows Installer Payload Script.
    Installs Macro Recorder to LocalAppData\Programs\MacroRecorder,
    creates Start Menu and Desktop shortcuts, registers file associations,
    and creates Windows Add/Remove Programs uninstall entry.
#>
param(
    [string]$TargetDir = "$env:LOCALAPPDATA\Programs\MacroRecorder",
    [switch]$NoDesktopShortcut,
    [switch]$NoStartMenuShortcut,
    [switch]$NoAssociations,
    [switch]$Silent
)

$ErrorActionPreference = 'Stop'

function Write-SetupLog([string]$msg) {
    if (-not $Silent) {
        Write-Host "[SETUP] $msg" -ForegroundColor Cyan
    }
}

Write-SetupLog "Installing Macro Recorder to $TargetDir..."

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
}

$sourceDir = $PSScriptRoot
# Copy app payload
$excludeList = @('setup.ps1', 'setup.cmd', 'installer-config.txt')
Get-ChildItem -Path $sourceDir -Force | Where-Object { $excludeList -notcontains $_.Name } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $TargetDir -Recurse -Force
}

$exePath = Join-Path $TargetDir 'MacroRecorder.exe'
$iconPath = Join-Path $TargetDir 'resources\icon.ico'
if (-not (Test-Path $iconPath)) {
    $iconPath = $exePath
}

# 1. Start Menu Shortcut
if (-not $NoStartMenuShortcut) {
    $startMenuDir = [System.Environment]::GetFolderPath('Programs')
    $shortcutPath = Join-Path $startMenuDir 'Macro Recorder.lnk'
    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $TargetDir
    $shortcut.Description = "Macro Recorder - High-precision input recording and playback"
    $shortcut.IconLocation = "$iconPath,0"
    $shortcut.Save()
    Write-SetupLog "Created Start Menu shortcut: $shortcutPath"
}

# 2. Desktop Shortcut
if (-not $NoDesktopShortcut) {
    $desktopDir = [System.Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktopDir 'Macro Recorder.lnk'
    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $TargetDir
    $shortcut.Description = "Macro Recorder - High-precision input recording and playback"
    $shortcut.IconLocation = "$iconPath,0"
    $shortcut.Save()
    Write-SetupLog "Created Desktop shortcut: $shortcutPath"
}

# 3. Register File Associations (.mrmacro, .macro.json)
if (-not $NoAssociations) {
    $classesRoot = "HKCU:\Software\Classes"

    # .mrmacro
    New-Item -Path "$classesRoot\.mrmacro" -Value "MacroRecorder.Package" -Force | Out-Null
    New-Item -Path "$classesRoot\MacroRecorder.Package" -Value "Macro Recorder Package" -Force | Out-Null
    New-Item -Path "$classesRoot\MacroRecorder.Package\DefaultIcon" -Value "$iconPath,0" -Force | Out-Null
    New-Item -Path "$classesRoot\MacroRecorder.Package\shell\open\command" -Value "`"$exePath`" `"%1`"" -Force | Out-Null

    # .macro.json
    New-Item -Path "$classesRoot\.macro.json" -Value "MacroRecorder.MacroJson" -Force | Out-Null
    New-Item -Path "$classesRoot\MacroRecorder.MacroJson" -Value "Macro Recorder JSON Macro" -Force | Out-Null
    New-Item -Path "$classesRoot\MacroRecorder.MacroJson\DefaultIcon" -Value "$iconPath,0" -Force | Out-Null
    New-Item -Path "$classesRoot\MacroRecorder.MacroJson\shell\open\command" -Value "`"$exePath`" `"%1`"" -Force | Out-Null

    Write-SetupLog "Registered file associations for .mrmacro and .macro.json"
}

# 4. Generate Uninstaller Script
$uninstallerPath = Join-Path $TargetDir 'uninstall.ps1'
$uninstallerScript = @"
<#
.SYNOPSIS
    Macro Recorder Uninstaller Script.
#>
param(
    [switch]`$PurgeData,
    [switch]`$Silent
)

`$TargetDir = "`$PSScriptRoot"
`$exeName = "MacroRecorder"

# Stop running process
Get-Process -Name `$exeName -ErrorAction SilentlyContinue | Stop-Process -Force

# Remove shortcuts
`$startMenuShortcut = Join-Path ([System.Environment]::GetFolderPath('Programs')) 'Macro Recorder.lnk'
if (Test-Path `$startMenuShortcut) { Remove-Item -Force `$startMenuShortcut }

`$desktopShortcut = Join-Path ([System.Environment]::GetFolderPath('Desktop')) 'Macro Recorder.lnk'
if (Test-Path `$desktopShortcut) { Remove-Item -Force `$desktopShortcut }

# Remove file associations
Remove-Item -Path "HKCU:\Software\Classes\.mrmacro" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\MacroRecorder.Package" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\.macro.json" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\MacroRecorder.MacroJson" -Recurse -ErrorAction SilentlyContinue

# Remove Add/Remove Programs registry entry
Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MacroRecorder" -Recurse -ErrorAction SilentlyContinue

# Optional data purge
if (`$PurgeData) {
    `$userDataDir = Join-Path `$env:LOCALAPPDATA 'MacroRecorder'
    if (Test-Path `$userDataDir) {
        Remove-Item -Path `$userDataDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Schedule deletion of program directory after script exits
Start-Process -FilePath "cmd.exe" -ArgumentList "/c timeout /t 2 /nobreak > NUL & rd /s /q `"`$TargetDir`"" -WindowStyle Hidden

if (-not `$Silent) {
    Write-Host "Macro Recorder has been uninstalled successfully." -ForegroundColor Green
}
"@
Set-Content -Path $uninstallerPath -Value $uninstallerScript -Encoding UTF8

# 5. Add to Windows Add/Remove Programs (Registry)
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MacroRecorder"
New-Item -Path $uninstallKey -Force | Out-Null
Set-ItemProperty -Path $uninstallKey -Name "DisplayName" -Value "Macro Recorder"
Set-ItemProperty -Path $uninstallKey -Name "DisplayVersion" -Value "1.0.0"
Set-ItemProperty -Path $uninstallKey -Name "Publisher" -Value "smilekritik"
Set-ItemProperty -Path $uninstallKey -Name "InstallLocation" -Value $TargetDir
Set-ItemProperty -Path $uninstallKey -Name "DisplayIcon" -Value "$iconPath,0"
Set-ItemProperty -Path $uninstallKey -Name "UninstallString" -Value "powershell.exe -ExecutionPolicy Bypass -NoProfile -File `"$uninstallerPath`""
Set-ItemProperty -Path $uninstallKey -Name "QuietUninstallString" -Value "powershell.exe -ExecutionPolicy Bypass -NoProfile -File `"$uninstallerPath`" -Silent"
Set-ItemProperty -Path $uninstallKey -Name "NoModify" -Value 1
Set-ItemProperty -Path $uninstallKey -Name "NoRepair" -Value 1

Write-SetupLog "Registered in Windows Add/Remove Programs"
Write-SetupLog "Macro Recorder installation completed successfully!"
