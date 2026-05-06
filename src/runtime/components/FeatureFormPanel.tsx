// src/widgets/ultimate-editor/src/runtime/components/FeatureFormPanel.tsx
import { React } from 'jimu-core'
import FeatureForm from 'esri/widgets/FeatureForm'
import type { FieldPolicy } from '../editor/useUltimateEditor'
import { dlog, dwarn } from '../debug'

interface Props {
  item: any
  ue: {
    getFieldPolicy: (layer: __esri.FeatureLayer | any) => FieldPolicy
  }
  isNew?: boolean
  onSaveNew?: (draftAttrs: Record<string, any>) => Promise<void>
  onCancelNew?: () => Promise<void> | void
  onSaveExisting?: (draftAttrs: Record<string, any>) => Promise<void>
  onSaved?: () => void
  onCancel?: () => void
  onRequestDelete?: () => void
  deleteConfirm?: boolean
  onCancelDelete?: () => void
  onConfirmDelete?: () => void
}

function getLayerStableKey (layer: any): string {
  const url = String(layer?.url || '')
  const lid = layer?.layerId ?? layer?.sublayerId ?? ''
  const id = String(layer?.id || '')
  const title = String(layer?.title || '')
  return url ? `${url}::${lid || id || title}` : `${id || title || 'layer'}::${lid}`
}

function getItemOid (item: any, layer: any): any {
  const oidField = layer?.objectIdField || 'OBJECTID'
  return item?.oid ?? item?.graphic?.attributes?.[oidField] ?? null
}

function getElementCount (formTemplate: any): number {
  return (formTemplate?.elements || []).length
}

function measureElement (el: HTMLElement | null) {
  if (!el) return null
  const rect = el.getBoundingClientRect?.()
  const style = window.getComputedStyle?.(el)
  return {
    offsetHeight: el.offsetHeight,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    rectHeight: rect?.height,
    display: style?.display,
    position: style?.position,
    flex: style?.flex,
    height: style?.height,
    minHeight: style?.minHeight,
    overflow: style?.overflow
  }
}

