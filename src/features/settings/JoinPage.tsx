// /join?p=<person>&k=<posting key>&t=<alert topic>: the link Alex texts. It saves who you are, your
// key and the alert topic on this device, scrubs itself out of the address bar, then walks through
// the three things left to do: phone alerts, home screen, open the app.
import { ArrowRight, Bell, CircleCheck, Smartphone, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Card } from '../../components/ui.tsx'
import { parseJoinParams } from '../../lib/invite.ts'
import { personName, usePeople } from '../../lib/people.ts'
import { setPrefs, usePrefs } from '../../lib/prefs.ts'
import { Avatar } from '../board/bits.tsx'
import { runCheck } from './KeySection.tsx'
import { NtfySteps, StepList } from './shared.tsx'

type KeyState = 'none' | 'checking' | 'ok' | 'rejected' | 'offline'

function platform(): 'ios' | 'android' | 'other' {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other'
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[15px] font-bold text-accent-ink" aria-hidden>
          {n}
        </span>
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </Card>
  )
}

export default function JoinPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // Read the link once, before anything touches the address bar.
  const [link] = useState(() => parseJoinParams(location.search))
  const prefs = usePrefs()
  const people = usePeople()
  const started = useRef(false)
  const [key, setKey] = useState<KeyState>(link.token ? 'checking' : 'none')

  const verify = async (token: string) => {
    setKey('checking')
    const result = await runCheck(token)
    if (result.state === 'ok') {
      setPrefs({ token })
      setKey('ok')
    } else if (result.state === 'bad' && result.offline) {
      // Can't tell right now: keep the key so the link doesn't have to be reopened, and say so.
      setPrefs({ token })
      setKey('offline')
    } else {
      setKey('rejected')
    }
  }

  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice in dev; do this once
    started.current = true
    // Save who you are and the alert topic no matter what; only a key that works replaces the old one.
    if (link.person) setPrefs({ me: link.person })
    if (link.topic) setPrefs({ ntfyTopic: link.topic })
    if (link.scanKey) setPrefs({ anthropicKey: link.scanKey })
    // Take the key out of the address bar and browser history straight away.
    if (location.search) navigate('/join', { replace: true })
    if (link.token) void verify(link.token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const meId = prefs.me ?? link.person
  const name = personName(people, meId ?? undefined)
  const me = people.find((p) => p.id === meId)
  const os = platform()
  const topic = prefs.ntfyTopic

  const homeScreen = {
    ios: (
      <>
        On an iPhone, open this page in <b>Safari</b>, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.
      </>
    ),
    android: (
      <>
        On Android, open this page in <b>Chrome</b>, tap the <b>⋮</b> menu, then <b>Add to Home screen</b>.
      </>
    ),
  }

  return (
    <div className="mx-auto max-w-xl pb-10">
      <div className="mb-6 text-center">
        <div className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Welcome to</div>
        <div className="mt-1 text-[34px] leading-tight font-extrabold tracking-tight">
          <span className="holo-text">yungmewtwo</span>
        </div>
      </div>

      <Card className="p-5" holo={key === 'ok'}>
        {me ? (
          <div className="flex items-center gap-4">
            <Avatar person={me} size={56} />
            <div className="min-w-0">
              <h1 className="text-[22px] leading-tight font-bold tracking-tight">You're set up as {name}</h1>
              <p className="mt-0.5 text-[13.5px] text-ink-2">This is saved on this phone only.</p>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-[20px] font-bold tracking-tight">Who are you?</h1>
            <p className="mt-1 text-[13.5px] text-ink-2">This link didn't say who it was for. Pick yourself:</p>
            <div className="mt-3 grid gap-2">
              {people.map((p) => (
                <button key={p.id} type="button" onClick={() => setPrefs({ me: p.id })} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 text-left hover:border-line-strong">
                  <Avatar person={p} size={36} />
                  <span className="font-semibold">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4 text-[14px]" role="status">
          {key === 'checking' && <p className="text-ink-2">Checking your posting key…</p>}
          {key === 'ok' && (
            <p className="flex items-start gap-2 font-medium text-up">
              <CircleCheck size={18} className="mt-px shrink-0" aria-hidden /> Your posting key works. You can post deals and answer drawings.
            </p>
          )}
          {key === 'offline' && (
            <p className="flex items-start gap-2 text-ink-2">
              <TriangleAlert size={18} className="mt-px shrink-0" aria-hidden />
              <span>
                Couldn't reach GitHub to check your key, so it's saved but untested. If posting fails later, open Settings and tap Check again.
              </span>
            </p>
          )}
          {key === 'rejected' && (
            <div className="flex items-start gap-2 text-ink">
              <TriangleAlert size={18} className="mt-px shrink-0 text-down" aria-hidden />
              <p>
                <b>That posting key didn't work.</b> It may have expired or been switched off. Ask Alex for a new link. Your name{topic ? ' and alert topic are' : ' is'} saved, and you can look around in the meantime, you just can't post yet.
              </p>
            </div>
          )}
          {key === 'none' && (
            <p className="text-ink-2">{prefs.token ? 'Your posting key is saved on this phone.' : "There's no posting key on this phone, so you're read-only for now. Ask Alex for a new link to post."}</p>
          )}
        </div>
      </Card>

      <h2 className="mt-8 mb-3 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Three quick things</h2>
      <div className="grid gap-4">
        <Step n={1} title="Get phone alerts">
          {topic ? (
            <>
              <p className="mb-3 flex items-start gap-2 text-[13.5px] text-ink-2">
                <Bell size={16} className="mt-0.5 shrink-0" aria-hidden /> Price drops, drawings closing, drops going live and new posts buzz your phone.
              </p>
              <NtfySteps topic={topic} />
            </>
          ) : (
            <p className="text-[14px] text-ink-2">This link didn't include an alert topic. Ask Alex for it, then paste it under Settings, Alerts.</p>
          )}
        </Step>

        <Step n={2} title="Add it to your home screen">
          <p className="mb-3 text-[13.5px] text-ink-2">So it opens like an app, one tap from your home screen.</p>
          <StepList
            steps={os === 'android' ? [homeScreen.android, homeScreen.ios] : [homeScreen.ios, homeScreen.android]}
          />
          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3">
            <Smartphone size={14} aria-hidden /> {os === 'ios' ? 'We think you are on an iPhone, so that one is first.' : os === 'android' ? 'We think you are on Android, so that one is first.' : 'Use whichever matches your phone.'}
          </p>
        </Step>

        <Step n={3} title="Open the radar">
          <p className="mb-4 text-[13.5px] text-ink-2">That's everything. Prices, drops and the Board are waiting.</p>
          <Button variant="primary" className="w-full !min-h-12 text-[15px]" onClick={() => navigate('/')}>
            Open the radar <ArrowRight size={18} aria-hidden />
          </Button>
        </Step>
      </div>
    </div>
  )
}
