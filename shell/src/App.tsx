import { useEffect, useState } from 'react'
import packageJson from '../package.json'
import './App.css'

type SlotId = 'slot-editor' | 'slot-viewer'
type SlotStatus = 'loading' | 'active' | 'unavailable'
type ResourceStatus = 'loading' | 'ready' | 'error'

interface MfeDefinition {
  name: string
  tag: string
  slot: string
  url: string
}

interface MfeModule {
  VERSION?: unknown
}

interface SlotState {
  status: SlotStatus
  version: string
  error?: string
}

interface RegistryEntryResult {
  slot: SlotId | null
  mfe?: MfeDefinition
  error?: string
}

const SLOT_DEFINITIONS = [
  { id: 'slot-editor', name: 'editor', label: 'Editor de Tareas · Vue 3' },
  { id: 'slot-viewer', name: 'viewer', label: 'Visor e Historial · Lit' },
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Error inesperado.'
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`${url} respondió con HTTP ${response.status}.`)
  }
  return response.json() as Promise<unknown>
}

function validateApiUrl(value: unknown): string {
  if (!isRecord(value) || typeof value.apiUrl !== 'string' || !value.apiUrl.trim()) {
    throw new Error('config.json debe incluir un apiUrl válido.')
  }

  const apiUrl = value.apiUrl.trim().replace(/\/+$/, '')
  if (!apiUrl) {
    throw new Error('config.json debe incluir un apiUrl válido.')
  }
  return apiUrl
}

function getSlotHint(value: unknown): SlotId | null {
  if (!isRecord(value)) return null
  if (value.slot === 'slot-editor' || value.slot === 'slot-viewer') {
    return value.slot
  }
  if (value.name === 'editor') return 'slot-editor'
  if (value.name === 'viewer') return 'slot-viewer'
  return null
}

function validateMfe(value: unknown): MfeDefinition {
  if (!isRecord(value)) {
    throw new Error('La entrada del MFE debe ser un objeto.')
  }

  for (const field of ['name', 'tag', 'slot', 'url'] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim()) {
      throw new Error(`La entrada del MFE requiere el campo "${field}".`)
    }
  }

  return {
    name: (value.name as string).trim(),
    tag: (value.tag as string).trim(),
    slot: (value.slot as string).trim(),
    url: (value.url as string).trim(),
  }
}

function validateRegistry(value: unknown): RegistryEntryResult[] {
  if (!isRecord(value) || !Array.isArray(value.mfes)) {
    throw new Error('registry.json debe incluir un arreglo mfes.')
  }

  return value.mfes.map((entry) => {
    const slot = getSlotHint(entry)
    try {
      const mfe = validateMfe(entry)
      const resolvedSlot = mfe.slot === 'slot-editor' || mfe.slot === 'slot-viewer'
        ? mfe.slot
        : slot
      return { slot: resolvedSlot, mfe }
    } catch (error) {
      return { slot, error: describeError(error) }
    }
  })
}

function formatVersion(version: unknown): string {
  if (typeof version !== 'string' || !version.trim()) return 'sin versión'
  const normalized = version.trim()
  return normalized.startsWith('v') ? normalized : `v${normalized}`
}

