param([Parameter(Mandatory)][string]$Config,[Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
$c = Get-Content -Raw $Config | ConvertFrom-Json
$members = @(Get-LocalGroupMember -SID 'S-1-5-32-544' | ForEach-Object { $_.Name })
$e = @{source=$c.device; mode='Imported';status='Observed';collector='windows-local-admin/1';observed=[DateTime]::UtcNow.ToString('o');facts=@(@{group='Local administrators';members=$members})}
$bytes = [Text.Encoding]::UTF8.GetBytes(($e | ConvertTo-Json -Depth 5 -Compress))
$key = [byte[]]@(for($i=0;$i -lt $c.key.Length;$i+=2){[Convert]::ToByte($c.key.Substring($i,2),16)})
$h = [Security.Cryptography.HMACSHA256]::new($key)
$b = @{device=$c.device;payload=[Convert]::ToBase64String($bytes);mac=[BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','')} | ConvertTo-Json -Compress
[IO.File]::WriteAllText($OutputPath,$b)
if($c.url){if(([uri]$c.url).Scheme -ne 'https'){throw 'HTTPS required'};Invoke-RestMethod -Uri $c.url -Method Post -ContentType application/json -Body $b}
