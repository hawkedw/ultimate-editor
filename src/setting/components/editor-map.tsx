/** @jsx jsx */
import { React, jsx, Immutable, css } from 'jimu-core'
import { Checkbox, Button, Card, CardBody } from 'jimu-ui'
import { SettingSection } from 'jimu-ui/advanced/setting-components'
import { JimuMapViewComponent } from 'jimu-arcgis'
import type { JimuMapView } from 'jimu-arcgis'
import * as ReactDOM from 'react-dom'

import type { IMConfig, LayerRule } from '../../config'
import LayerConfig from './layer-config'

type LayerMeta = {
  key: string
  title: string
  url?: string
  canAdd: boolean
  canUpdate: boolean
  canDelete: boolean
  apiLayer: any
}

function norm (v: any): string { return String(v ?? '').trim().toLowerCase() }
function normUrl (u: any): string { return String(u ?? '').trim().replace(/\/+$/, '').toLowerCase() }

function toPlain<T> (v: any): T {
  return v?.asMutable ? v.asMutable({ deep: true }) : (v ?? {})
}

function toPlainArr<T> (v: any): T[] {
  if (!v) return []
  return v?.asMutable ? v.asMutable({ deep: true }) : (Array.isArray(v) ? v : [])
}

function layerEditingEnabled (l: any): boolean {
  if (typeof l?.effectiveEditingEnabled === 'boolean') return !!l.effectiveEditingEnabled
  if (typeof l?.editingEnabled === 'boolean') return !!l.editingEnabled
  return false
}

function layerOps (l: any): any {
  return l?.effectiveCapabilities?.operations ?? l?.capabilities?.operations ?? null
}

// [CHANGE 3] helper: can this layer's geometry be updated at service level?
function layerCanUpdateGeom (l: any): boolean {
  if (!l) return true
  if (l?.capabilities?.editing?.supportsGeometryUpdate === false) return false
  if (l?.allowGeometryUpdates === false) return false
  return true
}

function collectFeatureLayersFromMap (view: any): any[] {
  const ordered: any[] = []
  const seen = new Set<any>()

  const visit = (layer: any) => {
    if (!layer || seen.has(layer)) return
    seen.add(layer)
    if (layer?.type === 'feature' && !layer?.isTable) ordered.push(layer)

    const children = layer?.layers?.toArray?.() || layer?.sublayers?.toArray?.() || []
    for (const child of children) visit(child)
  }

  for (const layer of (view?.map?.layers?.toArray?.() ?? [])) visit(layer)

  for (const layer of (view?.map?.allLayers?.toArray?.() ?? [])) visit(layer)

  return ordered
}

function getEditableFeatureLayersFromView (jmv: JimuMapView | null): LayerMeta[] {
  const view: any = jmv?.view
  const fls = collectFeatureLayersFromMap(view)

  const metas: LayerMeta[] = fls.map((l: any, idx: number) => {
    const rawUrl = l?.url ? String(l.url) : undefined
    const cleanUrl = rawUrl ? rawUrl.replace(/\/+$/, '') : undefined
    const lid = l?.layerId ?? l?.sublayerId
    const lidNum = lid != null && Number.isFinite(Number(lid)) ? Number(lid) : null
    let resolvedUrl = cleanUrl
    if (resolvedUrl && !/\/\d+$/.test(resolvedUrl) && lidNum != null) resolvedUrl = `${resolvedUrl}/${lidNum}`
    const id = l?.id != null ? String(l.id) : ''
    const key = resolvedUrl ? normUrl(resolvedUrl) : (id || `layer-${idx}`)
    const ops = layerOps(l)
    const canAdd = !!ops?.supportsAdd
    const canUpdate = !!ops?.supportsUpdate
    const canDelete = !!ops?.supportsDelete
    return { key, title: String(l?.title ?? l?.id ?? 'Layer'), url: resolvedUrl ?? rawUrl, canAdd, canUpdate, canDelete, apiLayer: l }
  })

  return metas.filter(m => layerEditingEnabled(m.apiLayer) && (m.canAdd || m.canUpdate))
}

function isEnabled (rule: LayerRule | null): boolean {
  return !!(rule && (rule.allowUpdate === true || rule.allowCreate === true))
}

function findRule (rules: LayerRule[], meta: LayerMeta): LayerRule | null {
  const k = norm(meta.key)
  const u = meta.url ? normUrl(meta.url) : ''
  return rules.find(r => {
    if (r?.id && norm(r.id) === k) return true
    if (r?.url && u && normUrl(r.url) === u) return true
    return false
  }) ?? null
}

