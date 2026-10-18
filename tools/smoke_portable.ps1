param([Parameter(Mandatory=$true)][string]$PortableFolder)
$ErrorActionPreference = 'Stop'
$tgRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tgLocal = [IO.Path]::GetFullPath((Join-Path $tgRepo 'local'))
$tgTest = Join-Path $tgLocal ('portable-smoke-' + [guid]::NewGuid().ToString())
Copy-Item -LiteralPath $PortableFolder -Destination $tgTest -Recurse
# Match Explorer's extraction of an Internet-downloaded release ZIP.
Get-ChildItem -LiteralPath $tgTest -Recurse -Filter *.dll | ForEach-Object {
    Set-Content -LiteralPath $_.FullName -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3"
}
$tgOldPath = $env:PATH
$tgApp = $null
try {
    # The built app and its helper must run without Python, Node or npm on PATH.
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $tgApp = Start-Process -FilePath (Join-Path $tgTest 'TK2 Track Groups.exe') -WorkingDirectory $env:TEMP -WindowStyle Hidden -PassThru
    $tgSessionFile = Join-Path $env:LOCALAPPDATA 'TK2 Track Groups\session.json'
    $tgLimit = [DateTime]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 200
        if ($tgApp.HasExited) { throw 'Portable application exited during startup.' }
        try { $tgSession = Get-Content -LiteralPath $tgSessionFile -Raw | ConvertFrom-Json } catch { $tgSession = $null }
    } until (($tgSession -and $tgSession.pid -eq $tgApp.Id) -or [DateTime]::UtcNow -gt $tgLimit)
    if (-not $tgSession -or $tgSession.pid -ne $tgApp.Id) { throw 'No portable session created.' }
    $tgHeaders = @{'X-TK2-Token'=$tgSession.token}
    $tgHealth = Invoke-RestMethod -Uri "$($tgSession.origin)/api/health"
    if ($tgHealth.version -ne (Get-Content -LiteralPath (Join-Path $tgTest 'portable-manifest.json') -Raw | ConvertFrom-Json).version) { throw 'Unexpected app version.' }
    # Startup connects once; wait instead of starting a competing refresh.
    $tgLimit = [DateTime]::UtcNow.AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 300
        $tgState = Invoke-RestMethod -Uri "$($tgSession.origin)/api/state" -Headers $tgHeaders
    } until ($tgState.job.state -ne 'running' -or [DateTime]::UtcNow -gt $tgLimit)
    if ($tgState.job.state -ne 'completed' -or -not $tgState.steamConnected -or $tgState.syncError) { throw "Steam/profile validation failed: $($tgState.job.message) $($tgState.syncError)" }
    if ($tgState.groups.Count -lt 4 -or $tgState.localGroups.Count -lt 3) { throw 'Expected library/profile groups were not found.' }
    if (@($tgState.groups | Where-Object {$_.category -eq 'speedrun'}).Count -lt 4) { throw 'Reviewed Speedrun categories were not found.' }
    $tgProfileFile = Join-Path $tgState.settings.profileDirectory $tgState.settings.profile
    $tgOriginalHash = (Get-FileHash -LiteralPath $tgProfileFile).Hash
    # Exercise the frozen draft/rename code without changing the user's collection.
    $tgRename = $tgState.localGroups[0]
    $tgDraftChecks = @(
        @{action='create'; body=@{name='Portable verification (not saved)';items="3263970719`n3279611598"}; mode='install'},
        @{action='rename'; body=@{id=$tgRename.id;name=$tgRename.name}; mode='rename'}
    )
    $tgLego = $tgState.localGroups | Where-Object {$_.id -eq '4fb49e19-37fa-4768-9dd8-7e5fd9c9f485'}
    if ($tgLego) {
        if (-not $tgLego.exportReady -or $tgLego.unresolvedTracks -ne 0) { throw 'Bundled LEGO identities were not resolved.' }
        if ($tgLego.missingTracks -gt 0) {
            $tgDraftChecks = @(@{action='repair'; body=@{id=$tgLego.id}; mode='repair'}) + $tgDraftChecks
        }
    }
    foreach ($tgCheck in $tgDraftChecks) {
        Invoke-RestMethod -Uri "$($tgSession.origin)/api/$($tgCheck.action)" -Method Post -Headers $tgHeaders -ContentType application/json -Body ($tgCheck.body | ConvertTo-Json) | Out-Null
        $tgLimit = [DateTime]::UtcNow.AddSeconds(60)
        do {
            Start-Sleep -Milliseconds 300
            $tgState = Invoke-RestMethod -Uri "$($tgSession.origin)/api/state" -Headers $tgHeaders
        } until ($tgState.job.state -ne 'running' -or [DateTime]::UtcNow -gt $tgLimit)
        if ($tgState.job.state -ne 'completed' -or $tgState.job.result.preview.mode -ne $tgCheck.mode) { throw "Portable preview failed: $($tgState.job.message)" }
    }
    # Confirm the unchanged-name preview: validates the bundled write path as a no-op.
    Invoke-RestMethod -Uri "$($tgSession.origin)/api/import" -Method Post -Headers $tgHeaders -ContentType application/json -Body (@{token=$tgState.job.result.preview.token} | ConvertTo-Json) | Out-Null
    $tgLimit = [DateTime]::UtcNow.AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 300
        $tgState = Invoke-RestMethod -Uri "$($tgSession.origin)/api/state" -Headers $tgHeaders
    } until ($tgState.job.state -ne 'running' -or [DateTime]::UtcNow -gt $tgLimit)
    if ($tgState.job.state -ne 'completed' -or $tgState.job.result.outcome -ne 'unchanged') { throw "Portable no-op rename failed: $($tgState.job.message)" }
    if ((Get-FileHash -LiteralPath $tgProfileFile).Hash -ne $tgOriginalHash) { throw 'Preview/no-op checks modified the profile.' }
    $tgChildren = @(Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq $tgApp.Id} | Select-Object -ExpandProperty ProcessId)
    Invoke-RestMethod -Uri "$($tgSession.origin)/api/shutdown" -Method Post -Headers $tgHeaders -ContentType application/json -Body '{}' | Out-Null
    if (-not $tgApp.WaitForExit(15000)) { throw 'Native app did not exit cleanly.' }
    Start-Sleep -Milliseconds 1000
    foreach ($tgChild in $tgChildren) {
        if (Get-Process -Id $tgChild -ErrorAction SilentlyContinue) { throw "Child process remains after closing: $tgChild" }
    }
    $tgResolved = [IO.Path]::GetFullPath($tgTest)
    if (-not $tgResolved.StartsWith($tgLocal + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test directory.' }
    Remove-Item -LiteralPath $tgResolved -Recurse -Force
    if (Test-Path -LiteralPath $tgResolved) { throw 'Portable folder remains after deletion.' }
    Write-Output 'PASS: relocated app, no developer PATH, live Steam/profile access, native shutdown, child exit, folder deletion.'
} finally {
    $env:PATH = $tgOldPath
    # Failed tests retain their folder and diagnostics; no game processes are killed.
}
