param(
    [Parameter(Mandatory=$true)][string]$OldRoot,
    [Parameter(Mandatory=$true)][string]$Stage,
    [Parameter(Mandatory=$true)][int]$WaitPid,
    [ValidateRange(1,60)][int]$StartupTimeoutSeconds = 40
)
$ErrorActionPreference = 'Stop'
$old = [IO.Path]::GetFullPath($OldRoot).TrimEnd('\')
$stagePath = [IO.Path]::GetFullPath($Stage).TrimEnd('\')
$parent = Split-Path -Parent $old
$new = Join-Path $stagePath 'extracted'
$previous = Join-Path $stagePath 'previous'
$failed = Join-Path $stagePath 'failed'
if (-not $parent -or $old -eq [IO.Path]::GetPathRoot($old).TrimEnd('\') -or
    (Split-Path -Parent $stagePath) -ne $parent -or
    -not (Split-Path -Leaf $stagePath).StartsWith('tk2-track-groups-update-') -or
    (Test-Path -LiteralPath $previous) -or (Test-Path -LiteralPath $failed)) { exit 2 }
foreach ($path in @($old, $stagePath, $new)) {
    if (-not (Test-Path -LiteralPath $path -PathType Container) -or
        ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)) { exit 2 }
}
$manifest = Get-Content -LiteralPath (Join-Path $new 'portable-manifest.json') -Raw | ConvertFrom-Json
$installed = Get-Content -LiteralPath (Join-Path $old 'portable-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.app -ne 'TK2 Track Groups' -or $manifest.version -notmatch '^\d+\.\d+\.\d+$' -or $installed.app -ne $manifest.app) { exit 2 }
$name = Split-Path -Leaf $old
if ($name -match '^TK2-Track-Groups-\d+\.\d+\.\d+(-dev)?-win-x64$') { $name = "TK2-Track-Groups-$($manifest.version)-win-x64" }
$target = [IO.Path]::GetFullPath((Join-Path $parent $name)).TrimEnd('\')
if ((Split-Path -Parent $target) -ne $parent -or $target -eq $stagePath -or ($target -ne $old -and (Test-Path -LiteralPath $target))) { exit 2 }
while (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 250 }
$launched = $null
try {
    # Preserve additional user files, while removing obsolete application-owned files.
    $owned = @($installed.files.PSObject.Properties.Name) + 'portable-manifest.json'
    foreach ($item in Get-ChildItem -LiteralPath $old -Recurse -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked installation paths are unsupported.' }
        if ($item.PSIsContainer) { continue }
        $relative = $item.FullName.Substring($old.Length + 1).Replace('\', '/')
        $destination = [IO.Path]::GetFullPath((Join-Path $new $relative))
        if (-not $destination.StartsWith($new + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe preserved path.' }
        if ($relative -notin $owned -and -not (Test-Path -LiteralPath $destination)) {
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            Copy-Item -LiteralPath $item.FullName -Destination $destination
        }
    }
    Move-Item -LiteralPath $old -Destination $previous
    Move-Item -LiteralPath $new -Destination $target
    $launched = Start-Process -FilePath (Join-Path $target 'TK2 Track Groups.exe') -WorkingDirectory $target -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    $healthy = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Get-Process -Id $launched.Id -ErrorAction SilentlyContinue)) { break }
        try {
            $session = Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'TK2 Track Groups/session.json') -Raw | ConvertFrom-Json
            if ($session.pid -eq $launched.Id -and $session.origin -match '^http://127\.0\.0\.1:\d+$') {
                $health = Invoke-RestMethod -Uri ($session.origin + '/api/health') -TimeoutSec 2
                if ($health.app -eq 'TK2 Track Groups' -and $health.pid -eq $launched.Id -and $health.version -eq $manifest.version) { $healthy = $true; break }
            }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $healthy) { throw 'Updated application failed its startup check.' }
    # Previous files are temporary rollback material; no permanent backup folder is created.
    Remove-Item -LiteralPath $previous -Recurse -Force
    Remove-Item -LiteralPath (Join-Path $stagePath 'release.zip') -Force -ErrorAction SilentlyContinue
    Set-Content -LiteralPath (Join-Path $stagePath 'result.txt') -Value 'Update installed; previous files removed.'
} catch {
    $failure = $_.Exception.Message
    if ($launched -and (Get-Process -Id $launched.Id -ErrorAction SilentlyContinue)) {
        $launched.CloseMainWindow() | Out-Null
        if (-not $launched.WaitForExit(10000)) { Stop-Process -Id $launched.Id -Force }
    }
    if (Test-Path -LiteralPath $previous) {
        if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination $failed }
        Move-Item -LiteralPath $previous -Destination $old
    }
    Set-Content -LiteralPath (Join-Path $stagePath 'result.txt') -Value "Update failed; previous installation restored. $failure"
    if (Test-Path -LiteralPath (Join-Path $old 'TK2 Track Groups.exe')) {
        Start-Process -FilePath (Join-Path $old 'TK2 Track Groups.exe') -WorkingDirectory $old -WindowStyle Hidden
    }
    exit 1
}