function dedupeById (rules: LayerRule[]): LayerRule[] {
  const m = new Map<string, LayerRule>()
  for (const r of rules) {
    const id = norm((r as any)?.id)
    if (!id) continue
    m.set(id, r)
  }
  return Array.from(m.values())
}

function makeDisabledRule (meta: LayerMeta): LayerRule {
  return {
    id: meta.key,
    url: meta.url,
    title: meta.title,
    allowCreate: false,
    allowUpdate: false,
    allowAttrUpdate: false,
    allowGeomUpdate: false,
    allowDelete: false
  }
}

function mergeRule (meta: LayerMeta, existing: LayerRule | null, checked: boolean): LayerRule {
  const base: LayerRule = existing ? toPlain(existing) : makeDisabledRule(meta)
  if (checked) {
    return {
      ...base,
      id: meta.key,
      url: meta.url,
      title: meta.title,
      allowCreate: meta.canAdd,
      allowUpdate: meta.canUpdate,
      allowAttrUpdate: meta.canUpdate,
      // [CHANGE 3] respect service geometry capability on auto-enable
      allowGeomUpdate: meta.canUpdate && layerCanUpdateGeom(meta.apiLayer),
      allowDelete: meta.canDelete
    }
  }
  return {
    ...base,
    id: meta.key,
    url: meta.url,
    title: meta.title,
    allowCreate: false,
    allowUpdate: false,
    allowAttrUpdate: false,
    allowGeomUpdate: false
  }
}

