import { Calculator, CalendarClock, Gem, MapPin, Megaphone, Radar, Settings, TrendingUp, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown in the phone's bottom bar; the rest live under More. */
  primary?: boolean
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Radar', icon: Radar, primary: true },
  { to: '/market', label: 'Market', icon: TrendingUp, primary: true },
  { to: '/drops', label: 'Drops', icon: CalendarClock, primary: true },
  { to: '/board', label: 'Board', icon: Megaphone, primary: true },
  { to: '/hunt', label: 'Hunt', icon: MapPin, primary: true },
  { to: '/vault', label: 'Vault', icon: Gem },
  { to: '/tools', label: 'Tools', icon: Calculator },
  { to: '/settings', label: 'Settings', icon: Settings },
]
