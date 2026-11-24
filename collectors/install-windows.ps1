param([string]$Config,[switch]$Uninstall)
$ErrorActionPreference='Stop'
$base=Join-Path $env:LOCALAPPDATA 'ComplyOS'
if($Uninstall){
 Unregister-ScheduledTask -TaskName ComplyOSCollector -Confirm:$false
 Remove-Item -LiteralPath (Join-Path $base 'windows.ps1')
 return
}
if(!$Config){throw 'Supply the per-device enrollment JSON with -Config'}
New-Item -Force -ItemType Directory $base | Out-Null
Copy-Item "$PSScriptRoot/windows.ps1" "$base/windows.ps1" -Force
Copy-Item $Config "$base/device.json" -Force
$argsText='-NoProfile -File "{0}\windows.ps1" -Config "{0}\device.json" -OutputPath "{0}\latest.bundle"' -f $base
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argsText
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName ComplyOSCollector -Action $action -Trigger $trigger -Force | Out-Null
Start-ScheduledTask -TaskName ComplyOSCollector
