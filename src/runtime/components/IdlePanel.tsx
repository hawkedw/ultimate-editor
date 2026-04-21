import { React } from 'jimu-core'
import type FeatureLayer from 'esri/layers/FeatureLayer'
import Graphic from 'esri/Graphic'

interface Props {
  templateLayers: FeatureLayer[]
  showAttrHint: boolean
  onSelectTemplate: (layer: FeatureLayer, template: __esri.FeatureTemplate) => void
}

type SymbolInfo = {
  kind: 'polygon' | 'polyline' | 'point'
  stroke: string
  strokeWidth: number
  fill: string
}

type TemplateItem = {
  key: string
  layer: FeatureLayer
  template: __esri.FeatureTemplate
  label: string
  layerTitle: string
  symbolInfo: SymbolInfo
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
      fill: rgbaToCss(symbol?.color, 'rgba(0,0,0,0)')
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

  return {
    kind: 'point',
    stroke: rgbaToCss(symbol?.outline?.color || symbol?.color, '#49e7ff'),
    strokeWidth: Number(symbol?.outline?.width ?? 1.4),
    fill: rgbaToCss(symbol?.color, '#49e7ff')
  }
}

const getTemplateItems = async (layers: FeatureLayer[]): Promise<TemplateItem[]> => {
  const out: TemplateItem[] = []

  for (const layer of (layers || [])) {
    try { await layer.load?.() } catch {}

    const layerTitle = (layer as any).title || 'Слой'
    const allTemplates: Array<{ template: __esri.FeatureTemplate, key: string, label: string }> = []

    const directTemplates: __esri.FeatureTemplate[] = Array.isArray((layer as any).templates)
      ? (layer as any).templates
      : []

    directTemplates.forEach((template: any, idx: number) => {
      allTemplates.push({
        template,
        key: `${(layer as any).id || layerTitle}__tpl__${idx}__${template?.name || 'template'}`,
        label: template?.name || 'Шаблон'
      })
    })

    const types: any[] = Array.isArray((layer as any).types) ? (layer as any).types : []
    types.forEach((tp: any, typeIdx: number) => {
      const templates: __esri.FeatureTemplate[] = Array.isArray(tp?.templates) ? tp.templates : []
      templates.forEach((template: any, tplIdx: number) => {
        allTemplates.push({
          template,
          key: `${(layer as any).id || layerTitle}__type__${typeIdx}__tpl__${tplIdx}__${template?.name || 'template'}`,
          label: template?.name || tp?.name || 'Шаблон'
        })
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
        symbolInfo: symbolToInfo(layer as any, symbol)
      })
    }
  }

  return out
}

const TemplateIcon = ({ info }: { info: SymbolInfo }) => {
  if (info.kind === 'polygon') {
    return (
      <svg viewBox='0 0 32 24' className='ue-template-svg' aria-hidden='true'>
        <polygon
          points='5,19 6,6 26,7 24,17'
          fill={info.fill}
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

const IdlePanel = ({ templateLayers, showAttrHint, onSelectTemplate }: Props) => {
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
          <div className='ue-idle-hint'>
            Выберите шаблон для создания нового объекта
          </div>

          <div className='ue-template-grid'>
            {items.map((item) => (
              <button
                key={item.key}
                type='button'
                className='ue-template-tile'
                onClick={() => onSelectTemplate(item.layer, item.template)}
                title={item.label}
              >
                <div className='ue-template-tile__symbol'>
                  <TemplateIcon info={item.symbolInfo} />
                </div>
                <div className='ue-template-tile__label'>{item.label}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default IdlePanel
