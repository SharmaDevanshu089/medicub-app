import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'dist-windows')
const BUNDLE_DIR = path.join(OUT_DIR, 'Medicub-Desktop-Windows')

console.log('[package-windows] Preparing Windows desktop distribution...')

// Clean previous output
if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
}
fs.mkdirSync(BUNDLE_DIR, { recursive: true })

// 1. Copy web production assets
console.log('[package-windows] Copying production web builds...')
const v1Dist = path.join(ROOT, 'dist')
const v2Dist = path.join(ROOT, 'v2', 'dist')

if (fs.existsSync(v1Dist)) {
  fs.cpSync(v1Dist, path.join(BUNDLE_DIR, 'web'), { recursive: true })
}
if (fs.existsSync(v2Dist)) {
  fs.cpSync(v2Dist, path.join(BUNDLE_DIR, 'v2-web'), { recursive: true })
}

// 2. Copy server runtime files
console.log('[package-windows] Copying server files...')
fs.cpSync(path.join(ROOT, 'server'), path.join(BUNDLE_DIR, 'server'), { recursive: true })
fs.cpSync(path.join(ROOT, 'v2', 'server'), path.join(BUNDLE_DIR, 'v2-server'), { recursive: true })
fs.cpSync(path.join(ROOT, 'package.json'), path.join(BUNDLE_DIR, 'package.json'))
if (fs.existsSync(path.join(ROOT, 'package-lock.json'))) {
  fs.cpSync(path.join(ROOT, 'package-lock.json'), path.join(BUNDLE_DIR, 'package-lock.json'))
}

// 3. Create Windows Launcher Scripts
console.log('[package-windows] Generating Windows batch launchers...')

const startServerBat = `@echo off
title Medicub Backend Server
echo ===================================================
echo Starting Medicub v2 Server on http://localhost:8788
echo ===================================================
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm ci --omit=dev
)
call npx tsx v2-server/index.ts
pause
`
fs.writeFileSync(path.join(BUNDLE_DIR, 'Start-Server-Only.bat'), startServerBat)

const launchScribeBat = `@echo off
title Medicub v2 - Ambient Consultation Scribe
echo ===================================================
echo Launching Medicub v2 Ambient Consultation Scribe
echo ===================================================
cd /d "%~dp0"

echo Starting server in background...
start "Medicub Server" cmd /c "call npm run v2:server"

timeout /t 3 /nobreak >nul
echo Opening Medicub v2 in your default browser...
start http://localhost:5174

echo Press any key to stop all Medicub background processes.
pause >nul
taskkill /f /im node.exe >nul 2>&1
echo Closed.
`
fs.writeFileSync(path.join(BUNDLE_DIR, 'Launch-Medicub-v2-Scribe.bat'), launchScribeBat)

const launchDoctorBat = `@echo off
title Medicub - Doctor Console
echo ===================================================
echo Launching Medicub Doctor Console
echo ===================================================
cd /d "%~dp0"
start "Medicub Server" cmd /c "call npm run server"
timeout /t 3 /nobreak >nul
start http://localhost:5173/doctor
pause
`
fs.writeFileSync(path.join(BUNDLE_DIR, 'Launch-Doctor-Console.bat'), launchDoctorBat)

const launchPatientBat = `@echo off
title Medicub - Patient App
echo ===================================================
echo Launching Medicub Patient App
echo ===================================================
cd /d "%~dp0"
start "Medicub Server" cmd /c "call npm run server"
timeout /t 3 /nobreak >nul
start http://localhost:5173/patient
pause
`
fs.writeFileSync(path.join(BUNDLE_DIR, 'Launch-Patient-App.bat'), launchPatientBat)

// 4. Create README-WINDOWS.txt
const readme = `===================================================================
                   MEDICUB - WINDOWS DESKTOP PACKAGE
===================================================================

This portable distribution contains the compiled web clients, the backend
server with SQLite persistence, and 1-click launchers for Windows.

REQUIREMENTS:
- Node.js 20+ (https://nodejs.org) installed on your Windows machine.

HOW TO RUN:
1. Double-click "Launch-Medicub-v2-Scribe.bat" to start the new v2 Ambient
   Consultation Scribe with Wispr Flow integration on http://localhost:5174.
2. Double-click "Launch-Doctor-Console.bat" for the v1 Doctor Console.
3. Double-click "Launch-Patient-App.bat" for the v1 Patient App.
4. Double-click "Start-Server-Only.bat" to run only the backend API server
   (port 8788 for v2, port 8787 for v1).

DATA STORAGE:
All consultation cards, audit logs, and medical records are stored in
local SQLite database files under server/data/ and v2-server/data/.
===================================================================
`
fs.writeFileSync(path.join(BUNDLE_DIR, 'README-WINDOWS.txt'), readme)

// 5. Compress into ZIP archive
console.log('[package-windows] Compressing into medicub-windows-x64.zip...')
const zipPath = path.join(OUT_DIR, 'medicub-windows-x64.zip')

try {
  // Use PowerShell Compress-Archive on Windows
  execSync(
    `powershell -Command "Compress-Archive -Path '${BUNDLE_DIR}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  )
  console.log(`[package-windows] Successfully created: ${zipPath}`)
} catch (err) {
  console.warn('[package-windows] PowerShell Compress-Archive failed, zip may be created by CI:', err.message)
}
