import { React } from 'jimu-core'
import type { Tool } from '../editor/useUltimateEditor'

export interface ToolbarProps {
  selCount: number
  tool: Tool
  singleGeomType: 'point' | 'polyline' | 'polygon' | null
  geomChecked: boolean
  showSplitButton: boolean
  canSplit: boolean
  canMerge: boolean
  canGeom: boolean
  onToggleAdd: () => void
  onToggleRemove: () => void
  onToggleSplit: () => void
  onGeomToggle: () => void
  onMerge: () => void
  onClear: () => void
  onToggleSettings: () => void
}

const cls = (base: string, active?: boolean) => active ? `${base} ${base}--active` : base

const Toolbar = (p: ToolbarProps) => (
  <div className='ue-tb'>
    <div className='ue-tb-info'>Выбрано: {p.selCount}</div>

    <button type='button' className={cls('ue-tb-btn', p.tool === 'add')}    onClick={p.onToggleAdd}>+&nbsp;Выбор</button>
    <button type='button' className={cls('ue-tb-btn', p.tool === 'remove')} onClick={p.onToggleRemove}>−&nbsp;Выбор</button>
    <button type='button' className='ue-tb-btn' onClick={p.onClear}>Очистить</button>

    {p.showSplitButton && (
      <button
        type='button'
        className={cls('ue-tb-btn', p.tool === 'split')}
        disabled={!p.canSplit}
        title={!p.canSplit ? 'Выберите линейный или полигональный объект' : undefined}
        onClick={p.onToggleSplit}
      >
        ✂&nbsp;Разрезать
      </button>
    )}

    {p.canMerge && (
      <button type='button' className='ue-tb-btn' onClick={p.onMerge}>⇄&nbsp;Объединить</button>
    )}

    {p.canGeom && (
      <button type='button' className={cls('ue-tb-btn', p.geomChecked)} onClick={p.onGeomToggle}>
        {p.geomChecked ? '☑' : '☐'}&nbsp;Геометрия
      </button>
    )}

    <button type='button' className='ue-tb-btn ue-tb-btn--gear' onClick={p.onToggleSettings}>⚙</button>
  </div>
)

export default Toolbar
