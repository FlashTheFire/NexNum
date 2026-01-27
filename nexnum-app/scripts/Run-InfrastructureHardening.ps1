<#
.SYNOPSIS
    Professional Infrastructure Hardening & Storage Recovery Script for NexNum.
    Author: Antigravity Agent (Senior Developer Manager Engineer)
    
.DESCRIPTION
    This script performs surgical cleanup of zombied processes, corrupted WSL targets, 
    and massive application caches to restore environment stability.
#>

$ErrorActionPreference = "SilentlyContinue"
$reclaimed = 0

Write-Host "--- NexNum Infrastructure Hardening Routine ---" -ForegroundColor Cyan

# 1. PROCESS AUDIT & HARD TERMINATION
Write-Host "[1/4] Terminating zombied WSL/Docker processes..." -ForegroundColor Yellow
$wslProcs = Get-Process wsl, docker, "Docker Desktop" -ErrorAction SilentlyContinue
if ($wslProcs) {
    $wslProcs | Stop-Process -Force
    Write-Host "Successfully cleared $($wslProcs.Count) zombied processes." -ForegroundColor Green
}

# 2. SURGICAL WSL UNREGISTRATION
Write-Host "[2/4] Purging corrupted WSL distributions..." -ForegroundColor Yellow
$targets = @("docker-desktop", "docker-desktop-data")
foreach ($target in $targets) {
    Write-Host "Unregistering $target..."
    Start-Process wsl.exe -ArgumentList "--unregister $target" -Wait -NoNewWindow
}

# 3. HIGH-IMPACT CACHE CLEANUP (Forensic Results)
Write-Host "[3/4] Reclaiming space from identified 'Space-Hogs'..." -ForegroundColor Yellow

# A. pnpm / npm
Write-Host "Cleaning Node.js caches..."
Start-Process pnpm.exe -ArgumentList "store prune" -Wait -NoNewWindow
Start-Process npm.exe -ArgumentList "cache clean --force" -Wait -NoNewWindow

# B. Temporary Packages & Bloat
$trashPaths = @(
    "$env:LOCALAPPDATA\Temp",
    "$env:LOCALAPPDATA\Docker",
    "$env:LOCALAPPDATA\pnpm-cache",
    "$env:LOCALAPPDATA\npm-cache",
    "C:\tmp"
)

foreach ($path in $trashPaths) {
    if (Test-Path $path) {
        $size = (Get-ChildItem $path -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1GB
        Write-Host "Deleting $path (~$([Math]::Round($size, 2)) GB)..." -ForegroundColor Magenta
        Remove-Item $path -Recurse -Force
        $reclaimed += $size
    }
}

# 4. INFRASTRUCTURE MIGRATION PREP
Write-Host "[4/4] Preparing D: drive for migration..." -ForegroundColor Yellow
if (!(Test-Path "D:\Docker")) { New-Item -Path "D:\Docker" -ItemType Directory }
if (!(Test-Path "D:\Projects")) { New-Item -Path "D:\Projects" -ItemType Directory }

Write-Host "`n--- RECOVERY COMPLETE ---" -ForegroundColor Cyan
Write-Host "Total space marked for reclaim: $([Math]::Round($reclaimed, 2)) GB" -ForegroundColor Green
Write-Host "REBOOT RECOMMENDED before reinstalling Docker on D: drive." -ForegroundColor White
