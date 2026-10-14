// One post on the Board. The card changes shape with the post type: deals get a verdict, drawings
// a big live countdown, drops a go-live clock with an .ics download, events a when and where.
import { AlarmClock, Archive, ArchiveRestore, CalendarDays, CalendarPlus, Check, Clock, ExternalLink, MapPin, MoreHorizontal, Pencil, Sparkles, StickyNote, Tag, Ticket, Trash2, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from '../../components/toast.tsx'
import { Badge, Button, Card, cx } from '../../components/ui.tsx'
import { dropPhase, formatRange, formatWhen, isPast, isUrgent, statusOptions, TYPE_META } from '../../lib/board.ts'
import { buildIcs, calendarEventFor } from '../../lib/boardIcs.ts'
import { safeHref } from '../../lib/boardLinks.ts'
import { ago, money } from '../../lib/format.ts'
import type { Person, Post, PostType } from '../../lib/user.ts'
import type { BoardActions } from './actions.ts'
import { Avatar, AuthorChip, Countdown, ExternalLinkButton } from './bits.tsx'
import { DealInsight } from './DealInsight.tsx'

export const TYPE_ICON: Record<PostType, LucideIcon> = { deal: Tag, drawing: Ticket, drop: Zap, event: CalendarDays, note: StickyNote }

function downloadIcs(post: Post) {
  const ev = calendarEventFor(post)
  if (!ev) return
  const { filename, ...rest } = ev
  const blob = new Blob([buildIcs({ ...rest, stamp: Date.now() })], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const STATUS_LABEL: Record<string, string> = { got: 'Got it', skip: 'Passed', in: 'Entered', won: 'Won', lost: 'Lost' }

function StatusChip({ person, you, value, type }: { person: Person; you: boolean; value: string | undefined; type: PostType }) {
  const label = value ? (type === 'drawing' && value === 'skip' ? 'Skipping' : STATUS_LABEL[value] ?? value) : 'No answer yet'
  const won = value === 'won'
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-[12.5px]', won ? 'holo-ring border-transparent' : 'border-line', !value && 'text-ink-3')}>
      <Avatar person={person} size={20} />
      <span className="font-medium text-ink">{you ? 'You' : person.name}</span>
      <span className={cx(value ? 'text-ink-2' : 'text-ink-3')}>{label}</span>
      {won && <Sparkles size={12} className="text-ink" aria-hidden />}
    </span>
  )
}

function StatusBlock({ post, people, actions, disabled, onPick, past }: { post: Post; people: Person[]; actions: BoardActions; disabled: boolean; onPick: (v: string) => void; past: boolean }) {
  const opts = statusOptions(post.type)
  if (!opts.length) return null
  const meId = actions.me?.id
  const mine = meId ? post.status?.[meId] : undefined
  return (
    <div className="mt-3 grid gap-2.5">
      {meId && (
        <div role="group" aria-label="Your answer" className={cx('grid gap-2', opts.length === 2 ? 'grid-cols-2' : 'grid-cols-4')}>
          {opts.map((o) => {
            const on = mine === o.value
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onPick(o.value)}
                className={cx(
                  'inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-1 text-[13px] font-medium transition select-none active:scale-[0.97] disabled:opacity-60',
                  on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-ink-2 hover:border-line-strong hover:text-ink',
                )}
              >
                {on && <Check size={14} aria-hidden />}
                {o.label}
              </button>
            )
          })}
        </div>
      )}
      {past && post.type === 'drawing' && mine === 'in' && <p className="text-[12.5px] text-ink-2">Results in? Tap Won or Lost so you both know.</p>}
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => (
          <StatusChip key={p.id} person={p} you={p.id === meId} value={post.status?.[p.id]} type={post.type} />
        ))}
      </div>
    </div>
  )
}