function App() {
  const [resources, setResources] = useState({
    config: 'loading' as ResourceStatus,
    registry: 'loading' as ResourceStatus,
  })
  const [slots, setSlots] = useState<Record<SlotId, SlotState>>({
    'slot-editor': { status: 'loading', version: 'sin versión' },
    'slot-viewer': { status: 'loading', version: 'sin versión' },
  })

  useEffect(() => {
    let cancelled = false

    const setAllSlotsUnavailable = (error: string) => {
      if (cancelled) return
      setSlots({
        'slot-editor': { status: 'unavailable', version: 'sin versión', error },
        'slot-viewer': { status: 'unavailable', version: 'sin versión', error },
      })
    }

    const initialize = async () => {
      const [configResult, registryResult] = await Promise.allSettled([
        fetchJson('/config.json'),
        fetchJson('/registry.json'),
      ])

      if (cancelled) return

      let apiUrl: string | null = null
      let configError: string | null = null
      if (configResult.status === 'fulfilled') {
        try {
          apiUrl = validateApiUrl(configResult.value)
        } catch (error) {
          configError = describeError(error)
        }
      } else {
        configError = describeError(configResult.reason)
      }

      let registryEntries: RegistryEntryResult[] | null = null
      let registryError: string | null = null
      if (registryResult.status === 'fulfilled') {
        try {
          registryEntries = validateRegistry(registryResult.value)
          if (registryEntries.some((entry) => entry.error)) {
            registryError = 'Una o más entradas de registry.json no son válidas.'
          }
        } catch (error) {
          registryError = describeError(error)
        }
      } else {
        registryError = describeError(registryResult.reason)
      }

      setResources({
        config: configError ? 'error' : 'ready',
        registry: registryError ? 'error' : 'ready',
      })

      if (configError || !apiUrl) {
        setAllSlotsUnavailable(`No se pudo cargar la configuración de API: ${configError ?? 'apiUrl no válido'}`)
        return
      }
      if (registryError && !registryEntries) {
        setAllSlotsUnavailable(`No se pudo cargar el registro de microfrontends: ${registryError}`)
        return
      }
      if (!registryEntries) {
        setAllSlotsUnavailable('No se pudo leer el registro de microfrontends.')
        return
      }

      await Promise.all(SLOT_DEFINITIONS.map(async (definition) => {
        try {
          const candidates = registryEntries.filter((entry) => entry.slot === definition.id)
          if (candidates.length !== 1) {
            throw new Error(candidates.length
              ? `registry.json contiene más de una entrada para ${definition.id}.`
              : `registry.json no contiene una entrada válida para ${definition.id}.`)
          }

          const candidate = candidates[0]
          if (!candidate.mfe) {
            throw new Error(candidate.error ?? 'La entrada del microfrontend no es válida.')
          }

          const mountTarget = document.querySelector<HTMLElement>(
            `#${definition.id} [data-mfe-mount]`,
          )
          if (!mountTarget) {
            throw new Error(`No se encontró el contenedor ${definition.id}.`)
          }

          const module = await import(/* @vite-ignore */ candidate.mfe.url) as MfeModule
          if (cancelled) return

          if (!customElements.get(candidate.mfe.tag)) {
            throw new Error(`El módulo no registró el Custom Element <${candidate.mfe.tag}>.`)
          }

          mountTarget.replaceChildren()
          const element = document.createElement(candidate.mfe.tag)
          element.setAttribute('api-url', apiUrl)
          mountTarget.append(element)

          if (!cancelled) {
            setSlots((current) => ({
              ...current,
              [definition.id]: {
                status: 'active',
                version: formatVersion(module.VERSION),
              },
            }))
          }
        } catch (error) {
          if (!cancelled) {
            setSlots((current) => ({
              ...current,
              [definition.id]: {
                status: 'unavailable',
                version: 'sin versión',
                error: describeError(error),
              },
            }))
          }
        }
      }))
    }

    void initialize().catch((error: unknown) => {
      const message = describeError(error)
      if (!cancelled) {
        setResources({ config: 'error', registry: 'error' })
        setAllSlotsUnavailable(message)
      }
    })

    return () => {
      cancelled = true
      for (const definition of SLOT_DEFINITIONS) {
        document.querySelector<HTMLElement>(`#${definition.id} [data-mfe-mount]`)
          ?.replaceChildren()
      }
    }
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">TD</div>
        <div className="topbar-meta">
          <span>PLATAFORMA / MICROSERVICIOS</span>
          <span className="topbar-divider" aria-hidden="true" />
          <span>AWS · US-EAST-2</span>
        </div>
        <div className="system-status"><span className="status-dot" /> Shell operativo</div>
      </header>

      <main className="page-content">
        <section className="intro" aria-labelledby="page-title">
          <div className="intro-copy">
            <p className="eyebrow"><span /> WORKSPACE DISTRIBUIDO</p>
            <h1 id="page-title">Gestor Distribuido TODO <span>— Microfrontends AWS</span></h1>
            <p className="subtitle">
              Shell React + Vite · configuración remota · composición aislada de microfrontends
            </p>
          </div>
          <div className="resource-status" aria-label="Estado de configuración">
            <ResourceBadge name="config.json" status={resources.config} />
            <ResourceBadge name="registry.json" status={resources.registry} />
          </div>
        </section>

        <section className="mfe-grid" aria-label="Microfrontends de tareas">
          {SLOT_DEFINITIONS.map((definition) => (
            <MfePanel
              key={definition.id}
              definition={definition}
              state={slots[definition.id]}
            />
          ))}
        </section>
      </main>

      <footer className="footer">
        <div className="footer-shell-version">
          <span className="footer-label">SHELL</span>
          <span>v{packageJson.version}</span>
        </div>
        <div className="footer-connections">
          {SLOT_DEFINITIONS.map((definition) => {
            const state = slots[definition.id]
            const label = definition.name === 'editor' ? 'Editor' : 'Viewer'
            const connection = state.status === 'active'
              ? 'Conectado'
              : state.status === 'loading' ? 'Conectando' : 'Desconectado'

            return (
              <span className="footer-connection" key={definition.id}>
                <span className={`footer-dot ${state.status}`} />
                {label}: {state.version} <span className="footer-separator">·</span> {connection}
              </span>
            )
          })}
        </div>
        <span className="footer-region">AWS / US-EAST-2</span>
      </footer>
    </div>
  )
}

function ResourceBadge({ name, status }: { name: string; status: ResourceStatus }) {
  const label = status === 'ready' ? 'Cargado' : status === 'error' ? 'Error' : 'Cargando'
  return (
    <div className={`resource-badge ${status}`}>
      <span className="resource-dot" />
      <span className="resource-name">{name}</span>
      <span className="resource-state">{label}</span>
    </div>
  )
}

function MfePanel({
  definition,
  state,
}: {
  definition: (typeof SLOT_DEFINITIONS)[number]
  state: SlotState
}) {
  const badgeLabel = state.status === 'active'
    ? 'Activo'
    : state.status === 'unavailable' ? 'No disponible' : 'Cargando...'

  return (
    <article className="mfe-panel">
      <header className="panel-heading">
        <div className="panel-title-wrap">
          <span className={`panel-index ${definition.name}`}>
            {definition.name === 'editor' ? '01' : '02'}
          </span>
          <div>
            <p className="panel-kicker">MICROFRONTEND / {definition.name.toUpperCase()}</p>
            <h2>{definition.label}</h2>
          </div>
        </div>
        <span className={`state-badge ${state.status}`}>
          <span className="resource-dot" />{badgeLabel}
        </span>
      </header>

      <div className="panel-body" id={definition.id}>
        {state.status === 'loading' && (
          <div className="slot-message loading-message" role="status">
            <span className="loader-ring" />
            <span>Conectando con el microfrontend</span>
          </div>
        )}
        {state.status === 'unavailable' && (
          <div className="slot-message error-message" role="alert">
            <span className="error-symbol" aria-hidden="true">!</span>
            <div>
              <strong>Microfrontend no disponible</strong>
              <p>{state.error}</p>
            </div>
          </div>
        )}
        <div className="mfe-mount" data-mfe-mount="" />
      </div>
    </article>
  )
}

export default App
