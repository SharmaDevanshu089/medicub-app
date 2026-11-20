// Builds Vercel "Build Output API" v3: web apps as static files + the API as one Node function.
// Vercel runs this as the project's build command; it also works locally (`npm run build:vercel`).
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

const out = '.vercel/output'
rmSync(out, { recursive: true, force: true })

// 1. Web apps (doctor, pharmacy, patient, watch, department, console). API is same-origin (/api).
execSync('npx vite build --outDir dist', { stdio: 'inherit', env: { ...process.env, VITE_API_URL: '' } })
cpSync('dist', `${out}/static`, { recursive: true })

// 2. API function: bundle everything into one ESM file.
const fn = `${out}/functions/api.func`
mkdirSync(fn, { recursive: true })
await build({
  entryPoints: ['server/vercel.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: `${fn}/index.mjs`,
  // some dependencies use require(); give the ESM bundle one
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
})
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30, regions: ['bom1'] }, null, 2))

// 3. Routing: /api/* → function, real files as-is, everything else → the single-page app.
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '^/api(/.*)?$', dest: '/api' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
}, null, 2))
console.log('Vercel build output ready in', out)