function PostMenu({ post, busy, onEdit, onArchive, onDelete }: { post: Post; busy: boolean; onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  useEffect(() => {
    if (!open) setConfirm(false)
  }, [open])
  const item = 'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[14px] hover:bg-surface-2 disabled:opacity-50'
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Edit, archive or delete" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div role="menu" className="fade-in absolute right-0 bottom-full z-20 mb-1 w-56 rounded-2xl border border-line-strong bg-surface-3 p-1.5 shadow-2xl">
          {confirm ? (
            <div className="p-2">
              <p className="text-[13.5px]">Delete this for good? It's removed from the file for both of you.</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Button size="sm" className="!min-h-11" onClick={() => setConfirm(false)}>
                  Keep it
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="!min-h-11"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false)
                    onDelete()
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), onEdit())}>
                <Pencil size={16} aria-hidden /> Edit
              </button>
              <button type="button" role="menuitem" className={item} disabled={busy} onClick={() => (setOpen(false), onArchive())}>
                {post.archived ? <ArchiveRestore size={16} aria-hidden /> : <Archive size={16} aria-hidden />} {post.archived ? 'Move back to board' : 'Archive'}
              </button>
              <button type="button" role="menuitem" className={cx(item, 'text-down')} onClick={() => setConfirm(true)}>
                <Trash2 size={16} aria-hidden /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TimeBox({ label, children, sub, tone = 'plain', icon }: { label: string; children: ReactNode; sub?: string; tone?: 'plain' | 'urgent'; icon?: ReactNode }) {
  return (
    <div className={cx('mt-3 rounded-2xl px-4 py-3', tone === 'urgent' ? 'bg-accent-soft' : 'bg-surface-2')}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[30px] leading-tight font-bold tracking-tight">{children}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-ink-2">{sub}</div>}
    </div>
  )
}

