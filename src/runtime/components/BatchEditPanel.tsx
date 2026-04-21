// src/widgets/ultimate-editor/src/runtime/components/BatchEditPanel.tsx
import { React } from 'jimu-core'
import FeatureForm from 'esri/widgets/FeatureForm'
import Graphic from 'esri/Graphic'
import type { IMConfig } from '../../config'
import { resolveRuleEffective, oidField, layerKey } from '../utils/ueUtils'
import type { SelItem } from '../editor/useSelection'
import type { FieldPolicy } from '../editor/useUltimateEditor'

interface Props {
  items: SelItem[]
  cfg: IMConfig
  ue: {
    getFieldPolicy: (layer: __esri.FeatureLayer | any) => FieldPolicy
  }
  onDeleted: () => void
  onCancel?: () => void
  onRequestDelete?: () => void
  deleteConfirm?: boolean
  onCancelDelete?: () => void
  onConfirmDelete?: () => void
}

const MIXED_TEXT = 'Разные значения'

const DBG = () => (window as any).__UE_DEBUG === true
const dlog = (...a: any[]) => { if (DBG()) console.log('[UE][Batch][v4]', ...a) }

const BatchEditPanel = ({
  items,
  cfg,
  ue,
  onDeleted,
  onCancel,
  onRequestDelete,
  deleteConfirm = false,
  onCancelDelete,
  onConfirmDelete
}: Props) => {
  const safeItems = items || []
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const setHost = React.useCallback((n: HTMLDivElement | null) => { hostRef.current = n }, [])

  const ffRef = React.useRef<__esri.FeatureForm | null>(null)
  const internalUpdateRef = React.useRef(false)
  const draftRef = React.useRef<Record<string, any>>({})
  const isDirtyRef = React.useRef(false)

  const [saving, setSaving] = React.useState(false)

  const uniqItems = React.useMemo(() => {
    const m = new Map<string, SelItem>()
    for (const it of safeItems) m.set(`${layerKey(it.layer)}#${it.oid}`, it)
    return Array.from(m.values())
  }, [safeItems])

  const layer = uniqItems[0]?.layer as any
  const rule = React.useMemo(
    () => (layer ? resolveRuleEffective(cfg, layer) : null),
    [cfg, layer]
  )

  const canEdit = (rule as any)?.allowAttrUpdate !== false
  const canDelete = (rule as any)?.allowDelete !== false

  const fieldTypeMap = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of ((layer?.fields || []) as any[])) m[f.name] = f.type
    return m
  }, [layer])

  const policy = React.useMemo(() => {
    if (!layer) {
      return {
        hidden: new Set<string>(),
        readonly: new Set<string>(),
        labels: new Map<string, string>()
      }
    }

    const base = ue.getFieldPolicy(layer)
    dlog('policy', {
      hidden: Array.from(base.hidden),
      readonly: Array.from(base.readonly)
    })

    return base
  }, [layer, ue])

  const isPolicyEmpty = React.useMemo(() => {
    return policy.hidden.size === 0 && policy.readonly.size === 0 && policy.labels.size === 0
  }, [policy])

  const formTemplate = React.useMemo(() => {
    if (!layer) return { elements: [] } as any

    const fields = ((layer?.fields || []) as any[])

    // политика пустая → не вмешиваемся, FeatureForm сам возьмёт смарт-форму / popupTemplate
    if (isPolicyEmpty) {
      return { elements: [] } as any
    }

    const expressionInfos: any[] = []

    const elements = fields
      .filter((f: any) => f?.name && !policy.hidden.has(String(f.name)))
      .map((f: any, i: number) => {
        const name = String(f.name)
        const exprName = `ue_batch_edit_${name.replace(/[^A-Za-z0-9_]/g, '_')}_${i}`

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
      for (const f of fields) {
        const name = String(f?.name || '')
        if (!name) continue
        out.add(name)
      }
      dlog('editableFieldNames (portal)', Array.from(out))
      return out
    }

    for (const f of fields) {
      const name = String(f?.name || '')
      if (!name) continue
      if (policy.hidden.has(name)) continue
      if (policy.readonly.has(name)) continue
      out.add(name)
    }
    dlog('editableFieldNames (policy)', Array.from(out))
    return out
  }, [layer, policy, isPolicyEmpty])

  const aggregated = React.useMemo(() => {
    if (!uniqItems.length) return { base: {}, mixed: new Set<string>() }

    const base: Record<string, any> = { ...uniqItems[0].graphic.attributes }
    const mixed = new Set<string>()

    for (let i = 1; i < uniqItems.length; i++) {
      const attrs = uniqItems[i].graphic.attributes as any
      for (const k of Object.keys(base)) {
        if (policy.hidden.has(k)) continue
        if (mixed.has(k)) continue
        if (base[k] !== attrs[k]) mixed.add(k)
      }
    }

    return { base, mixed }
  }, [uniqItems, policy])

  const mixedCount = aggregated.mixed.size

  const buildFeature = React.useCallback(() => {
    const base = aggregated.base
    const mixed = aggregated.mixed
    const attrs: Record<string, any> = {}

    for (const k of Object.keys(base)) {
      if (policy.hidden.has(k)) continue

      if (mixed.has(k)) {
        const t = String(fieldTypeMap[k] || '')
        const isTextLike = t === 'string' || t === 'guid' || t === 'global-id'
        attrs[k] = isTextLike ? MIXED_TEXT : base[k]
      } else {
        attrs[k] = base[k]
      }
    }

    const oidF = layer ? oidField(layer) : null
    if (oidF && uniqItems[0]) attrs[oidF] = uniqItems[0].oid

    Object.assign(attrs, draftRef.current)

    const g = new Graphic({
      geometry: uniqItems[0]?.graphic?.geometry,
      attributes: attrs
    } as any)
    ;(g as any).layer = layer
    return g
  }, [aggregated, fieldTypeMap, layer, uniqItems, policy])

  React.useEffect(() => {
    if (!canEdit) return
    const host = hostRef.current
    if (!host || ffRef.current) return

    const ff = new FeatureForm({ container: host } as any)

    ff.on?.('value-change', (e: any) => {
      if (internalUpdateRef.current) return
      if (!editableFieldNames.has(String(e.fieldName))) return
      draftRef.current[e.fieldName] = e.value
      isDirtyRef.current = true
      dlog('draft change', e.fieldName, e.value)
    })

    ffRef.current = ff
    dlog('FeatureForm created')

    return () => {
      try { ff.destroy() } catch {}
      if (ffRef.current === ff) ffRef.current = null
      dlog('FeatureForm destroyed')
    }
  }, [canEdit, editableFieldNames])

  React.useEffect(() => {
    draftRef.current = {}
    isDirtyRef.current = false
  }, [uniqItems.map((x) => `${layerKey(x.layer)}#${x.oid}`).join('|')])

  React.useEffect(() => {
    if (!canEdit) return
    const ff = ffRef.current
    if (!ff || !layer || !uniqItems.length) return

    const feature = buildFeature()

    internalUpdateRef.current = true
    try {
      ;(ff as any).layer = layer
      ;(ff as any).formTemplate = formTemplate
      ;(ff as any).feature = feature
    } finally {
      internalUpdateRef.current = false
    }

    dlog('bind batch feature', {
      count: uniqItems.length,
      oid0: uniqItems[0]?.oid,
      mixed: mixedCount,
      hidden: policy.hidden.size,
      readonly: policy.readonly.size
    })
  }, [canEdit, layer, formTemplate, buildFeature, uniqItems, mixedCount, policy])

  const handleSave = React.useCallback(async () => {
    if (!layer || !canEdit) return

    const oidF = oidField(layer)

    const cleanDraft: Record<string, any> = {}
    for (const [k, v] of Object.entries(draftRef.current)) {
      if (!editableFieldNames.has(String(k))) continue
      cleanDraft[k] = v
    }

    if (!Object.keys(cleanDraft).length) {
      onCancel?.()
      return
    }

    setSaving(true)
    try {
const updates = uniqItems.map(it =>
  new Graphic({
    attributes: {
      ...(it.graphic.attributes || {}),
      ...cleanDraft,
      ...(oidF ? { [oidF]: it.oid } : {})
    }
  } as any)
)


      await layer.applyEdits({ updateFeatures: updates } as any)
      isDirtyRef.current = false
      onDeleted()
    } finally {
      setSaving(false)
    }
  }, [canEdit, layer, uniqItems, editableFieldNames, onDeleted, onCancel])

  const handleDelete = React.useCallback(() => {
    if (!layer || !canDelete) return
    onRequestDelete?.()
  }, [layer, canDelete, onRequestDelete])

  const handleCancel = React.useCallback(() => {
    onCancel?.()
  }, [onCancel])

  if (!uniqItems.length) return null
  if (!canEdit && !canDelete) return null

  return (
    <div
      className='ue-form-host'
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden' }}
    >
      <div className='ue-form-header'>
        <div className='ue-form-title' title={layer?.title || 'Объекты'}>
          {layer?.title || 'Объекты'}
        </div>

        <div className='ue-form-actions'>
          {onCancel && (
            <button type='button' className='ue-btn ue-btn--secondary' onClick={handleCancel}>
              Отмена
            </button>
          )}

          {canEdit && (
            <button type='button' className='ue-btn' onClick={handleSave} disabled={saving}>
              Сохранить
            </button>
          )}

          {canDelete && (
            <button type='button' className='ue-btn ue-btn--danger' onClick={handleDelete}>
              Удалить
            </button>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className='ue-form-delete-row'>
          <div className='ue-form-delete-text'>
            Удалить {uniqItems.length} объект
            {uniqItems.length === 1 ? '' : uniqItems.length < 5 ? 'а' : 'ов'}?
          </div>
          <div className='ue-form-delete-actions'>
            <button type='button' className='ue-btn ue-btn--secondary ue-btn--sm' onClick={onCancelDelete}>
              Отмена
            </button>
            <button type='button' className='ue-btn ue-btn--danger ue-btn--sm' onClick={onConfirmDelete}>
              Удалить
            </button>
          </div>
        </div>
      )}

      {canEdit && mixedCount > 0 && (
        <div className='ue-form-hint'>{MIXED_TEXT}</div>
      )}

      {canEdit && (
        <div
          ref={setHost}
          style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
        />
      )}
    </div>
  )
}

export default BatchEditPanel
