import { React } from 'jimu-core'
import type { SelItem } from '../editor/useSelection'

interface Props {
  items: SelItem[]
  onConfirm: (keepIndex: number) => void
  onCancel: () => void
}

const MergeDialog = ({ items, onConfirm, onCancel }: Props) => {
  const [selected, setSelected] = React.useState(0)

  return (
    <div className='ue-modal'>
      <div className='ue-modal-card'>
        <div className='ue-form-title'>Выберите атрибуты объединённого объекта</div>
        {items.map((it, i) => (
          <label key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', color: 'rgba(255,255,255,.85)', fontSize: 13 }}>
            <input type='radio' name='merge-sel' checked={selected === i} onChange={() => setSelected(i)} />
            {it.layer.title} — OID: {it.oid}
          </label>
        ))}
        <div className='ue-form-actions'>
          <button type='button' className='ue-btn' onClick={() => onConfirm(selected)}>Объединить</button>
          <button type='button' className='ue-btn' onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </div>
  )
}

export default MergeDialog
