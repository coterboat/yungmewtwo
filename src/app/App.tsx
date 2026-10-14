import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Skeleton } from '../components/ui.tsx'
import { Placeholder, Shell } from './Shell.tsx'

// Each feature owns its folder under src/features/ and is loaded on demand.
const Radar = lazy(() => import('../features/radar/index.tsx'))
const Market = lazy(() => import('../features/market/index.tsx'))
const SetPage = lazy(() => import('../features/market/SetPage.tsx'))
const ItemPage = lazy(() => import('../features/market/ItemPage.tsx'))
const Drops = lazy(() => import('../features/drops/index.tsx'))
const Board = lazy(() => import('../features/board/index.tsx'))
const Hunt = lazy(() => import('../features/hunt/index.tsx'))
const Vault = lazy(() => import('../features/vault/index.tsx'))
const Tools = lazy(() => import('../features/tools/index.tsx'))
const Settings = lazy(() => import('../features/settings/index.tsx'))
const Join = lazy(() => import('../features/settings/JoinPage.tsx'))

function Loading() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  )
}

export default function App() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Radar />} />
          <Route path="/market" element={<Market />} />
          <Route path="/market/set/:id" element={<SetPage />} />
          <Route path="/item/:id" element={<ItemPage />} />
          <Route path="/drops" element={<Drops />} />
          <Route path="/board" element={<Board />} />
          <Route path="/hunt" element={<Hunt />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/join" element={<Join />} />
          <Route path="*" element={<Placeholder title="Not found">That page doesn't exist.</Placeholder>} />
        </Routes>
      </Suspense>
    </Shell>
  )
}
