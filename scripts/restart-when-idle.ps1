param([int]$TimeoutMinutes = 240)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$nodeExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)

function Get-BusyCount {
  $result = & $nodeExe (Join-Path $PSScriptRoot 'idle-status.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read active task count.' }
  return [int]$result
}

while ((Get-Date) -lt $deadline) {
  if ((Get-BusyCount) -eq 0) {
    $stable = $true
    for ($check = 0; $check -lt 3; $check++) {
      Start-Sleep -Seconds 2
      if ((Get-BusyCount) -ne 0) { $stable = $false; break }
    }
    if ($stable) {
      & (Join-Path $PSScriptRoot 'manage.ps1') -Action stop
      if ($LASTEXITCODE -ne 0) { throw 'Server shutdown failed.' }
      $stopped = $false
      for ($check = 0; $check -lt 30; $check++) {
        try { Invoke-WebRequest 'http://127.0.0.1:4317/health' -UseBasicParsing -TimeoutSec 2 | Out-Null }
        catch { $stopped = $true; break }
        Start-Sleep -Seconds 1
      }
      if (-not $stopped) { throw 'Server did not stop.' }
      & (Join-Path $PSScriptRoot 'manage.ps1') -Action start
      if ($LASTEXITCODE -ne 0) { throw 'Server start failed.' }
      for ($check = 0; $check -lt 30; $check++) {
        try {
          $health = Invoke-RestMethod 'http://127.0.0.1:4317/health' -TimeoutSec 2
          if ($health.ok) { Write-Output 'Updated server started while tasks were idle.'; exit 0 }
        } catch {}
        Start-Sleep -Seconds 1
      }
      throw 'Updated server did not become healthy.'
    }
  }
  Start-Sleep -Seconds 15
}
throw 'Timed out while waiting for tasks to become idle.'
