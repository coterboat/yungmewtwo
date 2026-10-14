// The Board: the shared feed of deals, drawings, drops, events and notes the two of you post.
import { BellRing, CalendarDays, Megaphone, Plus, Tag, Ticket, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Chips, Empty, ErrorNote, PageHeader, Segmented, Skeleton } from '../../components/ui.tsx'
import { countByType, filterPosts, scopeCounts, sortPosts, TYPE_META, type Scope, type TypeFilter } from '../../lib/board.ts'
import { emptyDraft, parsePrefill, postToDraft, prefillToDraft, type Draft } from '../../lib/boardCompose.ts'
import { usePeople } from '../../lib/people.ts'
import { usePrefs } from '../../lib/prefs.ts'
import type { Post } from '../../lib/user.ts'
import { loadUserFile, useUserFile } from '../../lib/userData.ts'
import { useBoardActions } from './actions.ts'
import { NeedKeyNote, useColumns, useNow } from './bits.tsx'
import { Composer } from './Composer.tsx'
import { PostCard } from './PostCard.tsx'

const NO_POSTS: Post[] = []

const PITCH = [
  { icon: Tag, title: 'Deals, scored', text: 'Link a product and it says steal or pass against market, per pack, with flip math.' },
  { icon: Ticket, title: 'Drawings, timed', text: 'A live countdown and who has entered, so nobody misses a deadline.' },
  { icon: Zap, title: 'Drops, on your calendar', text: 'Go-live times with one tap to add them to your phone.' },
]

export default function BoardPage() {
  const { data: posts, error, saving } = useUserFile<Post>('posts')
  const people = usePeople()
  const actions = useBoardActions()
  const prefs = usePrefs()
  const now = useNow(30_000)
  const [type, setType] = useState<TypeFilter>('all')
  const [scope, setScope] = useState<Scope>('open')
  const [composer, setComposer] = useState<{ draft: Draft; editing?: Post; key: number } | null>(null)
  const [params, setParams] = useSearchParams()

  const columns = useColumns()
  const edit = (post: Post) => setComposer({ draft: postToDraft(post), editing: post, key: Date.now() })
  const openNew = () => setComposer({ draft: emptyDraft(type === 'all' ? 'deal' : type), key: Date.now() })

  // Other screens link here with ?new=deal&product=…&price=…&store=…&url=…&title=… to prefill the composer.
  useEffect(() => {
    const pre = parsePrefill(params)
    if (!pre) return
    setComposer({ draft: prefillToDraft(pre), key: Date.now() })
    setParams({}, { replace: true })
  }, [params, setParams])

  // Keep the feed fresh: re-read when the tab comes back, and once a minute while it is open.
  const savingRef = useRef(saving)
  useEffect(() => {
    savingRef.current = saving
  })
  const hadData = useRef(posts !== undefined)
  useEffect(() => {
    if (!prefs.token) return
    const refresh = () => {
      if (document.visibilityState === 'visible' && !savingRef.current) void loadUserFile('posts', true)
    }
    if (hadData.current) refresh()
    document.addEventListener('visibilitychange', refresh)
    const id = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(id)
    }
  }, [prefs.token])

  const all = posts ?? NO_POSTS
  const counts = useMemo(() => countByType(all, scope, now), [all, scope, now])
  const scopes = useMemo(() => scopeCounts(all, now), [all, now])
  const list = useMemo(() => sortPosts(filterPosts(all, type, scope, now), now, scope), [all, type, scope, now])

  const typeOptions: Array<{ value: TypeFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'deal', label: TYPE_META.deal.plural, count: counts.deal },
    { value: 'drawing', label: TYPE_META.drawing.plural, count: counts.drawing },
    { value: 'drop', label: TYPE_META.drop.plural, count: counts.drop },
    { value: 'event', label: TYPE_META.event.plural, count: counts.event },
    { value: 'note', label: TYPE_META.note.plural, count: counts.note },
  ]

  const loading = posts === undefined && !error
  const nothingAtAll = posts !== undefined && posts.length === 0

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader
        title="Board"
        sub="Deals, drawings and drop times in one place, instead of the group text."
        action={
          <div className="hidden lg:block">
            <Button variant="primary" onClick={openNew}>
              <Plus size={17} aria-hidden /> Post
            </Button>
          </div>
        }
      />

      {!prefs.token && <NeedKeyNote className="mb-5" />}
      {error && <ErrorNote>Couldn't load the latest board ({error}). What you see may be out of date.</ErrorNote>}

      {loading && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      )}

      {nothingAtAll && (
        <div className="mt-2">
          <Empty
            icon={<Megaphone size={20} />}
            title="Nothing on the board yet"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" onClick={openNew}>
                  <Plus size={17} aria-hidden /> Post the first one
                </Button>
                {!prefs.ntfyTopic && (
                  <Link to="/settings" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent">
                    <BellRing size={16} aria-hidden /> Turn on phone alerts
                  </Link>
                )}
              </div>
            }
          >
            Drop deals, drawings and drop times here instead of texting them — you'll both get a phone alert.
          </Empty>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {PITCH.map((p) => (
              <div key={p.title} className="rounded-2xl border border-line bg-surface p-4">
                <p.icon size={18} className="text-accent" aria-hidden />
                <div className="mt-2 text-[14px] font-semibold">{p.title}</div>
                <p className="mt-1 text-[13px] text-ink-2">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {posts && posts.length > 0 && (
        <>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 lg:flex-1">
              <Chips options={typeOptions} value={type} onChange={setType} />
            </div>
            <Segmented
              className="self-start"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'open', label: `Open · ${scopes.open}` },
                { value: 'past', label: `Past · ${scopes.past}` },
              ]}
            />
          </div>

          {list.length === 0 ? (
            <Empty icon={<CalendarDays size={20} />} title={scope === 'open' ? `No open ${type === 'all' ? 'posts' : TYPE_META[type].plural.toLowerCase()} right now` : `No past ${type === 'all' ? 'posts' : TYPE_META[type].plural.toLowerCase()} yet`}
              action={
                scope === 'open' && scopes.past > 0 ? (
                  <Button onClick={() => setScope('past')}>See past posts</Button>
                ) : type !== 'all' ? (
                  <Button onClick={() => setType('all')}>Show everything</Button>
                ) : undefined
              }
            >
              {scope === 'open' ? 'Anything that is still live shows up here, soonest deadline first.' : 'Closed, expired and archived posts land here.'}
            </Empty>
          ) : (
            // Cards differ a lot in height, so lay them out as independent columns (alternating, so
            // the soonest deadlines stay at the top of both) instead of rows with gaps.
            <div className={columns === 2 ? 'grid grid-cols-2 items-start gap-4' : 'grid grid-cols-1 gap-4'}>
              {Array.from({ length: columns }, (_, c) => (
                <div key={c} className="grid min-w-0 grid-cols-1 content-start gap-4">
                  {list
                    .filter((_, i) => i % columns === c)
                    .map((p) => (
                      <PostCard key={p.id} post={p} people={people} now={now} actions={actions} onEdit={edit} />
                    ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Thumb-reachable on phones, sitting above the bottom tabs. */}
      <button
        type="button"
        onClick={openNew}
        aria-label="New post"
        className="fixed right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 inline-flex h-14 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-ink shadow-[0_8px_28px_rgba(139,92,246,0.45)] transition active:scale-95 lg:hidden"
      >
        <Plus size={20} aria-hidden /> Post
      </button>

      {composer && <Composer key={composer.key} initial={composer.draft} editing={composer.editing} actions={actions} onClose={() => setComposer(null)} />}
    </div>
  )
}