export function PostCard({ post, people, now, actions, onEdit }: { post: Post; people: Person[]; now: number; actions: BoardActions; onEdit: (p: Post) => void }) {
  const [busy, setBusy] = useState(false)
  const author = people.find((p) => p.id === post.by)
  const mine = !!actions.me && actions.me.id === post.by
  const past = isPast(post, now)
  const urgent = isUrgent(post, now)
  const rawPhase = post.type === 'drop' ? dropPhase(post, now) : undefined
  // An archived drop is done with, even if its live window hasn't run out.
  const phase = rawPhase === 'live' && post.archived ? 'over' : rawPhase
  const live = phase === 'live' && !post.archived
  const href = safeHref(post.url)
  const Icon = TYPE_ICON[post.type]
  // Nothing to schedule once a drop is live; deals only have an end time, which isn't worth a calendar entry.
  const canCalendar = !past && !!calendarEventFor(post) && post.type !== 'deal' && !(post.type === 'drop' && phase !== 'upcoming')

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const respond = (value: string) => {
    if (!actions.canPost) {
      toast('Add your posting key in Settings to respond.', 'error')
      return
    }
    void run(() => actions.respond(post, value))
  }

  const linkLabel = post.type === 'deal' ? 'Open deal' : post.type === 'drawing' ? 'Enter' : post.type === 'drop' ? 'Open page' : 'Details'

  return (
    <Card className="fade-in p-4" holo={(urgent || live) && !post.archived}>
      <div className={cx(past && 'opacity-70')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-ink-3">
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-2 font-semibold text-accent">
            <Icon size={13} aria-hidden /> {TYPE_META[post.type].label}
          </span>
          {post.store && <span className="min-w-0 truncate">{post.store}</span>}
          <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
            {post.archived && <Badge icon={<Archive size={11} aria-hidden />}>Archived</Badge>}
            {!post.archived && past && post.type !== 'note' && <Badge>{post.type === 'drop' || post.type === 'event' ? 'Over' : 'Closed'}</Badge>}
            {urgent && !post.archived && (
              <Badge tone="holo" icon={<AlarmClock size={12} aria-hidden />}>
                Closing soon
              </Badge>
            )}
          </span>
        </div>
        <h3 className="mt-2 text-[16px] leading-snug font-semibold [overflow-wrap:anywhere]">{post.title}</h3>

        {post.type === 'deal' && (
          <>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <div className="flex items-baseline gap-2">
                {post.price != null ? <span className="text-[30px] leading-none font-bold tracking-tight tabular">{money(post.price)}</span> : <span className="text-sm text-ink-3">No price listed</span>}
                {post.qty ? <span className="text-sm text-ink-3">× {post.qty}</span> : null}
              </div>
              {post.ends && (
                <span className="inline-flex items-center gap-1 text-[13px] text-ink-2">
                  <Clock size={14} aria-hidden />
                  {Date.parse(post.ends) > now ? (
                    <>
                      Ends in <Countdown to={post.ends} className="font-medium text-ink" />
                    </>
                  ) : (
                    'Ended'
                  )}
                </span>
              )}
            </div>
            {post.productId ? (
              <DealInsight className="mt-3" productId={post.productId} price={post.price} />
            ) : (
              post.price != null && <p className="mt-2 text-[12.5px] text-ink-3">Not scored: no product linked, so there's nothing to compare the price to.</p>
            )}
          </>
        )}

        {post.type === 'drawing' && (
          <>
            {post.ends &&
              (past ? (
                <TimeBox label="Entries closed">
                  <span className="text-[20px] text-ink-2">{formatWhen(post.ends, now)}</span>
                </TimeBox>
              ) : (
                <TimeBox label="Entries close in" tone={urgent ? 'urgent' : 'plain'} icon={urgent ? <AlarmClock size={14} aria-hidden /> : undefined} sub={`Closes ${formatWhen(post.ends, now)}`}>
                  <Countdown to={post.ends} />
                </TimeBox>
              ))}
            {post.productId ? <DealInsight className="mt-3" productId={post.productId} price={undefined} /> : null}
          </>
        )}

        {post.type === 'drop' && post.starts && (
          <>
            {phase === 'upcoming' && (
              <TimeBox label="Goes live in" sub={formatWhen(post.starts, now)}>
                <Countdown to={post.starts} closedLabel="Live now" />
              </TimeBox>
            )}
            {phase !== 'upcoming' && (
              <TimeBox label={phase === 'live' ? 'Just dropped' : 'Went live'} tone={phase === 'live' ? 'urgent' : 'plain'} icon={phase === 'live' ? <Zap size={14} aria-hidden /> : undefined} sub={`${formatWhen(post.starts, now)} · ${ago(post.starts, now)}`}>
                {phase === 'live' ? (
                  <span
                    style={{ background: 'linear-gradient(115deg, #0284c7, #7c3aed 35%, #db2777 65%, #d97706)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
                  >
                    Live now
                  </span>
                ) : (
                  <span className="text-[20px] text-ink-2">Over</span>
                )}
              </TimeBox>
            )}
            {(post.where || post.price != null) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-ink-2">
                {post.where && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={14} aria-hidden /> {post.where}
                  </span>
                )}
                {post.price != null && <span>Expected price {money(post.price)}</span>}
              </div>
            )}
            {post.productId ? <DealInsight className="mt-3" productId={post.productId} price={post.price} /> : null}
          </>
        )}

        {post.type === 'event' && post.starts && (
          <div className="mt-2 grid gap-1.5 text-[14px]">
            <div className="flex items-start gap-2">
              <CalendarDays size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>{formatRange(post.starts, post.ends, now)}</span>
            </div>
            {(post.where || post.store) && (
              <div className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <span className="[overflow-wrap:anywhere]">{post.where ?? post.store}</span>
              </div>
            )}
            {Date.parse(post.starts) > now && (
              <div className="flex items-center gap-2 text-ink-2">
                <Clock size={16} className="shrink-0 text-ink-3" aria-hidden />
                <span>
                  Starts in <Countdown to={post.starts} className="font-medium text-ink" />
                </span>
              </div>
            )}
          </div>
        )}

        {post.note && <p className="mt-3 text-[14px] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{post.note}</p>}
      </div>

      {(href || canCalendar) && post.type !== 'deal' && (
        <div className={cx('mt-3 grid gap-2', href && canCalendar ? 'grid-cols-2' : 'grid-cols-1')}>
          {href && (
            <ExternalLinkButton href={href} variant={post.type === 'drawing' && !past ? 'primary' : 'secondary'}>
              {linkLabel} <ExternalLink size={15} aria-hidden />
            </ExternalLinkButton>
          )}
          {canCalendar && (
            <Button className="!px-2 !text-[13px] whitespace-nowrap" onClick={() => downloadIcs(post)}>
              <CalendarPlus size={16} aria-hidden /> Add to calendar
            </Button>
          )}
        </div>
      )}
      {post.type === 'deal' && href && (
        <ExternalLinkButton href={href} className="mt-3 w-full">
          {linkLabel} <ExternalLink size={15} aria-hidden />
        </ExternalLinkButton>
      )}

      <StatusBlock post={post} people={people} actions={actions} disabled={busy} onPick={respond} past={past} />

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5">
        <AuthorChip person={author} fallback={post.by} />
        <span className="min-w-0 truncate text-[12px] text-ink-3">posted {ago(post.at, now)}</span>
        {mine && (
          <span className="-mr-2 ml-auto">
            <PostMenu
              post={post}
              busy={busy}
              onEdit={() => (actions.canPost ? onEdit(post) : toast('Add your posting key in Settings to edit.', 'error'))}
              onArchive={() => (actions.canPost ? void run(() => actions.setArchived(post, !post.archived)) : toast('Add your posting key in Settings to do that.', 'error'))}
              onDelete={() => (actions.canPost ? void run(() => actions.remove(post)) : toast('Add your posting key in Settings to do that.', 'error'))}
            />
          </span>
        )}
      </div>
    </Card>
  )
}
