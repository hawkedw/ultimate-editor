import { React } from 'jimu-core'
import type { SelItem } from '../editor/useSelection'

interface Props {
  items: SelItem[]
  onCancel: () => void
  onConfirm: (masterOid: number) => void | Promise<void>
  onPreview?: (oid: number | null) => void | Promise<void>
}

const MergePanel = ({ items, onCancel, onConfirm, onPreview }: Props) => {
  const [masterOid, setMasterOid] = React.useState<number>(items[0]?.oid)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (items && items.length > 0) {
      const oid = items[0].oid
      setMasterOid(oid)
      if (onPreview) onPreview(oid)
    } else {
      if (onPreview) onPreview(null)
    }

    return () => {
      if (onPreview) onPreview(null)
    }
  }, [items, onPreview])

  const handlePick = (oid: number) => {
    setMasterOid(oid)
    if (onPreview) onPreview(oid)
  }

  const handleConfirm = async () => {
    if (masterOid == null) return
    setSaving(true)
    try {
      await onConfirm(masterOid)
    } finally {
      setSaving(false)
    }
  }

  const layerTitle = items && items[0] && items[0].layer && items[0].layer.title
    ? items[0].layer.title
    : 'Слой'

  return (
    <div className='ue-form-host'>
      <div className='ue-form-header'>
        <div className='ue-form-title'>{layerTitle}</div>

        <div className='ue-form-actions'>
          <button
            type='button'
            className='ue-btn ue-btn--secondary'
            onClick={onCancel}
            disabled={saving}
          >
            Отмена
          </button>

          <button
            type='button'
            className='ue-btn'
            onClick={handleConfirm}
            disabled={saving || masterOid == null}
          >
            Объединить
          </button>
        </div>
      </div>

      <div className='ue-form-hint'>
        Выберите мастер-объект. Его атрибуты будут сохранены у результирующего полигона.
      </div>

      <div className='ue-merge-list'>
        {items.map((it) => {
          const rawName = it && it.graphic && it.graphic.attributes
            ? it.graphic.attributes.name
            : null

          const name = String(rawName == null ? '' : rawName).trim() || 'Без названия'
          const active = masterOid === it.oid

          return (
            <label
              key={it.oid}
              className={'ue-merge-item' + (active ? ' ue-merge-item--active' : '')}
              onClick={() => handlePick(it.oid)}
            >
              <input
                type='radio'
                name='ue-merge-master'
                checked={active}
                onChange={() => handlePick(it.oid)}
              />
              <span className='ue-merge-item__text'>
                {name} <span className='ue-merge-item__oid'>OID: {it.oid}</span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default MergePanel
