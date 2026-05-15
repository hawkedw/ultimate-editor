import { React } from 'jimu-core'
import type FeatureLayer from 'esri/layers/FeatureLayer'
import Graphic from 'esri/Graphic'
import * as symbolUtils from 'esri/symbols/support/symbolUtils'
import { layerKey } from '../utils/ueUtils'

interface Props {
  templateLayers: FeatureLayer[]
  showAttrHint: boolean
  isCreating: boolean
  onCancelCreate: () => void
  onSelectTemplate: (layer: FeatureLayer, template: __esri.FeatureTemplate) => void
}

type SymbolInfo = {
  kind: 'polygon' | 'polyline' | 'point'
  stroke: string
  strokeWidth: number
  fill: string
  style?: string
  path?: string
  imageUrl?: string
}

type TemplateItem = {
  key: string
  layer: FeatureLayer
  template: __esri.FeatureTemplate
  label: string
  layerTitle: string
  symbol: any
  symbolType?: string
  symbolInfo: SymbolInfo
}

type TemplateGroup = {
  key: string
  layerTitle: string
  items: TemplateItem[]
}

const rgbaToCss = (v: any, fallback: string) => {
  if (!v) return fallback
  if (typeof v === 'string') return v

  if (Array.isArray(v)) {
    const [r = 0, g = 0, b = 0, a = 1] = v
    const aa = typeof a === 'number' ? (a > 1 ? a / 255 : a) : 1
    return `rgba(${r}, ${g}, ${b}, ${aa})`
  }

  if (typeof v?.toCss === 'function') {
    try { return v.toCss(true) } catch {}
  }

  if (typeof v?.r === 'number' && typeof v?.g === 'number' && typeof v?.b === 'number') {
    const aa = typeof v?.a === 'number' ? (v.a > 1 ? v.a / 255 : v.a) : 1
    return `rgba(${v.r}, ${v.g}, ${v.b}, ${aa})`
  }

  return fallback
}

const cloneSymbol = (s: any) => {
  if (!s) return null
  try { return s.clone ? s.clone() : s } catch { return s }
}

const pickFallbackSymbol = (layer: any) => {
  const r: any = layer?.renderer
  if (!r) return null

  if (r.symbol) return cloneSymbol(r.symbol)
  if (r.defaultSymbol) return cloneSymbol(r.defaultSymbol)
  if (Array.isArray(r.uniqueValueInfos) && r.uniqueValueInfos[0]?.symbol) return cloneSymbol(r.uniqueValueInfos[0].symbol)
  if (Array.isArray(r.classBreakInfos) && r.classBreakInfos[0]?.symbol) return cloneSymbol(r.classBreakInfos[0].symbol)

  return null
}

const resolveTemplateSymbol = async (layer: any, template: any) => {
  const renderer: any = layer?.renderer
  const attrs = { ...((template?.prototype?.attributes || {}) as Record<string, any>) }

  const g = new Graphic({
    attributes: attrs
  } as any)

  try {
    if (renderer && typeof renderer.getSymbolAsync === 'function') {
      const s = await renderer.getSymbolAsync(g)
      if (s) return cloneSymbol(s)
    }
  } catch {}

  try {
    if (renderer && typeof renderer.getSymbol === 'function') {
      const s = renderer.getSymbol(g)
      if (s) return cloneSymbol(s)
    }
  } catch {}

  return pickFallbackSymbol(layer)
}

const symbolToInfo = (layer: any, symbol: any): SymbolInfo => {
  const gt = layer?.geometryType

  if (gt === 'polygon') {
    return {
      kind: 'polygon',
      stroke: rgbaToCss(symbol?.outline?.color, '#49e7ff'),
      strokeWidth: Number(symbol?.outline?.width ?? 1.4),
      fill: rgbaToCss(symbol?.color, 'rgba(0,0,0,0)'),
      style: String(symbol?.style || 'solid')
    }
  }

  if (gt === 'polyline') {
    return {
      kind: 'polyline',
      stroke: rgbaToCss(symbol?.color, '#49e7ff'),
      strokeWidth: Number(symbol?.width ?? 2),
      fill: 'transparent'
    }
  }

  const imageUrl = symbol?.url
    ? String(symbol.url)
    : symbol?.imageData && symbol?.contentType
      ? `data:${symbol.contentType};base64,${symbol.imageData}`
      : undefined

  return {
    kind: 'point',
    stroke: rgbaToCss(symbol?.outline?.color || symbol?.color, '#49e7ff'),
    strokeWidth: Number(symbol?.outline?.width ?? 1.4),
    fill: rgbaToCss(symbol?.color, '#49e7ff'),
    style: String(symbol?.style || (symbol?.path ? 'path' : 'circle')),
    path: typeof symbol?.path === 'string' ? symbol.path : undefined,
    imageUrl
  }
}

