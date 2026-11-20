import { useEffect, useState, type ReactNode } from 'react'

/** Scale a fixed-size device frame down to fit the window (for the iframe demo layout). */
function useFit(w: number, h: number): number {
  const calc = () => Math.min(1, (window.innerWidth - 16) / w, (window.innerHeight - 16) / h)
  const [s, setS] = useState(calc)
  useEffect(() => {
    const on = () => setS(calc())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  })
  return s
}

// In the Android app (patient-only build) the screen is the real phone, so no mock bezel.
const NATIVE = import.meta.env.VITE_APP === 'patient'

export function DeviceFrame({ w, h, round = false, children }: { w: number; h: number; round?: boolean; children: ReactNode }) {
  if (NATIVE) return <div className="relative h-dvh w-full overflow-hidden bg-cream-50">{children}</div> // build-time constant, so hook order below never changes
  const scale = useFit(w + 24, h + 24)
  return (
    <div className="grid min-h-screen place-items-center overflow-hidden bg-cream-200">
      <div style={{ width: (w + 24) * scale, height: (h + 24) * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} className={`bg-slate-900 p-3 shadow-2xl ${round ? 'rounded-full' : 'rounded-[48px]'}`}>
          <div style={{ width: w, height: h }} className={`relative overflow-hidden ${round ? 'rounded-full bg-black text-white' : 'rounded-[38px] bg-cream-100'}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-IN'
  speechSynthesis.speak(u)
}
