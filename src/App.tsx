import { useEffect, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { ContextPanel } from './components/ContextPanel'
import { ListFallback } from './components/ListFallback'
import { ModeToolbar } from './components/ModeToolbar'
import { TopBar } from './components/TopBar'
import {
  compareByIds,
  type CompareResult,
  fetchBarriers,
  generateProposal,
  getDemoScenario,
} from './data/api'
import {
  getIntervention,
  interventionsForBarrier,
  LOCATIONS,
} from './data/fixtures'
import type {
  AppMode,
  Barrier,
  DraftProposal,
  Intervention,
  ProposalFacts,
  SurfaceView,
} from './types'

export default function App() {
  const scenario = getDemoScenario()
  const [mode, setMode] = useState<AppMode>('explore')
  const [surfaceView, setSurfaceView] = useState<SurfaceView>('canvas')
  const [locationId, setLocationId] = useState('wellesley')
  const [barriers, setBarriers] = useState<Barrier[]>([])
  const [dataNote, setDataNote] = useState('Loading fixtures…')
  const [selectedBarrierId, setSelectedBarrierId] = useState<string | null>(
    scenario.barrierId,
  )
  const [selectedInterventionId, setSelectedInterventionId] = useState<
    string | null
  >(scenario.interventionId)
  const [proposalFacts, setProposalFacts] = useState<ProposalFacts | null>(null)
  const [proposalDraft, setProposalDraft] = useState<DraftProposal | null>(null)
  const [proposalWarnings, setProposalWarnings] = useState<string[]>([])
  const [aiGenerated, setAiGenerated] = useState(false)
  const [geminiAvailable, setGeminiAvailable] = useState(false)
  const [apiAvailable, setApiAvailable] = useState(false)
  const [proposalLoading, setProposalLoading] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    let cancelled = false
    fetchBarriers().then((result) => {
      if (cancelled) return
      setBarriers(result.barriers)
      setDataNote(result.note)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const selectedBarrier =
    barriers.find((b) => b.id === selectedBarrierId) ?? null
  const interventions = selectedBarrier
    ? interventionsForBarrier(selectedBarrier.id)
    : []
  const selectedIntervention: Intervention | null = selectedInterventionId
    ? (getIntervention(selectedInterventionId) ?? null)
    : null

  const compare: CompareResult | null = selectedInterventionId
    ? compareByIds({
        scenarioId: scenario.id,
        interventionId: selectedInterventionId,
      })
    : null

  const location = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0]

  const handleGenerate = async () => {
    if (!selectedBarrierId || !selectedInterventionId) return
    setProposalLoading(true)
    try {
      const result = await generateProposal({
        scenarioId: scenario.id,
        barrierId: selectedBarrierId,
        interventionId: selectedInterventionId,
      })
      setProposalFacts(result.facts)
      setProposalDraft(result.draft)
      setProposalWarnings(result.warnings)
      setAiGenerated(result.aiGenerated)
      setGeminiAvailable(result.geminiAvailable)
      setApiAvailable(result.apiAvailable)
    } finally {
      setProposalLoading(false)
    }
  }

  const handleExportPdf = () => {
    window.print()
  }

  return (
    <div className={`app-shell${reducedMotion ? ' is-reduced-motion' : ''}`}>
      <a className="skip-link" href="#context-panel">
        Skip to context panel
      </a>
      <a className="skip-link skip-link--modes" href="#mode-toolbar">
        Skip to modes
      </a>

      <TopBar
        locations={LOCATIONS}
        selectedLocationId={locationId}
        onLocationSelect={setLocationId}
        reducedMotion={reducedMotion}
        onReducedMotionChange={setReducedMotion}
        surfaceView={surfaceView}
        onSurfaceViewChange={setSurfaceView}
      />

      <main className="app-shell__main">
        {surfaceView === 'canvas' ? (
          <CanvasSlot
            mode={mode}
            selectedBarrier={selectedBarrier}
            reducedMotion={reducedMotion}
            locationLabel={location.label}
            compare={compare}
          />
        ) : (
          <ListFallback
            barriers={barriers}
            selectedBarrierId={selectedBarrierId}
            compare={compare}
            onSelectBarrier={(id) => {
              setSelectedBarrierId(id)
              const opts = interventionsForBarrier(id)
              setSelectedInterventionId(opts[0]?.id ?? null)
            }}
          />
        )}
        <ContextPanel
          mode={mode}
          barriers={barriers}
          selectedBarrier={selectedBarrier}
          interventions={interventions}
          selectedIntervention={
            selectedIntervention?.barrierId === selectedBarrier?.id
              ? selectedIntervention
              : null
          }
          scenario={scenario}
          dataNote={dataNote}
          compare={compare}
          proposalFacts={proposalFacts}
          proposalDraft={proposalDraft}
          proposalWarnings={proposalWarnings}
          aiGenerated={aiGenerated}
          geminiAvailable={geminiAvailable}
          apiAvailable={apiAvailable}
          proposalLoading={proposalLoading}
          onSelectBarrier={(id) => {
            setSelectedBarrierId(id)
            const opts = interventionsForBarrier(id)
            setSelectedInterventionId(opts[0]?.id ?? null)
          }}
          onSelectIntervention={setSelectedInterventionId}
          onDraftChange={setProposalDraft}
          onGenerate={handleGenerate}
          onExportPdf={handleExportPdf}
        />
      </main>

      <div id="mode-toolbar">
        <ModeToolbar
          mode={mode}
          onModeChange={setMode}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  )
}
