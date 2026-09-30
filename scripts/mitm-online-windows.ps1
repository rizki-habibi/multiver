param(
  [string]$Gateway = "https://9router-new-production.up.railway.app",
  [string]$ApiKey = $env:NINE_ROUTER_V3_API_KEY,
  [int]$Port = 20222
)

$ErrorActionPreference = "Stop"

function Test-Administrator {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  Write-Host "Meminta izin Administrator untuk sertifikat, port 443, dan hosts..."
  $argList = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"' + $PSCommandPath + '"'),
    "-Gateway", ('"' + $Gateway + '"'),
    "-Port", $Port
  )
  if ($ApiKey) { $argList += @("-ApiKey", ('"' + $ApiKey + '"')) }
  Start-Process powershell.exe -Verb RunAs -ArgumentList ($argList -join " ")
  exit
}

Write-Host "=== Multiver Kiro MITM Online ==="
Write-Host "Gateway: $Gateway"

$cmd = Get-Command multiver -ErrorAction SilentlyContinue
if (-not $cmd) {
  throw "Perintah 'multiver' belum terpasang. Jalankan instalasi Multiver terlebih dahulu."
}

$base = "http://127.0.0.1:$Port"
$ready = $false
try {
  Invoke-RestMethod -Uri "$base/api/mitm/kiro" -Method Get -TimeoutSec 2 | Out-Null
  $ready = $true
} catch {}

if (-not $ready) {
  Write-Host "Menjalankan Multiver lokal di port $Port..."
  Start-Process -FilePath $cmd.Source -ArgumentList "--port $Port --no-browser --skip-update" -WindowStyle Hidden
  for ($i=0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      Invoke-RestMethod -Uri "$base/api/mitm/kiro" -Method Get -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {}
  }
}

if (-not $ready) {
  throw "Multiver lokal tidak merespons di $base."
}

$payload = @{
  apiKey = if ($ApiKey) { $ApiKey } else { "" }
  sudoPassword = ""
  mitmRouterBaseUrl = $Gateway
  forceKillPort443 = $false
  autoSetup = $true
} | ConvertTo-Json

try {
  $start = Invoke-RestMethod -Uri "$base/api/mitm/kiro" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 30
} catch {
  $body = $_.ErrorDetails.Message
  if ($body -match "PORT_443_BUSY") {
    Write-Host "Port 443 sedang dipakai proses lain. Buka Dashboard MITM lalu pilih 'Hentikan & Mulai' bila proses tersebut aman dihentikan."
  }
  throw
}

Write-Host "MITM berjalan : $($start.running)"
Write-Host "Sertifikat dipercaya : $($start.certTrusted)"
Write-Host "DNS Kiro aktif : $($start.dnsKiro)"

$diag = Invoke-RestMethod -Uri "$base/api/mitm/kiro/diagnostics" -Method Get -TimeoutSec 15
Write-Host ""
Write-Host "Status diagnostik : $($diag.overall)"
Write-Host "Status mesin MITM : $($diag.state)"
Write-Host "Gateway : $($diag.gatewayBaseUrl)"
Write-Host "Traffic Kiro terdeteksi : $($diag.trafficDetected)"

Write-Host ""
Write-Host "Entri hosts yang digunakan:"
Write-Host "127.0.0.1 runtime.us-east-1.kiro.dev"
Write-Host "127.0.0.1 q.us-east-1.amazonaws.com"
Write-Host "127.0.0.1 codewhisperer.us-east-1.amazonaws.com"

Write-Host ""
Write-Host "Selesai. Tutup dan buka kembali Kiro, lalu kirim satu prompt."
Write-Host "Dashboard MITM: $base/dashboard/mitm"
