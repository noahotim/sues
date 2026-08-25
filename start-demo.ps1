# Start the full SUES demo: Firebase emulators + seed data + Vite dev server.
# Run from the project root, e.g.:
#   powershell -ExecutionPolicy Bypass -File start-demo.ps1
# (The emulator database is in-memory, so the demo data is re-seeded every time.)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

function Wait-Port($port, $seconds = 120) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if ((Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded) {
      return $true
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

# 1. Stop any emulators already running so ports are free.
@(9099, 8080, 5001, 9199, 4400, 9150, 4000) | ForEach-Object {
  Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
}
Get-Process -Name java -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# 2. Start the Firebase emulators (detached).
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","node_modules\.bin\firebase.cmd emulators:start > emu-run.log 2>&1" -WindowStyle Hidden
Write-Host "Starting emulators..."
if (-not (Wait-Port 9099) -or -not (Wait-Port 8080) -or -not (Wait-Port 5001) -or -not (Wait-Port 9199)) {
  Write-Host "Emulators did not start in time. See emu-run.log."
  exit 1
}
Write-Host "Emulators ready (auth 9099, firestore 8080, functions 5001, storage 9199)."

# 3. Seed the demo data (election, candidates, roster, accounts).
Set-Location (Join-Path $root "functions")
Write-Host "Seeding demo data..."
node reset-votes.mjs | Out-Null
node setup-vote-demo.mjs | Out-Null
Write-Host "Demo data seeded."

# 4. Start the Vite dev server (detached).
Set-Location $root
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm.cmd run dev > vite.log 2>&1" -WindowStyle Hidden
if (-not (Wait-Port 5173 60)) {
  Write-Host "Dev server did not start. See vite.log."
  exit 1
}
Write-Host ""
Write-Host "=== DONE ==="
Write-Host "Open http://localhost:5173/"
Write-Host "Sign in with a demo account (password sues2026):"
Write-Host "  Chairperson : chair.sues@sun.ac.ug"
Write-Host "  Secretary   : secretary.sues@sun.ac.ug"
Write-Host "  Voter       : apio.samson@sun.ac.ug"
