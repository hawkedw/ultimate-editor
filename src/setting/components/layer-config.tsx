/** @jsx jsx */
import { React, Immutable, jsx, css } from 'jimu-core'
import { Checkbox, Switch, TextInput } from 'jimu-ui'
import { loadArcGISJSAPIModules } from 'jimu-arcgis'
import type { LayerRule, FieldSetting } from '../../config'

const SKIP_TYPES = new Set([
  'esriFieldTypeOID',
  'esriFieldTypeGeometry',
  'esriFieldTypeGlobalID',
  'esriFieldTypeBlob',
  'esriFieldTypeRaster',
  'esriFieldTypeXML'
])

type ServiceField = { name: string; alias: string; type: string; editable: boolean; nullable?: boolean }

type LayerMeta = {
  key: string
  title: string
  url?: string
  canAdd: boolean
  canUpdate: boolean
  canDelete: boolean
  apiLayer?: any
}

type ExtendedFieldSetting = FieldSetting & {
  required?: boolean
  defaultValue?: string
  defaultIsArcade?: boolean
}

function toPlain<T> (v: any): T {
  return v?.asMutable ? v.asMutable({ deep: true }) : (v ?? {})
}

function toPlainArr<T> (v: any): T[] {
  if (!v) return []
  return v?.asMutable ? v.asMutable({ deep: true }) : (Array.isArray(v) ? v : [])
}

function resolveLayerUrl (url: string): string {
  const clean = url.replace(/\/+$/, '')
  if (/(FeatureServer|MapServer)$/i.test(clean)) return `${clean}/0`
  return clean
}

async function fetchServiceFieldsEsriRequest (url: string): Promise<ServiceField[]> {
  const [esriRequest] = await loadArcGISJSAPIModules(['esri/request']) as any[]
  const target = resolveLayerUrl(url)
  const res = await esriRequest(target, {
    query: { f: 'json' },
    responseType: 'json'
  })
  return (res?.data?.fields ?? []) as ServiceField[]
}

function applySortByPopup (
  fields: ServiceField[],
  popupFieldInfos: any[]
): ServiceField[] {
  if (!popupFieldInfos.length) return fields
  const popupOrder = new Map<string, number>()
  popupFieldInfos.forEach((fi, i) => {
    if (fi?.fieldName) popupOrder.set(String(fi.fieldName), i)
  })
  return [...fields].sort((a, b) => {
    const ia = popupOrder.has(a.name) ? popupOrder.get(a.name)! : 1e9
    const ib = popupOrder.has(b.name) ? popupOrder.get(b.name)! : 1e9
    return ia - ib
  })
}

