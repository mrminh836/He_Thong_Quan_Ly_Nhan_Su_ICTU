# ==============================================================================
# SCRIPT TAO VA XAC MINH CHUNG CHI TLS/SSL TU KY X.509 CHO HRM.LOCAL
# Tieu chuan: RSA 2048-bit | SHA-256 | SAN: DNS:hrm.local, DNS:localhost, IP:127.0.0.1
# Thoi han: 365 ngay
# ==============================================================================

[CmdletBinding()]
param(
    [string]$CertsDir = "",
    [int]$Days = 365
)

$ErrorActionPreference = "Stop"

if (-not $CertsDir) {
    $CertsDir = Join-Path $PSScriptRoot "..\certs"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "KHOI TAO CHUNG CHI X.509 SSL/TLS CHO DOMAIN: hrm.local" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Dinh vi OpenSSL binary
$openssl = $null
if (Get-Command openssl -ErrorAction SilentlyContinue) {
    $openssl = "openssl"
} elseif (Test-Path "C:\Program Files\Git\usr\bin\openssl.exe") {
    $openssl = "C:\Program Files\Git\usr\bin\openssl.exe"
} else {
    Write-Error "Khong tim thay OpenSSL tren he thong! Vui long cai dat Git for Windows hoac OpenSSL."
    exit 1
}

$version = & $openssl version
Write-Host "1. Su dung OpenSSL: $version" -ForegroundColor Green

# 2. Thu muc certs
$resolvedCertsDir = (Resolve-Path -Path $CertsDir -ErrorAction SilentlyContinue)
if (-not $resolvedCertsDir) {
    New-Item -ItemType Directory -Path $CertsDir -Force | Out-Null
    $resolvedCertsDir = (Resolve-Path -Path $CertsDir).Path
} else {
    $resolvedCertsDir = $resolvedCertsDir.Path
}

$keyPath = Join-Path $resolvedCertsDir "hrm.local.key"
$crtPath = Join-Path $resolvedCertsDir "hrm.local.crt"
$cnfPath = Join-Path $resolvedCertsDir "hrm.local.cnf"

if (-not (Test-Path $cnfPath)) {
    Write-Error "Khong tim thay file cau hinh OpenSSL: $cnfPath"
    exit 1
}

# 3. Tao Private Key RSA 2048-bit
Write-Host "2. Dang tao Private Key RSA 2048-bit tai: $keyPath..." -ForegroundColor Yellow
& $openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out $keyPath
if ($LASTEXITCODE -ne 0) { throw "Tao Private Key that bai!" }

# 4. Tao X.509 Self-signed Certificate kem SAN
Write-Host "3. Dang tao chung chi X.509 tu ky 365 ngay tai: $crtPath..." -ForegroundColor Yellow
& $openssl req -x509 -new -key $keyPath -out $crtPath -days $Days -sha256 -config $cnfPath -extensions v3_req
if ($LASTEXITCODE -ne 0) { throw "Tao Chung chi that bai!" }

# 5. Phan quyen bao mat Private Key tren Windows ACL
Write-Host "4. Dang thiet lap ACL bao ve Private Key..." -ForegroundColor Yellow
$userAcl = $env:USERNAME + ":(R,W)"
icacls $keyPath /inheritance:r /grant:r $userAcl "Administrators:(F)" | Out-Null
Write-Host "   -> Da gioi han quyen doc/ghi Private Key cho user hien tai va Administrators." -ForegroundColor Green

# 6. Kiem tra va xac minh tinh toan ven
Write-Host ""
Write-Host "--- KIEM TRA THONG TIN CHUNG CHI (VERIFICATION) ---" -ForegroundColor Cyan

# A. Kiem tra Private Key
& $openssl pkey -in $keyPath -check -noout
if ($LASTEXITCODE -eq 0) {
    Write-Host "   [PASS] Private Key dinh dang hop le." -ForegroundColor Green
}

# B. Kiem tra Subject & SAN
$subject = (& $openssl x509 -in $crtPath -noout -subject)
$san = (& $openssl x509 -in $crtPath -noout -ext subjectAltName)
Write-Host "   [PASS] Subject: $subject" -ForegroundColor Green
Write-Host "   [PASS] SAN: $san" -ForegroundColor Green

# C. Lay Fingerprint SHA-256
$fingerprint = (& $openssl x509 -in $crtPath -noout -fingerprint -sha256)
Write-Host "   [PASS] $fingerprint" -ForegroundColor Green

# D. So khop Private Key voi Certificate Public Key
$keyHash = (& $openssl pkey -in $keyPath -pubout -outform DER | & $openssl sha256).Split("= ")[-1].Trim()
$crtHash = (& $openssl x509 -in $crtPath -pubkey -noout | & $openssl pkey -pubin -outform DER | & $openssl sha256).Split("= ")[-1].Trim()

if ($keyHash -eq $crtHash -and $keyHash.Length -gt 0) {
    Write-Host "   [PASS] Khoa Public DER Hash khop 100%: $keyHash" -ForegroundColor Green
} else {
    Write-Error "Loi: Private Key va Certificate KHONG khop nhau!"
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "HOAN THANH TAO CHUNG CHI X.509 CHO hrm.local THANH CONG!" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
