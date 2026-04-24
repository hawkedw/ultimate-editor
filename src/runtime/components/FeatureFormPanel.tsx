// src/widgets/ultimate-editor/src/runtime/components/FeatureFormPanel.tsx
import { React } from 'jimu-core'
import FeatureForm from 'esri/widgets/FeatureForm'
import type { FieldSetting } from '../../config'
import type { FieldPolicy } from '../editor/useUltimateEditor'

interface Props {
  item: any
  cfg: any
  ue: {
    getFieldPolicy: (layer: __esri.FeatureLayer | any) => FieldPolicy
  }
  isNew?: boolean
  onSaveNew?: (draftAttrs: Record<string, any>) => Promise<void>
  onCancelNew?: () => Promise<void> | void
  onSaveExisting?: (draftAttrs: Record<string, any>) => Promise<void>
  onSaved?: () => void
  onCancel?: () => void
  onDeleted?: () => void
  onRequestDelete?: () => void
  deleteConfirm?: boolean
  onCancelDelete?: () => void
  onConfirmDelete?: () => void
}

function toPlainFields (raw: any): FieldSetting[] {
  if (!raw) return []
  if (typeof raw.asMutable === 'function') return raw.asMutable({ deep: true }) as FieldSetting[]
  if (Array.isArray(raw)) return raw as FieldSetting[]
  return []
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

  const layer = item?.layer as any
  const layerTitle = layer?.title || 'Объект'

  const policy = React.useMemo(() => {
    if (!layer) {
      return { hidden: new Set<string>(), readonly: new Set<string>(), labels: new Map<string, string>(), order: [] as string[] }
    }
    return ue.getFieldPolicy(layer)
  }, [ue, layer])

  const isPolicyEmpty = React.useMemo(() => {
    return (
      policy.hidden.size === 0 &&
      policy.readonly.size === 0 &&
      policy.labels.size === 0 &&
      (!policy.order || policy.order.length === 0)
    )
  }, [policy])

  const formTemplate = React.useMemo(() => {
    if (!layer) return null
    const layerFields = ((layer?.fields || []) as any[])
    if (!layerFields.length) return null
    if (isPolicyEmpty) return null

    const byName = new Map<string, any>(
      layerFields.filter((f: any) => f?.name).map((f: any) => [String(f.name), f])
    )

    // если есть явный порядок из настроек — используем его, иначе порядок сервиса
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

    return { expressionInfos, elements } as any
  }, [layer, policy, isPolicyEmpty])

  const editableFieldNames = React.useMemo(() => {
    const out = new Set<string>()
    const fields = ((layer?.fields || []) as any[])
    if (isPolicyEmpty) {
      for (const f of fields) { const name = String(f?.name || ''); if (name) out.add(name) }
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
  }, [layer, policy, isPolicyEmpty])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host || !item?.graphic || !layer) return
    host.innerHTML = ''

    let ff: any
    try {
      ff = new FeatureForm({
        container: host,
        feature: item.graphic,
        layer,
        ...(formTemplate ? { formTemplate } as any : {})
      } as any)
      if (formTemplate) (ff as any).formTemplate = formTemplate
      featureFormRef.current = ff
    } catch (e) {
      console.error('[UE][FFP] FeatureForm init error', e)
    }

    return () => {
      try { ff?.destroy() } catch {}
      featureFormRef.current = null
      if (host) host.innerHTML = ''
    }
  }, [item, layer, formTemplate])

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

      <div className='ue-form-body'>
        <div ref={hostRef} />
      </div>
    </div>
  )
}

export default FeatureFormPanel
