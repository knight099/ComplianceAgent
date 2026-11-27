param([Parameter(Mandatory)][string]$Config,[Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
$c = Get-Content -Raw $Config | ConvertFrom-Json
$facts = @()
try {
    $members = @(Get-LocalGroupMember -SID 'S-1-5-32-544' | ForEach-Object { $_.Name })
    $facts += @{group='Local administrators';members=$members;status='Observed'}
} catch {
    $facts += @{group='Local administrators';status='Unknown'}
}

# Query only the OS volume. Never serialize the BitLocker object or its key protectors.
$encryption = 'Unknown'
try {
    $volume = Get-BitLockerVolume -MountPoint $env:SystemDrive
    if ([string]$volume.VolumeStatus -eq 'FullyEncrypted' -and [string]$volume.ProtectionStatus -eq 'On') {
        $encryption = 'Protected'
    } elseif ([string]$volume.VolumeStatus -eq 'FullyDecrypted') {
        $encryption = 'Unencrypted'
    } elseif ([string]$volume.ProtectionStatus -eq 'Off') {
        $encryption = 'ProtectionOff'
    }
} catch {
    $encryption = 'Unknown'
}
$facts += @{signal='bitlocker-os-volume';protection=$encryption}
$status = if ($facts[0].status -eq 'Unknown' -and $encryption -eq 'Unknown') { 'Unknown' } else { 'Observed' }
$e = @{source=$c.device;mode='Imported';status=$status;collector='windows-posture/2';observed=[DateTime]::UtcNow.ToString('o');facts=$facts}
$bytes = [Text.Encoding]::UTF8.GetBytes(($e | ConvertTo-Json -Depth 5 -Compress))
$key = [byte[]]@(for($i=0;$i -lt $c.key.Length;$i+=2){[Convert]::ToByte($c.key.Substring($i,2),16)})
$h = [Security.Cryptography.HMACSHA256]::new($key)
$b = @{device=$c.device;payload=[Convert]::ToBase64String($bytes);mac=[BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','')} | ConvertTo-Json -Compress
[IO.File]::WriteAllText($OutputPath,$b)
if($c.url){if(([uri]$c.url).Scheme -ne 'https'){throw 'HTTPS required'};Invoke-RestMethod -Uri $c.url -Method Post -ContentType application/json -Body $b}