const unquote = (value: string) => value.trim().replace(/^['"]|['"]$/g, '')

const attrValue = (attrs: Record<string, any>, field: string) => {
  const clean = field.trim().replace(/^["']|["']$/g, '')
  const exact = attrs[clean]
  if (exact !== undefined) return exact
  const found = Object.keys(attrs).find((k) => k.toLowerCase() === clean.toLowerCase())
  return found ? attrs[found] : undefined
}

const sameSqlValue = (a: any, b: string) => {
  const right = unquote(b)
  const n1 = Number(a)
  const n2 = Number(right)
  if (Number.isFinite(n1) && Number.isFinite(n2)) return n1 === n2
  return String(a ?? '').toLowerCase() === right.toLowerCase()
}

const templateMatchesWhere = (attrs: Record<string, any>, where: string) => {
  const clauses = String(where || '').split(/\s+and\s+/i).map((x) => x.trim()).filter(Boolean)
  if (!clauses.length) return true

  for (const clause of clauses) {
    if (/^\(?\s*1\s*=\s*1\s*\)?$/i.test(clause)) continue
    if (/^\(?\s*1\s*=\s*0\s*\)?$/i.test(clause)) return false

    const inMatch = clause.match(/^\(?\s*"?([\w.]+)"?\s+in\s*\((.+)\)\s*\)?$/i)
    if (inMatch) {
      const value = attrValue(attrs, inMatch[1])
      if (value === undefined || value === null || value === '') continue
      const allowed = inMatch[2].split(',').map(unquote)
      if (!allowed.some((x) => sameSqlValue(value, x))) return false
      continue
    }

    const eqMatch = clause.match(/^\(?\s*"?([\w.]+)"?\s*(=|<>|!=)\s*(.+?)\s*\)?$/i)
    if (eqMatch) {
      const value = attrValue(attrs, eqMatch[1])
      if (value === undefined || value === null || value === '') continue
      const ok = sameSqlValue(value, eqMatch[3])
      if ((eqMatch[2] === '=' && !ok) || (eqMatch[2] !== '=' && ok)) return false
    }
  }

  return true
}

const templateMatchesLayer = (layer: any, template: any) => {
  const attrs = { ...((template?.prototype?.attributes || {}) as Record<string, any>) }
  const where = String(layer?.definitionExpression || '').trim()
  if (!where) return true
  return templateMatchesWhere(attrs, where)
}

const getTemplateItems = async (layers: FeatureLayer[]): Promise<TemplateItem[]> => {
  const out: TemplateItem[] = []

  for (const layer of (layers || [])) {
    try { await layer.load?.() } catch {}

    const layerTitle = (layer as any).title || 'Слой'
    const allTemplates: Array<{ template: __esri.FeatureTemplate, key: string, label: string }> = []
    const seenTemplates = new Set<string>()

    const pushTemplate = (template: any, key: string, label: string) => {
      if (!templateMatchesLayer(layer, template)) return
      const signature = `${template?.name || label || 'template'}::${JSON.stringify(template?.prototype?.attributes || {})}`
      if (seenTemplates.has(signature)) return
      seenTemplates.add(signature)
      allTemplates.push({ template, key, label })
    }

    const directTemplates: __esri.FeatureTemplate[] = Array.isArray((layer as any).templates)
      ? (layer as any).templates
      : []

    directTemplates.forEach((template: any, idx: number) => {
      pushTemplate(
        template,
        `${(layer as any).id || layerTitle}__tpl__${idx}__${template?.name || 'template'}`,
        template?.name || 'Шаблон'
      )
    })

    const types: any[] = Array.isArray((layer as any).types) ? (layer as any).types : []
    types.forEach((tp: any, typeIdx: number) => {
      const templates: __esri.FeatureTemplate[] = Array.isArray(tp?.templates) ? tp.templates : []
      templates.forEach((template: any, tplIdx: number) => {
        pushTemplate(
          template,
          `${(layer as any).id || layerTitle}__type__${typeIdx}__tpl__${tplIdx}__${template?.name || 'template'}`,
          template?.name || tp?.name || 'Шаблон'
        )
      })
    })

    for (const item of allTemplates) {
      const symbol = await resolveTemplateSymbol(layer as any, item.template as any)
      out.push({
        key: item.key,
        layer,
        template: item.template,
        label: item.label,
        layerTitle,
        symbol,
        symbolType: String(symbol?.type || '').toLowerCase(),
        symbolInfo: symbolToInfo(layer as any, symbol)
      })
    }
  }

  return out
}

const groupTemplateItems = (items: TemplateItem[]): TemplateGroup[] => {
  const groups: TemplateGroup[] = []
  const byLayer = new Map<string, TemplateGroup>()

  for (const item of items) {
    const key = layerKey(item.layer as any)
    let group = byLayer.get(key)
    if (!group) {
      group = {
        key,
        layerTitle: item.layerTitle,
        items: []
      }
      byLayer.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
  }

  return groups
}

const ManualTemplateIcon = ({ info }: { info: SymbolInfo }) => {
  if (info.kind === 'polygon') {
    const hatch = info.style && info.style !== 'solid' && info.style !== 'none'
    return (
      <svg viewBox='0 0 32 24' className='ue-template-svg' aria-hidden='true'>
        {hatch && (
          <defs>
            <pattern id='ue-template-hatch' width='4' height='4' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
              <line x1='0' y1='0' x2='0' y2='4' stroke={info.stroke} strokeWidth='1' />
            </pattern>
          </defs>
        )}
        <polygon
          points='5,19 6,6 26,7 24,17'
          fill={hatch ? 'url(#ue-template-hatch)' : info.fill}
          stroke={info.stroke}
          strokeWidth={info.strokeWidth}
          strokeLinejoin='round'
        />
      </svg>
    )
  }

  if (info.kind === 'polyline') {
    return (
      <svg viewBox='0 0 32 24' className='ue-template-svg' aria-hidden='true'>
        <path
          d='M4 18 L10 7 L18 11 L27 5'
          fill='none'
          stroke={info.stroke}
          strokeWidth={info.strokeWidth}
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    )
  }

  const pointStyle = (info.style || 'circle').toLowerCase()
  const pointStroke = Math.max(info.strokeWidth, 1.2)

  if (info.imageUrl) {
    return (
      <img
        src={info.imageUrl}
        className='ue-template-image-symbol'
        aria-hidden='true'
        alt=''
      />
    )
  }

  if (pointStyle === 'square') {
    return (
      <svg viewBox='0 0 32 24' className='ue-template-svg' aria-hidden='true'>
        <rect x='11' y='7' width='10' height='10' fill={info.fill} stroke={info.stroke} strokeWidth={pointStroke} />
      </svg>
    )
  }

  if (pointStyle === 'diamond') {
    return (
      <svg viewBox='0 0 32 24' className='ue-template-svg' aria-hidden='true'>
        <polygon points='16,5 24,12 16,19 8,12' fill={info.fill} stroke={info.stroke} strokeWidth={pointStroke} />
      </svg>
    )
  }

  if (pointStyle === 'triangle') {
    return (
      <svg viewBox='0 0 32 24' className='ue-template-svg' aria-hidden='true'>
        <polygon points='16,5 24,19 8,19' fill={info.fill} stroke={info.stroke} strokeWidth={pointStroke} />
      </svg>
    )
  }

  if ((pointStyle === 'cross' || pointStyle === 'x') && !info.path) {
    const rotate = pointStyle === 'x' ? 'rotate(45 16 12)' : undefined
    return (
      <svg viewBox='0 0 32 24' className='ue-template-svg' aria-hidden='true'>
        <g transform={rotate}>
          <line x1='16' y1='5' x2='16' y2='19' stroke={info.stroke} strokeWidth='3' strokeLinecap='round' />
          <line x1='9' y1='12' x2='23' y2='12' stroke={info.stroke} strokeWidth='3' strokeLinecap='round' />
        </g>
      </svg>
    )
  }

  if (info.path) {
    return (
      <svg viewBox='-16 -16 32 32' className='ue-template-svg' aria-hidden='true'>
        <path d={info.path} fill={info.fill} stroke={info.stroke} strokeWidth={pointStroke} />
      </svg>
    )
  }

  return (
    <svg viewBox='0 0 32 24' className='ue-template-svg' aria-hidden='true'>
      <circle
        cx='16'
        cy='12'
        r='5'
        fill={info.fill}
        stroke={info.stroke}
        strokeWidth={info.strokeWidth}
      />
    </svg>
  )
}

const TemplateIcon = ({ info, symbol, symbolType }: { info: SymbolInfo, symbol: any, symbolType?: string }) => {
  const canUsePreview = info.kind === 'point' && !!symbol && !['', 'simple-marker', 'picture-marker'].includes(String(symbolType || '').toLowerCase())
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const [hasPreview, setHasPreview] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host || !canUsePreview) {
      setHasPreview(false)
      return
    }

    host.innerHTML = ''
    setHasPreview(false)

    ;(async () => {
      try {
        const previewSize = info.kind === 'point'
          ? 14
          : { width: 34, height: 24 }
        const preview = await (symbolUtils as any).renderPreviewHTML(symbol, {
          size: previewSize,
          maxSize: info.kind === 'point' ? 18 : 34
        })
        if (cancelled || !preview || !hostRef.current) return
        hostRef.current.innerHTML = ''
        hostRef.current.appendChild(preview)
        setHasPreview(true)
      } catch {
        if (!cancelled) setHasPreview(false)
      }
    })()

    return () => {
      cancelled = true
      if (host) host.innerHTML = ''
    }
  }, [canUsePreview, info.kind, symbol])

  return (
    <div className='ue-template-symbol-preview'>
      <span
        ref={hostRef}
        className={hasPreview && canUsePreview ? 'ue-template-symbol-rendered' : 'ue-template-symbol-rendered ue-template-symbol-rendered--hidden'}
      />
      {(!hasPreview || !canUsePreview) && <ManualTemplateIcon info={info} />}
    </div>
  )
}

const IdlePanel = ({ templateLayers, showAttrHint, isCreating, onCancelCreate, onSelectTemplate }: Props) => {
  const [items, setItems] = React.useState<TemplateItem[]>([])

  React.useEffect(() => {
    let cancelled = false

    ;(async () => {
      const loaded = await getTemplateItems(templateLayers || [])
      if (!cancelled) setItems(loaded)
    })()

    return () => {
      cancelled = true
    }
  }, [templateLayers])

  const hasTemplates = items.length > 0
  const groups = React.useMemo(() => groupTemplateItems(items), [items])

  if (!showAttrHint && !hasTemplates) return null

  return (
    <div className='ue-idle-panel'>
      {showAttrHint && (
        <div className='ue-idle-hint'>
          Выберите объект на карте для редактирования атрибутов
        </div>
      )}

      {hasTemplates && (
        <>
          {isCreating && (
            <div className='ue-create-mode'>
              <div>
                <div className='ue-create-mode__title'>Режим создания включен</div>
                <div className='ue-create-mode__text'>Щелкните на карте, чтобы нарисовать объект, или отмените создание.</div>
              </div>
              <button type='button' className='ue-btn ue-btn--secondary ue-btn--sm' onClick={onCancelCreate}>
                Отмена
              </button>
            </div>
          )}

          <div className='ue-idle-hint'>
            Выберите шаблон для создания нового объекта
          </div>

          <div className='ue-template-groups'>
            {groups.map((group) => (
              <section key={group.key} className='ue-template-layer'>
                <div className='ue-template-layer__title'>{group.layerTitle}</div>
                <div className='ue-template-grid'>
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type='button'
                      className='ue-template-tile'
                      onClick={() => onSelectTemplate(item.layer, item.template)}
                      title={`${group.layerTitle}: ${item.label}`}
                      disabled={isCreating}
                    >
                      <div className='ue-template-tile__symbol'>
                        <TemplateIcon info={item.symbolInfo} symbol={item.symbol} symbolType={item.symbolType} />
                      </div>
                      <div className='ue-template-tile__label'>{item.label}</div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default IdlePanel
