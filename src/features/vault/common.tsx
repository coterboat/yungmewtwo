// Small pieces the vault screens share: the "add your posting key" prompt, condition options,
// an animated number, and the celebration burst.
import { KeyRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePrefs } from '../../lib/prefs.ts'
import { money } from '../../lib/format.ts'
import { useJoinHint } from '../../lib/people.ts'

export const CONDITIONS = ['Near mint', 'Lightly played', 'Moderately played', 'Heavily played', 'Damaged', 'Sealed']

/** Whether this device can write to the repo (has a posting key). */
export function useCanWrite(): boolean {
  return !!usePrefs().token
}

/** Shown wherever a save would happen without a posting key. */
export function KeyPrompt({ compact }: { compact?: boolean }) {
  const hint = useJoinHint()
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[13px] text-ink-2">
      <KeyRound size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <span>
        {compact ? 'Saving needs your posting key. ' : 'Saving changes to your vault needs a posting key on this device. '}
        <a href="#/settings" className="font-medium text-accent underline underline-offset-2">
          Add it in Settings
        </a>
        {compact ? '.' : `. ${hint}`}
      </span>
    </div>
  )
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Eases a number toward its target. Jumps straight there when the viewer prefers reduced motion. */
export function useCountUp(target: number, ms = 800): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  const raf = useRef(0)
  useEffect(() => {
    if (prefersReducedMotion() || from.current === target) {
      from.current = target
      setShown(target)
      return
    }
    const start = performance.now()
    const a = from.current
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - (1 - t) ** 3
      const v = a + (target - a) * eased
      from.current = v
      setShown(v)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, ms])
  return shown
}

export function CountUpMoney({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value)
  return <span className={className}>{money(v)}</span>
}

const COLORS = ['#7dd3fc', '#a78bfa', '#f0abfc', '#fde68a', '#86efac']

/** A short burst of holo-colored confetti over the page. Renders nothing under reduced motion. */
export function Confetti({ burst }: { burst: number }) {
  const [live, setLive] = useState(0)
  useEffect(() => {
    if (!burst || prefersReducedMotion()) return
    setLive(burst)
    const t = setTimeout(() => setLive(0), 2200)
    return () => clearTimeout(t)
  }, [burst])
  if (!live) return null
  const pieces = Array.from({ length: 36 }, (_, i) => {
    const angle = (i / 36) * Math.PI * 2 + ((i * 37) % 11) * 0.05
    const dist = 140 + ((i * 53) % 120)
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 60, c: COLORS[i % COLORS.length], r: (i * 47) % 360, d: 0.9 + ((i * 29) % 7) / 10 }
  })
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      <style>{`@keyframes yt-burst{0%{transform:translate(0,0) rotate(0) scale(.4);opacity:1}70%{opacity:1}100%{transform:translate(var(--x),calc(var(--y) + 120px)) rotate(var(--r)) scale(1);opacity:0}}`}</style>
      <div className="absolute top-[38%] left-1/2">
        {pieces.map((p, i) => (
          <span key={i} className="absolute block h-2.5 w-1.5 rounded-[2px]" style={{ background: p.c, animation: `yt-burst ${p.d + 0.8}s cubic-bezier(.2,.7,.3,1) forwards`, ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--r' as string]: `${p.r + 360}deg` }} />
        ))}
      </div>
    </div>
  )
}
