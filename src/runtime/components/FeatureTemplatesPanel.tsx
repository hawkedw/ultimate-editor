// src/widgets/ultimate-editor/src/runtime/components/FeatureTemplatesPanel.tsx
import { React } from 'jimu-core'
import FeatureTemplates from 'esri/widgets/FeatureTemplates'
import type FeatureLayer from 'esri/layers/FeatureLayer'

interface Props {
  view: __esri.MapView | __esri.SceneView | null
  layers: FeatureLayer[]
  onSelectTemplate: (layer: FeatureLayer, template: __esri.FeatureTemplate) => void
  visible?: boolean
}

const FeatureTemplatesPanel = ({ view, layers, onSelectTemplate, visible = true }: Props) => {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const setHost = React.useCallback((n: HTMLDivElement | null) => { hostRef.current = n }, [])

  const wtRef = React.useRef<__esri.FeatureTemplates | null>(null)
  const selHandleRef = React.useRef<__esri.Handle | null>(null)

  const viewKey = (view as any)?.id || ((view as any)?.type ?? 'no-view')

  React.useEffect(() => {
    const host = hostRef.current
    if (!visible || !view || !host) return

    // ВАЖНО: при смене view — пересоздаём виджет (надёжнее в ExB)
    try { selHandleRef.current?.remove() } catch {}
    selHandleRef.current = null
    try { wtRef.current?.destroy() } catch {}
    wtRef.current = null
    host.innerHTML = ''

    const wt = new FeatureTemplates({
      view,
      layers,
      container: host
    } as any)

    wtRef.current = wt

    selHandleRef.current = wt.on('select', (e: any) => {
      const layer = e?.item?.layer as FeatureLayer
      const template = e?.template as __esri.FeatureTemplate
      if (!layer || !template) return
      onSelectTemplate(layer, template)
    })

    return () => {
      try { selHandleRef.current?.remove() } catch {}
      selHandleRef.current = null
      try { wt.destroy() } catch {}
      if (wtRef.current === wt) wtRef.current = null
    }
  }, [viewKey, visible, layers])

  return visible ? <div className='ue-templates-host' ref={setHost} /> : null
}

export default FeatureTemplatesPanel
