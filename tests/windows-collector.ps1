$ErrorActionPreference = 'Stop'
$dir = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item $dir -ItemType Directory | Out-Null
try {
    $config = Join-Path $dir 'device.json'
    $output = Join-Path $dir 'bundle.json'
    @{device='fixture';key=('ab' * 32)} | ConvertTo-Json | Set-Content -Path $config
    function Get-LocalGroupMember { param($SID) [pscustomobject]@{Name='fixture-admin'} }
    function Get-BitLockerVolume {
        param($MountPoint)
        if ($scenario -eq 'Unknown') { throw 'BitLocker unavailable' }
        [pscustomobject]@{VolumeStatus=$volumeStatus;ProtectionStatus=$protection;KeyProtector='fixture-recovery-secret'}
    }
    foreach ($case in @(
        @{result='Protected';volume='FullyEncrypted';protection='On'},
        @{result='ProtectionOff';volume='FullyEncrypted';protection='Off'},
        @{result='Unencrypted';volume='FullyDecrypted';protection='Off'},
        @{result='Unknown';volume='';protection=''}
    )) {
        $scenario=$case.result
        $volumeStatus=$case.volume
        $protection=$case.protection
        & "$PSScriptRoot/../collectors/windows.ps1" -Config $config -OutputPath $output
        $bundle = Get-Content -Raw $output | ConvertFrom-Json
        $bytes = [Convert]::FromBase64String($bundle.payload)
        $mac = [Security.Cryptography.HMACSHA256]::new([byte[]](@(171) * 32))
        $expected = [BitConverter]::ToString($mac.ComputeHash($bytes)).Replace('-','')
        if ($expected -ne $bundle.mac) { throw 'Bundle signature mismatch' }
        $json = [Text.Encoding]::UTF8.GetString($bytes)
        $facts = ($json | ConvertFrom-Json).facts
        if ($json.Contains('fixture-recovery-secret') -or $facts[1].protection -ne $scenario -or $facts[0].members[0] -ne 'fixture-admin') {
            throw 'Unexpected endpoint evidence'
        }
    }
} finally {
    Remove-Item -LiteralPath $dir -Recurse -Force
}
