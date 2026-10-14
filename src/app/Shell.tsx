// App frame: sidebar on desktop, top bar + bottom tabs on phones, global search, and the
// first-run "who's this?" picker.
import { MoreHorizontal, Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ProductSearch } from '../components/product.tsx'
import { Toaster } from '../components/toast.tsx'
import { Button, Sheet, cx } from '../components/ui.tsx'
import { useMe, usePeople } from '../lib/people.ts'
import { setPrefs, usePrefs } from '../lib/prefs.ts'
import { NAV } from './nav.ts'

function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('text-[19px] font-extrabold tracking-tight', className)}>
      <span className="holo-text">yungmewtwo</span>
    </span>
  )
}

function PersonChip({ onClick }: { onClick: () => void }) {
  const me = useMe()
  return (
    <button type="button" onClick={onClick} className="flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-3 pl-1 text-[13px] font-medium hover:border-line-strong">
      <span className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-black" style={{ background: me?.color ?? 'var(--surface-3)' }}>
        {me?.name.slice(0, 1) ?? '?'}
      </span>
      {me?.name ?? "Who's this?"}
    </button>
  )
}

function WhoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const people = usePeople()
  const { me } = usePrefs()
  return (
    <Sheet open={open} onClose={onClose} title="Who's looking?">
      <p className="mb-4 text-sm text-ink-2">This decides whose watchlist and vault you see, and who your posts come from. It's saved on this device only.</p>
      <div className="grid gap-2">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPrefs({ me: p.id })
              onClose()
            }}
            className={cx('flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition', me === p.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong')}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full font-bold text-black" style={{ background: p.color }}>
              {p.name.slice(0, 1)}
            </span>
            <span>
              <span className="block font-semibold">{p.name}</span>
              <span className="block text-[12px] text-ink-3">{p.area}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const [who, setWho] = useState(false)
  const [search, setSearch] = useState(false)
  const [more, setMore] = useState(false)
  const { me } = usePrefs()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!me && !location.pathname.startsWith('/join')) setWho(true)
  }, [me, location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => window.scrollTo(0, 0), [location.pathname])

  const navCls = ({ isActive }: { isActive: boolean }) =>
    cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition', isActive ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')

  return (
    <div className="lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
        <div className="mb-6 px-3">
          <Logo />
        </div>
        <button type="button" onClick={() => setSearch(true)} className="mb-4 flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-[13px] text-ink-3 hover:border-line-strong">
          <Search size={15} /> Search <kbd className="ml-auto text-[11px]">⌘K</kbd>
        </button>
        <nav className="grid gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={navCls}>
              <n.icon size={18} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-1">
          <PersonChip onClick={() => setWho(true)} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Search" onClick={() => setSearch(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
              <Search size={19} />
            </button>
            <PersonChip onClick={() => setWho(true)} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(96px+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-12">{children}</main>
      </div>

      {/* Phone bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {NAV.filter((n) => n.primary).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium', isActive ? 'text-accent' : 'text-ink-3')}>
            <n.icon size={21} />
            {n.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-ink-3">
          <MoreHorizontal size={21} />
          More
        </button>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="grid gap-1">
          {NAV.filter((n) => !n.primary).map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className={navCls}>
              <n.icon size={18} /> {n.label}
            </NavLink>
          ))}
        </div>
      </Sheet>

      <Sheet open={search} onClose={() => setSearch(false)} title="Find a card or product" wide>
        <ProductSearch
          autoFocus
          onPick={(row) => {
            setSearch(false)
            navigate(`/item/${row[0]}`)
          }}
        />
      </Sheet>

      <WhoSheet open={who} onClose={() => setWho(false)} />
      <Toaster />
    </div>
  )
}

export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-ink-2">{children ?? 'Being built right now.'}</p>
      <Button className="mt-4" onClick={() => history.back()}>
        Back
      </Button>
    </div>
  )
}
