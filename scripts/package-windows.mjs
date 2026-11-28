import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'dist-windows')
const BUNDLE_DIR = path.join(OUT_DIR, 'Medicub-v2-Windows')

console.log('[package-windows] Preparing Medicub v2 Windows desktop distribution...')

if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
}
fs.mkdirSync(BUNDLE_DIR, { recursive: true })

// 1. Copy built v2 web assets
const v2Dist = path.join(ROOT, 'v2', 'dist')
if (!fs.existsSync(v2Dist)) {
  throw new Error('v2/dist does not exist. Run "npm run v2:build" before packaging Windows bundle.')
}
fs.cpSync(v2Dist, path.join(BUNDLE_DIR, 'v2', 'dist'), { recursive: true })

// 2. Copy v2 server & core AI/store modules
fs.cpSync(path.join(ROOT, 'v2', 'server'), path.join(BUNDLE_DIR, 'v2', 'server'), { recursive: true })
fs.cpSync(path.join(ROOT, 'v2', 'src'), path.join(BUNDLE_DIR, 'v2', 'src'), { recursive: true })
fs.cpSync(path.join(ROOT, 'v2', 'package.json'), path.join(BUNDLE_DIR, 'v2', 'package.json'))
if (fs.existsSync(path.join(ROOT, 'v2', 'package-lock.json'))) {
  fs.cpSync(path.join(ROOT, 'v2', 'package-lock.json'), path.join(BUNDLE_DIR, 'v2', 'package-lock.json'))
}
if (fs.existsSync(path.join(ROOT, '.env.example'))) {
  fs.cpSync(path.join(ROOT, '.env.example'), path.join(BUNDLE_DIR, '.env.example'))
}

// 3. Create Windows Launcher Scripts
const launchAppBat = `@echo off
title Medicub v2 - Ambient Consultation Scribe
echo ===================================================
echo Launching Medicub v2 on http://localhost:3000
echo ===================================================
cd /d "%~dp0"
set PORT=3000
start "Medicub v2 Server" cmd /c "npx --yes tsx v2/server/index.ts"
timeout /t 3 /nobreak >nul
start http://localhost:3000
echo Browser opened! Close the server window to stop Medicub v2.
pause
`
fs.writeFileSync(path.join(BUNDLE_DIR, 'Launch-Medicub-v2.bat'), launchAppBat)

const startServerBat = `@echo off
title Medicub v2 Backend + Web UI (:3000)
cd /d "%~dp0"
set PORT=3000
npx --yes tsx v2/server/index.ts
pause
`
fs.writeFileSync(path.join(BUNDLE_DIR, 'Start-v2-Server.bat'), startServerBat)

const readme = `===================================================================
            MEDICUB v2 - WINDOWS DESKTOP PACKAGE
===================================================================

REQUIREMENTS:
- Node.js 20+ (https://nodejs.org) installed on Windows.

HOW TO RUN:
1. Double-click "Launch-Medicub-v2.bat" to start Medicub v2 and open
   http://localhost:3000 in your default browser.
2. No API keys or .env files are required (built-in offline fallback
   is active by default; see .env.example for optional Wispr Flow keys).

ENDPOINTS & PAGES:
- Main Launcher  : http://localhost:3000/
- Patient App    : http://localhost:3000/patient
- Doctor Console : http://localhost:3000/doctor
- Clinic Desk QR : http://localhost:3000/qr
===================================================================
`
fs.writeFileSync(path.join(BUNDLE_DIR, 'README-WINDOWS.txt'), readme)

// 4. Compress into ZIP archive
const zipPath = path.join(OUT_DIR, 'medicub-v2-windows-x64.zip')
console.log('[package-windows] Compressing into medicub-v2-windows-x64.zip...')
execSync(
  `powershell -Command "Compress-Archive -Path '${BUNDLE_DIR}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
)
console.log(`[package-windows] Successfully created: ${zipPath}`)
