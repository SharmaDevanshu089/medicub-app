import { useState } from 'react'

const WEB = ['/doctor', '/pharmacy', '/department', '/onboard', '/console'] as const

/** Side-by-side layout: same-origin iframes share localStorage + BroadcastChannel, so state is live across panes. */
export default function Demo() {
  const [web, setWeb] = useState<(typeof WEB)[number]>('/doctor')
  return (
    <div className="flex h-screen flex-col bg-cream-200">
      <nav className="flex items-center gap-2 bg-white px-3 py-2 shadow">
        <a href="/" className="rounded-lg bg-brand-600 px-2 py-1 font-black text-white">Medicub</a>
        {WEB.map((p) => (
          <button key={p} onClick={() => setWeb(p)} className={`rounded-lg px-3 py-1.5 font-semibold ${web === p ? 'bg-accent-50 text-accent-800 ring-1 ring-accent-600' : 'text-slate-700 hover:bg-slate-100'}`}>{p.slice(1)}</button>
        ))}
        <span className="ml-auto rounded bg-cream-200 px-2 py-0.5 text-sm font-semibold">Synthetic data</span>
      </nav>
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <iframe key={web} title="web app" src={web} className="min-w-0 flex-1 rounded-lg bg-white shadow" />
        <div className="flex w-[420px] shrink-0 flex-col items-center gap-2 overflow-auto">
          <iframe title="patient phone" src="/patient?embed=1" className="h-[calc(100%-250px)] min-h-[420px] w-full rounded-lg" />
          <iframe title="patient watch" src="/watch?embed=1" className="h-[240px] w-[240px] shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  )
}