export default function EditorMap (props: {
  widgetId: string
  mapWidgetId: string
  config: IMConfig
  onConfigChange: (cfg: IMConfig) => void
  translate: (id: string) => string
}) {
  const { mapWidgetId, config, onConfigChange, translate } = props

  const [jmv, setJmv] = React.useState<JimuMapView | null>(null)
  const [layers, setLayers] = React.useState<LayerMeta[]>([])
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  const toImmutable = Immutable as any

  const rules = toPlainArr<LayerRule>((config as any)?.layers)

  const C_BG = '#161a20'
  const C_BG2 = '#1d232b'
  const C_BG3 = '#222a34'
  const C_TEXT = '#ffffff'
  const C_BORDER = 'rgba(255,255,255,0.12)'
  const INPUT_BG = '#2a3240'

  React.useEffect(() => {
    const next = getEditableFeatureLayersFromView(jmv)
    setLayers(next)
    if (activeKey && next.length > 0 && !next.some(l => l.key === activeKey)) setActiveKey(null)

    // [CHANGE 2] auto-enable all layers when map first loads (if none were enabled before)
    if (next.length > 0) {
      const currentRules = toPlainArr<LayerRule>((config as any)?.layers)
      const hasAnyEnabled = next.some(m => isEnabled(findRule(currentRules, m)))
      if (!hasAnyEnabled) {
        const byId = new Map<string, LayerRule>()
        for (const r of currentRules) byId.set(norm((r as any)?.id), r)
        const newRules = next.map(meta => mergeRule(meta, byId.get(norm(meta.key)) ?? null, true))
        const others = currentRules.filter((r: any) => {
          const id = norm(r?.id)
          if (!id) return false
          return !next.some(m => norm(m.key) === id)
        })
        onConfigChange((config as any).set('layers', toImmutable(dedupeById([...others, ...newRules]))))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jmv])

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveKey(null) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const updateRulesBulk = (nextRules: LayerRule[]) => {
    onConfigChange((config as any).set('layers', toImmutable(dedupeById(nextRules))))
  }

  const setLayerEnabled = (meta: LayerMeta, checked: boolean) => {
    const existing = findRule(rules, meta)
    const nextForThis = mergeRule(meta, existing, checked)
    const others = rules.filter(r => norm((r as any)?.id) !== norm(meta.key))
    updateRulesBulk([...others, nextForThis])
  }

  const toggleAll = (checked: boolean) => {
    const byId = new Map<string, LayerRule>()
    for (const r of rules) byId.set(norm((r as any)?.id), r)

    const updatedForVisible = layers.map(meta => mergeRule(meta, byId.get(norm(meta.key)) ?? null, checked))
    const untouchedOthers = rules.filter((r: any) => {
      const id = norm(r?.id)
      if (!id) return false
      return !layers.some(m => norm(m.key) === id)
    })

    updateRulesBulk([...untouchedOthers, ...updatedForVisible])
    if (!checked) setActiveKey(null)
  }

  const enabledFlags = layers.map(l => isEnabled(findRule(rules, l)))
  const allEnabled = layers.length > 0 && enabledFlags.every(Boolean)
  const someEnabled = enabledFlags.some(Boolean)

  const activeLayer = layers.find(l => l.key === activeKey) ?? null
  const activeRule = activeLayer
    ? (findRule(rules, activeLayer) ?? makeDisabledRule(activeLayer))
    : null
  const activeEnabled = activeRule ? isEnabled(activeRule as any) : false

  const drawerOpen = !!(activeLayer && activeRule)

  const styles = {
    overlay: css`
      position: fixed;
      inset: 0;
      z-index: 9999;
      color: ${C_TEXT};

      * { color: ${C_TEXT}; }

      .setting-section,
      .setting-row,
      .card,
      .card-body,
      .list-group-item {
        background: transparent !important;
      }

      input, textarea, .form-control {
        background: ${INPUT_BG} !important;
        color: ${C_TEXT} !important;
        border-color: ${C_BORDER} !important;
      }

      input::placeholder, textarea::placeholder {
        color: rgba(255,255,255,0.55) !important;
      }
    `,
    backdrop: css`
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.55);
    `,
    drawer: css`
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);

      width: 75vw;
      height: 90vh;

      max-width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
      min-width: 980px;
      min-height: 560px;

      border: 1px solid ${C_BORDER};
      border-radius: 10px;
      background: ${C_BG};
      box-shadow: 0 16px 54px rgba(0,0,0,0.65);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `,
    header: css`
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.10);
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      background: ${C_BG2};
    `,
    title: css`
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    body: css`
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 12px;
      background: ${C_BG};
    `
  }

  const drawer = drawerOpen
    ? ReactDOM.createPortal(
      <div css={styles.overlay}>
        <div css={styles.backdrop} onClick={() => setActiveKey(null)} />
        <div css={styles.drawer} onClick={e => e.stopPropagation()}>
          <div css={styles.header}>
            <span css={styles.title}>{activeLayer?.title}</span>
            <span style={{ flex: 1 }} />
            <Button size='sm' type='tertiary' onClick={() => setActiveKey(null)}>×</Button>
          </div>
          <div css={styles.body}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>
              {activeLayer?.url ?? '(url нет)'}
            </div>
            <LayerConfig
              meta={activeLayer as any}
              rule={activeRule as any}
              enabled={activeEnabled}
              onEnabledChange={(en) => setLayerEnabled(activeLayer as any, en)}
              onChange={(newRule) => {
                const plain = toPlain<LayerRule>(newRule)
                const merged = { ...plain, id: (activeLayer as any).key, url: (activeLayer as any).url, title: (activeLayer as any).title }
                const others = rules.filter(r => norm((r as any)?.id) !== norm((activeLayer as any).key))
                updateRulesBulk([...others, merged as any])
              }}
              translate={translate}
              hideLayerEnableSwitch={true}
            />
          </div>
        </div>
      </div>,
      document.body
    )
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <JimuMapViewComponent
        useMapWidgetId={mapWidgetId}
        onActiveViewChange={v => {
          if (!v) return
          v.whenJimuMapViewLoaded().then(() => setJmv(v))
        }}
      />

      {drawer}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 4px' }}>
        <Checkbox
          checked={allEnabled}
          indeterminate={someEnabled && !allEnabled}
          onChange={(e: any) => toggleAll(!!(e?.target ? e.target.checked : e))}
        />
        <span>{translate('allLayers') || 'Все слои'}</span>
      </div>

      {layers.map((l) => {
        const enabled = isEnabled(findRule(rules, l))
        const selected = activeKey === l.key

        return (
          <div
            key={l.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 0',
              borderBottom: `1px solid rgba(255,255,255,0.06)`
            }}
          >
            <Checkbox
              checked={enabled}
              onChange={(e: any) => setLayerEnabled(l, !!(e?.target ? e.target.checked : e))}
            />
            <span
              role='button'
              tabIndex={0}
              onClick={() => setActiveKey(l.key)}
              onKeyDown={(e) => { if (e.key === 'Enter') setActiveKey(l.key) }}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer', userSelect: 'none', fontWeight: selected ? 700 : 400 }}
              title={l.title}
            >
              {l.title}
            </span>
          </div>
        )
      })}
    </div>
  )
}