export default function LayerConfig (props: {
  meta: LayerMeta
  rule: LayerRule
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  onChange: (rule: LayerRule) => void
  translate: (id: string) => string
  hideLayerEnableSwitch?: boolean
}) {
  const { meta, rule, enabled, onEnabledChange, onChange, hideLayerEnableSwitch } = props

  const [serviceFields, setServiceFields] = React.useState<ServiceField[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const dragIndexRef = React.useRef<number | null>(null)
  const [dragOver, setDragOver] = React.useState<number | null>(null)

  const plainRule = toPlain<LayerRule>(rule)
  const ruleFields = toPlainArr<ExtendedFieldSetting>((plainRule as any).fields)

  const C_TEXT = '#ffffff'
  const C_BORDER = 'rgba(255,255,255,0.12)'
  const C_INPUT = '#1a212b'

  const styles = css`
    color: ${C_TEXT};
    input, textarea {
      background: ${C_INPUT} !important;
      color: ${C_TEXT} !important;
      border-color: ${C_BORDER} !important;
    }
    input::placeholder, textarea::placeholder {
      color: rgba(255,255,255,0.55) !important;
    }
    .ue-drag-row { cursor: grab; transition: background 0.12s; }
    .ue-drag-row:active { cursor: grabbing; }
    .ue-drag-over { background: rgba(0,160,220,0.18) !important; }
  `

  const popupFieldInfos: any[] = (meta as any)?.apiLayer?.popupTemplate?.fieldInfos ?? []
  const hasPopupInfos = Array.isArray(popupFieldInfos) && popupFieldInfos.length > 0

  const getPopupFI = (name: string): any | null => {
    if (!hasPopupInfos) return null
    return popupFieldInfos.find(fi => String(fi?.fieldName ?? '') === name) ?? null
  }

  React.useEffect(() => {
    let cancelled = false
    if (!meta?.url) {
      setServiceFields([])
      setLoading(false)
      setLoadError(null)
      return
    }
    setLoading(true)
    setLoadError(null)
    fetchServiceFieldsEsriRequest(meta.url)
      .then(fields => {
        if (cancelled) return
        const filtered = fields.filter(f => !SKIP_TYPES.has(f.type))
        const sorted = applySortByPopup(filtered, popupFieldInfos)
        setServiceFields(sorted)
      })
      .catch((e) => {
        if (cancelled) return
        setServiceFields([])
        setLoadError(String(e?.message ?? e))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.url])

  const update = (patch: Partial<LayerRule>) => {
    onChange(Immutable({ ...plainRule, ...patch, id: meta.key, url: meta.url, title: meta.title }) as any)
  }

  const getFieldSetting = (sf: ServiceField): ExtendedFieldSetting => {
    const existing = ruleFields.find(f => f.name === sf.name)
    if (existing) return existing
    const fi = getPopupFI(sf.name)
    const visibleDefault = hasPopupInfos ? !!fi?.visible : true
    const editableDefault = hasPopupInfos
      ? (fi?.isEditable ?? false) && (sf.editable !== false)
      : (sf.editable !== false)
    return {
      name: sf.name,
      label: fi?.label || sf.alias || sf.name,
      visible: visibleDefault,
      editable: editableDefault,
      required: false,
      defaultValue: '',
      defaultIsArcade: false
    }
  }

  const effectiveFields: ExtendedFieldSetting[] = React.useMemo(() => {
    return serviceFields.map(sf => getFieldSetting(sf))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceFields, ruleFields])

  const setFields = (next: ExtendedFieldSetting[]) => update({ fields: next as any })

  const updateField = (name: string, patch: Partial<ExtendedFieldSetting>) => {
    const nextAll = effectiveFields.map(f => (f.name === name ? { ...f, ...patch } : f))
    setFields(nextAll)
  }

  React.useEffect(() => {
    if (serviceFields.length === 0) return
    const missing = serviceFields.some(sf => !ruleFields.some(f => f.name === sf.name))
    if (!missing) return
    setFields(effectiveFields)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceFields])

  const handleDragStart = (idx: number) => { dragIndexRef.current = idx }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOver(idx)
  }

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault()
    const fromIdx = dragIndexRef.current
    if (fromIdx === null || fromIdx === dropIdx) {
      dragIndexRef.current = null
      setDragOver(null)
      return
    }
    const next = [...effectiveFields]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(dropIdx, 0, moved)
    setFields(next)
    dragIndexRef.current = null
    setDragOver(null)
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
    setDragOver(null)
  }

  const svcCanAttr = !!meta.canUpdate
  const svcCanGeom = (() => {
    const l = meta.apiLayer
    if (!meta.canUpdate) return false
    if (!l) return true
    if (l?.capabilities?.editing?.supportsGeometryUpdate === false) return false
    if (l?.allowGeometryUpdates === false) return false
    return true
  })()

  const rowStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    minHeight: 32, padding: 0, whiteSpace: 'nowrap'
  }
  const labelStyle: React.CSSProperties = { whiteSpace: 'nowrap' }
  const disabledLabelStyle: React.CSSProperties = { ...labelStyle, opacity: 0.45 }
  const permissionsBlockStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 18, marginBottom: 14
  }

  return (
    <div css={styles}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Разрешения</div>

      <div style={permissionsBlockStyle}>
        {!hideLayerEnableSwitch && (
          <div style={rowStyle}>
            <span style={labelStyle}>Включить слой</span>
            <Switch checked={enabled} onChange={(e: any) => onEnabledChange(!!(e?.target ? e.target.checked : e))} />
          </div>
        )}
        <div style={rowStyle}>
          <span style={meta.canAdd ? labelStyle : disabledLabelStyle}>Создание</span>
          <Switch
            checked={meta.canAdd && plainRule.allowCreate === true}
            disabled={!meta.canAdd}
            onChange={(e: any) => update({ allowCreate: !!(e?.target ? e.target.checked : e) })}
          />
        </div>
        <div style={rowStyle}>
          <span style={meta.canUpdate ? labelStyle : disabledLabelStyle}>Редактирование</span>
          <Switch
            checked={meta.canUpdate && plainRule.allowUpdate === true}
            disabled={!meta.canUpdate}
            onChange={(e: any) => {
              const v = !!(e?.target ? e.target.checked : e)
              update({
                allowUpdate: v,
                allowAttrUpdate: v ? (svcCanAttr ? (plainRule.allowAttrUpdate ?? true) : false) : false,
                allowGeomUpdate: v ? (svcCanGeom ? (plainRule.allowGeomUpdate ?? true) : false) : false
              })
            }}
          />
        </div>
        <div style={rowStyle}>
          <span style={meta.canDelete ? labelStyle : disabledLabelStyle}>Удаление</span>
          <Switch
            checked={meta.canDelete && plainRule.allowDelete === true}
            disabled={!meta.canDelete}
            onChange={(e: any) => update({ ...(plainRule as any), allowDelete: !!(e?.target ? e.target.checked : e) } as any)}
          />
        </div>
        <div style={rowStyle}>
          <span style={svcCanAttr ? labelStyle : disabledLabelStyle}>Атрибуты</span>
          <Switch
            checked={svcCanAttr && plainRule.allowAttrUpdate === true}
            disabled={!svcCanAttr}
            onChange={(e: any) => update({ allowAttrUpdate: !!(e?.target ? e.target.checked : e) })}
          />
        </div>
        <div style={rowStyle}>
          <span style={svcCanGeom ? labelStyle : disabledLabelStyle}>Геометрия</span>
          <Switch
            checked={svcCanGeom && plainRule.allowGeomUpdate === true}
            disabled={!svcCanGeom}
            onChange={(e: any) => update({ allowGeomUpdate: !!(e?.target ? e.target.checked : e) })}
          />
        </div>
      </div>

      {loading && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '8px 0' }}>Загрузка полей...</div>}
      {!loading && loadError && <div style={{ color: '#f08a8a', fontSize: 12, padding: '8px 0' }}>Ошибка: {loadError}</div>}

      {!loading && !loadError && serviceFields.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 600, width: 20 }}></th>
              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Поле</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 600 }}>Вид</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 600 }}>Ред.</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 600 }}>Обяз.</th>
              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Знач.</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 600 }}>Arcade</th>
            </tr>
          </thead>
          <tbody>
            {effectiveFields.map((fs, idx) => (
              <tr
                key={fs.name}
                className={`ue-drag-row${dragOver === idx ? ' ue-drag-over' : ''}`}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
              >
                <td style={{ textAlign: 'center', padding: '4px 6px', color: 'rgba(255,255,255,0.35)', userSelect: 'none' }}>⠿</td>
                <td style={{ padding: '4px 6px' }}>{fs.label || fs.name}</td>
                <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <Checkbox checked={!!fs?.visible} onChange={(e: any) => updateField(fs.name, { visible: !!(e?.target ? e.target.checked : e) })} />
                </td>
                <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <Checkbox checked={!!fs?.editable} onChange={(e: any) => updateField(fs.name, { editable: !!(e?.target ? e.target.checked : e) })} />
                </td>
                <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <Checkbox checked={!!fs?.required} onChange={(e: any) => updateField(fs.name, { required: !!(e?.target ? e.target.checked : e) })} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <TextInput
                    size='sm'
                    value={fs?.defaultValue ?? ''}
                    onChange={(e: any) => updateField(fs.name, { defaultValue: e.target.value })}
                    style={{ height: 26, width: '100%' }}
                  />
                </td>
                <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <Checkbox checked={!!fs?.defaultIsArcade} onChange={(e: any) => updateField(fs.name, { defaultIsArcade: !!(e?.target ? e.target.checked : e) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
