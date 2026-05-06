import { React } from 'jimu-core'
import type { Tool } from '../editor/useUltimateEditor'

interface Props {
  selCount: number
  tool: Tool
  mergeMode: boolean
  showSplitButton: boolean
  canSplit: boolean
  canMerge: boolean
  canGeom: boolean
  geomChecked: boolean
  sketchMode: string
  canUndo: boolean
  canRedo: boolean
  onToggleAdd: () => void
  onToggleRemove: () => void
  onToggleSplit: () => void
  onToggleReshape: () => void
  onUndo: () => void
  onRedo: () => void
  onGeomToggle: () => void
  onStartMerge: () => void
  onClear: () => void
}

const buttonClass = (active: boolean) => 'ue-tb-btn' + (active ? ' ue-tb-btn--active' : '')

const Toolbar = ({
  selCount,
  tool,
  mergeMode,
  showSplitButton,
  canSplit,
  canMerge,
  canGeom,
  geomChecked,
  sketchMode,
  canUndo,
  canRedo,
  onToggleAdd,
  onToggleRemove,
  onToggleSplit,
  onToggleReshape,
  onUndo,
  onRedo,
  onGeomToggle,
  onStartMerge,
  onClear
}: Props) => (
  <div className='ue-tb'>
    <div className='ue-tb-info'>Выбрано: {selCount}</div>

    <button
      type='button'
      className={buttonClass(tool === 'add')}
      title='Добавить к выделению'
      onClick={onToggleAdd}
      disabled={mergeMode || sketchMode === 'creating'}
    >
      + Выбор
    </button>

    <button
      type='button'
      className={buttonClass(tool === 'remove')}
      title='Убрать из выделения'
      onClick={onToggleRemove}
      disabled={mergeMode || sketchMode === 'creating'}
    >
      - Выбор
    </button>

    <button
      type='button'
      className='ue-tb-btn'
      title='Очистить выделение'
      onClick={onClear}
      disabled={selCount === 0 || mergeMode || sketchMode === 'creating'}
    >
      Очистить
    </button>

    <button
      type='button'
      className='ue-tb-btn'
      title='Отменить последнее действие'
      onClick={onUndo}
      disabled={!canUndo || mergeMode || sketchMode !== 'idle'}
    >
      ↶
    </button>

    <button
      type='button'
      className='ue-tb-btn'
      title='Вернуть отменённое действие'
      onClick={onRedo}
      disabled={!canRedo || mergeMode || sketchMode !== 'idle'}
    >
      ↷
    </button>

    {!mergeMode && selCount === 1 && canGeom && sketchMode !== 'reshaping' && (
      <label
        className={
          'ue-tb-btn ue-tb-checkbtn' +
          (geomChecked ? ' ue-tb-btn--active ue-tb-checkbtn--active' : '')
        }
        title='Редактирование геометрии'
      >
        <input
          type='checkbox'
          checked={geomChecked}
          onChange={onGeomToggle}
        />
        <span className='ue-tb-checkbtn__box' aria-hidden='true'>
          {geomChecked ? '✓' : ''}
        </span>
        <span className='ue-tb-checkbtn__text'>Геометрия</span>
      </label>
    )}

    {!mergeMode && sketchMode !== 'creating' && showSplitButton && (
      <>
        <button
          type='button'
          className={buttonClass(tool === 'split')}
          title='Разрезать объект'
          disabled={!canSplit}
          onClick={onToggleSplit}
        >
          Разрезать
        </button>

        <button
          type='button'
          className={buttonClass(tool === 'reshape')}
          title='Изменить форму объекта'
          disabled={!canSplit}
          onClick={onToggleReshape}
        >
          Изменить форму
        </button>
      </>
    )}

    {!mergeMode && canMerge && (
      <button
        type='button'
        className={buttonClass(mergeMode)}
        title='Объединить объекты'
        onClick={onStartMerge}
      >
        Объединить
      </button>
    )}
  </div>
)

export default Toolbar