const FeatureFormPanel = ({
  item,
  ue,
  isNew,
  onSaveNew,
  onCancelNew,
  onSaveExisting,
  onSaved,
  onCancel,
  onRequestDelete,
  deleteConfirm,
  onCancelDelete,
  onConfirmDelete
}: Props) => {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const featureFormRef = React.useRef<any>(null)
  const initSeqRef = React.useRef(0)

  const layer = item?.layer as any
  const layerTitle = layer?.title || 'Объект'
  const oid = getItemOid(item, layer)
  const layerStableKey = React.useMemo(() => getLayerStableKey(layer), [layer])

  const policy = React.useMemo(() => {
    if (!layer) {
      return { hidden: new Set<string>(), readonly: new Set<string>(), labels: new Map<string, string>(), order: [] as string[] }
    }
    return ue.getFieldPolicy(layer)
  }, [ue, layer])

  const policySignature = React.useMemo(() => {
    return JSON.stringify({
      hidden: Array.from(policy.hidden || []).sort(),
      readonly: Array.from(policy.readonly || []).sort(),
      labels: Array.from(policy.labels || []).sort(([a], [b]) => String(a).localeCompare(String(b))),
      order: policy.order || []
    })
  }, [policy])

  const isPolicyEmpty = React.useMemo(() => {
    return (
      policy.hidden.size === 0 &&
      policy.readonly.size === 0 &&
      policy.labels.size === 0 &&
      (!policy.order || policy.order.length === 0)
    )
  }, [policySignature, policy])

  const formTemplate = React.useMemo(() => {
    if (!layer) return null
    const layerFields = ((layer?.fields || []) as any[])
    if (!layerFields.length) return null
    if (isPolicyEmpty) return null

    const byName = new Map<string, any>(
      layerFields.filter((f: any) => f?.name).map((f: any) => [String(f.name), f])
    )

    const orderedFields: any[] = policy.order?.length
      ? policy.order.map(name => byName.get(name)).filter(Boolean)
      : layerFields

    const expressionInfos: any[] = []
    const elements = orderedFields
      .filter((f: any) => f?.name && !policy.hidden.has(String(f.name)))
      .map((f: any, i: number) => {
        const name = String(f.name)
        const exprName = `ue_single_edit_${name.replace(/[^A-Za-z0-9_]/g, '_')}_${i}`
        expressionInfos.push({
          name: exprName,
          title: exprName,
          expression: policy.readonly.has(name) ? 'false' : 'true',
          returnType: 'boolean'
        })
        return {
          type: 'field',
          fieldName: name,
          label: policy.labels.get(name) || f.alias || name,
          editableExpression: exprName
        }
      })

    return elements.length ? { expressionInfos, elements } as any : null
  }, [layer, policySignature, isPolicyEmpty, policy])

  const formTemplateSignature = React.useMemo(() => {
    return formTemplate
      ? JSON.stringify({
        fields: (formTemplate.elements || []).map((e: any) => [e.fieldName, e.label, e.editableExpression]),
        expressions: (formTemplate.expressionInfos || []).map((e: any) => [e.name, e.expression])
      })
      : 'portal-default'
  }, [formTemplate])

  const formInstanceKey = React.useMemo(() => {
    return `${isNew ? 'new' : 'existing'}::${layerStableKey}::${oid ?? 'no-oid'}::${formTemplateSignature}`
  }, [isNew, layerStableKey, oid, formTemplateSignature])

  const editableFieldNames = React.useMemo(() => {
    const out = new Set<string>()
    const fields = ((layer?.fields || []) as any[])
    if (isPolicyEmpty) {
      for (const f of fields) {
        const name = String(f?.name || '')
        if (name) out.add(name)
      }
      return out
    }
    for (const f of fields) {
      const name = String(f?.name || '')
      if (!name) continue
      if (policy.hidden.has(name)) continue
      if (policy.readonly.has(name)) continue
      out.add(name)
    }
    return out
  }, [layer, policySignature, isPolicyEmpty, policy])

  React.useEffect(() => {
    dlog('[UE][FFP] render snapshot', {
      formInstanceKey,
      isNew: !!isNew,
      oid,
      layerTitle,
      hasGraphic: !!item?.graphic,
      hasLayer: !!layer,
      hasTemplate: !!formTemplate,
      fieldCount: getElementCount(formTemplate),
      host: measureElement(hostRef.current),
      body: measureElement(hostRef.current?.parentElement as HTMLElement | null),
      panel: measureElement(hostRef.current?.closest?.('.ue-panel') as HTMLElement | null)
    })
  })

  React.useEffect(() => {
    const host = hostRef.current
    const seq = ++initSeqRef.current

    dlog('[UE][FFP] effect start', {
      seq,
      formInstanceKey,
      isNew: !!isNew,
      oid,
      layerTitle,
      hasGraphic: !!item?.graphic,
      hasLayer: !!layer,
      hasTemplate: !!formTemplate,
      fieldCount: getElementCount(formTemplate),
      host: measureElement(host),
      body: measureElement(host?.parentElement as HTMLElement | null),
      panel: measureElement(host?.closest?.('.ue-panel') as HTMLElement | null)
    })

    if (!host || !item?.graphic || !layer) return
    host.innerHTML = ''

    let ff: any = null
    let rafId: number | null = null
    let t0: any = null
    let t250: any = null

    const logDelayed = (label: string) => {
      dlog(`[UE][FFP] ${label}`, {
        seq,
        formInstanceKey,
        host: measureElement(host),
        body: measureElement(host.parentElement as HTMLElement | null),
        panel: measureElement(host.closest?.('.ue-panel') as HTMLElement | null),
        esriForm: measureElement(host.querySelector?.('.esri-feature-form') as HTMLElement | null)
      })
    }

    const createForm = (withTemplate: boolean) => new FeatureForm({
      container: host,
      feature: item.graphic,
      layer,
      ...(withTemplate && formTemplate ? { formTemplate } as any : {})
    } as any)

    try {
      ff = createForm(true)
      featureFormRef.current = ff
      dlog('[UE][FFP] init ok', {
        seq,
        formInstanceKey,
        isNew: !!isNew,
        layerTitle,
        hasTemplate: !!formTemplate,
        fieldCount: getElementCount(formTemplate),
        host: measureElement(host)
      })
    } catch (e) {
      dwarn('[UE][FFP] FeatureForm init with template failed, retrying without template', e)
      try {
        host.innerHTML = ''
        ff = createForm(false)
        featureFormRef.current = ff
        dlog('[UE][FFP] fallback init ok', {
          seq,
          formInstanceKey,
          isNew: !!isNew,
          layerTitle,
          host: measureElement(host)
        })
      } catch (fallbackError) {
        console.error('[UE][FFP] FeatureForm init error', fallbackError)
      }
    }

    try { rafId = window.requestAnimationFrame?.(() => logDelayed('after raf')) ?? null } catch {}
    t0 = window.setTimeout?.(() => logDelayed('after timeout 0'), 0)
    t250 = window.setTimeout?.(() => logDelayed('after timeout 250'), 250)

    return () => {
      dlog('[UE][FFP] cleanup', {
        seq,
        formInstanceKey,
        host: measureElement(host),
        body: measureElement(host.parentElement as HTMLElement | null),
        panel: measureElement(host.closest?.('.ue-panel') as HTMLElement | null)
      })
      try { if (rafId != null) window.cancelAnimationFrame?.(rafId) } catch {}
      try { if (t0 != null) window.clearTimeout?.(t0) } catch {}
      try { if (t250 != null) window.clearTimeout?.(t250) } catch {}
      try { ff?.destroy() } catch {}
      featureFormRef.current = null
      if (host) host.innerHTML = ''
    }
  }, [formInstanceKey])

  const handleSave = async () => {
    const rawValues = featureFormRef.current?.getValues?.() ?? {}
    const values = Object.fromEntries(
      Object.entries(rawValues).filter(([k]) => editableFieldNames.has(String(k)))
    )
    if (isNew) { await onSaveNew?.(values); return }
    if (onSaveExisting) { await onSaveExisting(values); return }
    onSaved?.()
  }

  const handleCancel = async () => {
    if (isNew) { await onCancelNew?.(); return }
    onCancel?.()
  }

  return (
    <div className='ue-form-host'>
      <div className='ue-form-header'>
        <div className='ue-form-title'>{layerTitle}</div>
        <div className='ue-form-actions'>
          <button type='button' className='ue-btn ue-btn--secondary ue-btn--sm' onClick={handleCancel}>Отмена</button>
          <button type='button' className='ue-btn ue-btn--sm' onClick={handleSave}>Сохранить</button>
          {!isNew && !!onRequestDelete && (
            <button type='button' className='ue-btn ue-btn--danger ue-btn--sm' onClick={onRequestDelete}>Удалить</button>
          )}
        </div>
      </div>

      {!isNew && deleteConfirm && (
        <div className='ue-form-delete-row'>
          <div className='ue-form-delete-text'>Удалить объект?</div>
          <div className='ue-form-delete-actions'>
            <button type='button' className='ue-btn ue-btn--secondary ue-btn--sm' onClick={onCancelDelete}>Нет</button>
            <button type='button' className='ue-btn ue-btn--danger ue-btn--sm' onClick={onConfirmDelete}>Да</button>
          </div>
        </div>
      )}

      <div
        className='ue-form-body'
        style={{
          display: 'block',
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        <div
          ref={hostRef}
          style={{
            minHeight: 0
          }}
        />
      </div>
    </div>
  )
}

export default FeatureFormPanel
