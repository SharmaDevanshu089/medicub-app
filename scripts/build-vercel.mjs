// Builds Vercel "Build Output API" v3: Medicub v2 web app as static files + the Scribe API as one Node function.
// Vercel runs this as the project's build command; it also works locally (`npm run build:vercel`).
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

const out = '.vercel/output'
rmSync(out, { recursive: true, force: true })

// 1. Web app (Medicub v2: doctor, patient, clinic qr, pharmacy, records, ambient scribe). API is same-origin (/api).
console.log('[build-vercel] Building Medicub v2 frontend...')
execSync('npm --prefix v2 run build', { stdio: 'inherit', env: { ...process.env, VITE_API_URL: '' } })
cpSync('v2/dist', `${out}/static`, { recursive: true })

// 2. API function: bundle v2/server/vercel.ts into one ESM file.
console.log('[build-vercel] Bundling v2 API serverless function...')
const fn = `${out}/functions/api.func`
mkdirSync(fn, { recursive: true })
await build({
  entryPoints: ['v2/server/vercel.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: `${fn}/index.mjs`,
  // some dependencies use require(); give the ESM bundle one
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
})
writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      maxDuration: 30,
      regions: ['bom1'],
    },
    null,
    2
  )
)

// 3. Routing: /api/* → function, real files as-is, everything else → the single-page app.
writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2
  )
)
console.log('[build-vercel] Vercel build output ready in', out)
