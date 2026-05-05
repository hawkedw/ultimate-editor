// src/widgets/ultimate-editor/src/runtime/widget.tsx
import { React, type AllWidgetProps } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import type { IMConfig } from '../config'
import { rootCss } from './styles'
import { useUltimateEditor } from './editor/useUltimateEditor'
import IdlePanel from './components/IdlePanel'
import FeatureFormPanel from './components/FeatureFormPanel'
import BatchEditPanel from './components/BatchEditPanel'
import MergePanel from './components/MergePanel'
import { layerKey, resolveRuleEffective } from './utils/ueUtils'

const DBG = () => (window as any).__UE_DEBUG === true

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const ue = useUltimateEditor(props)
  const sel = ue.selectedItems

  const layersKey = ue.editableLayers.map((l: any) => l.id || l.title).join('|')
  const attrLayersKey = ue.attrEditableLayers.map((l: any) => l.id || l.title).join('|')
  const idleKey = `${layersKey}__${attrLayersKey}`

  const singleKey = sel.length === 1
    ? `${ue.sketchMode}:${layerKey(sel[0].layer)}:${sel[0].oid}:${ue.geomChecked ? 'geom' : 'attr'}`
    : 'none'

  const multiKey = sel.length >= 2
    ? `${ue.sketchMode}:${layerKey(sel[0].layer)}:${sel.map((s: any) => s.oid).join(',')}`
    : 'none'

  const [deleteScope, setDeleteScope] = React.useState<null | 'single' | 'multi'>(null)

  const deleteAllowed = sel.length > 0
    ? resolveRuleEffective(ue.cfg, sel[0].layer).allowDelete === true
    : false

  const stateLogKey = `${ue.sketchMode}:${sel.length}:${sel[0]?.oid ?? 'none'}:${ue.mergeMode ? 'merge' : 'normal'}`
  const ruleLogKey = sel.length > 0
    ? `${layerKey(sel[0].layer)}:${sel[0].oid ?? 'none'}:${ue.sketchMode}`
    : 'none'

  React.useEffect(() => {
    if (!DBG()) return
    console.log('[UE][state]', {
      sketchMode: ue.sketchMode,
      selLen: sel.length,
      oid: sel[0]?.oid,
      mergeMode: ue.mergeMode
    })
  }, [stateLogKey])

  React.useEffect(() => {
    if (!DBG() || sel.length === 0) return

    const layer = sel[0].layer as any
    const resolvedRule = resolveRuleEffective(ue.cfg, layer)
    const rawRule = (ue.cfg?.layers as any[])?.find(r =>
      r.id === resolvedRule.id ||
      r.url === layer.url ||
      r.title === layer.title
    )

    console.log('[UE][widget] rule-check', {
      layerId: layer.id,
      layerTitle: layer.title,
      layerUrl: layer.url,
      resolvedRule,
      resolvedRuleFields: (resolvedRule as any)?.fields,
      rawRule
    })
  }, [ruleLogKey])

  const isIdle = ue.sketchMode === 'idle'
  const isCreating = ue.sketchMode === 'creating'

  return (
    <div className='ue-widget jimu-widget' css={rootCss}>
      {ue.mapWidgetId && (
        <JimuMapViewComponent
          useMapWidgetId={ue.mapWidgetId}
          onActiveViewChange={(jmv: JimuMapView) => ue.onActiveViewChange(jmv)}
        />
      )}

      <div className='ue-tb'>
        <div className='ue-tb-info'>Выбрано: {sel.length}</div>

        <button
          type='button'
          className={'ue-tb-btn' + (ue.tool === 'add' ? ' ue-tb-btn--active' : '')}
          title='Добавить к выделению'
          onClick={ue.onToggleAdd}
          disabled={ue.mergeMode}
        >
          + Выбор
        </button>

        <button
          type='button'
          className={'ue-tb-btn' + (ue.tool === 'remove' ? ' ue-tb-btn--active' : '')}
          title='Убрать из выделения'
          onClick={ue.onToggleRemove}
          disabled={ue.mergeMode}
        >
          - Выбор
        </button>

        <button
          type='button'
          className='ue-tb-btn'
          title='Очистить выделение'
          onClick={ue.clearSelection}
          disabled={sel.length === 0 || ue.mergeMode}
        >
          Очистить
        </button>

        <button
          type='button'
          className='ue-tb-btn'
          title='Отменить последнее действие'
          onClick={ue.onUndo}
          disabled={!ue.canUndo || ue.mergeMode || ue.sketchMode !== 'idle'}
        >
          ↶
        </button>

        <button
          type='button'
          className='ue-tb-btn'
          title='Вернуть отменённое действие'
          onClick={ue.onRedo}
          disabled={!ue.canRedo || ue.mergeMode || ue.sketchMode !== 'idle'}
        >
          ↷
        </button>

        {!ue.mergeMode && ue.showSplitButton && (
          <>
            <button
              type='button'
              className={'ue-tb-btn' + (ue.tool === 'split' ? ' ue-tb-btn--active' : '')}
              title='Разрезать объект'
              disabled={!ue.canSplit}
              onClick={ue.onToggleSplit}
            >
              Разрезать
            </button>

            <button
              type='button'
              className={'ue-tb-btn' + (ue.tool === 'reshape' ? ' ue-tb-btn--active' : '')}
              title='Изменить форму объекта'
              disabled={!ue.canSplit}
              onClick={ue.onToggleReshape}
            >
              Изменить форму
            </button>
          </>
        )}

        {!ue.mergeMode && sel.length === 1 && ue.canGeom && ue.sketchMode !== 'reshaping' && (
          <label
            className={
              'ue-tb-btn ue-tb-checkbtn' +
              (ue.geomChecked ? ' ue-tb-btn--active ue-tb-checkbtn--active' : '')
            }
            title='Редактирование геометрии'
          >
            <input
              type='checkbox'
              checked={ue.geomChecked}
              onChange={ue.onGeomToggle}
            />
            <span className='ue-tb-checkbtn__box' aria-hidden='true'>
              {ue.geomChecked ? '✓' : ''}
            </span>
            <span className='ue-tb-checkbtn__text'>Геометрия</span>
          </label>
        )}

        {!ue.mergeMode && ue.canMerge && (
          <button
            type='button'
            className={'ue-tb-btn' + (ue.mergeMode ? ' ue-tb-btn--active' : '')}
            title='Объединить объекты'
            onClick={ue.onStartMerge}
          >
            Объединить
          </button>
        )}
      </div>

      <div className='ue-panel'>
        {(isIdle || isCreating) && sel.length === 0 && (
          <IdlePanel
            key={idleKey}
            templateLayers={ue.editableLayers}
            showAttrHint={isIdle && ue.attrEditableLayers.length > 0}
            onSelectTemplate={ue.onStartCreate}
          />
        )}

        {ue.sketchMode === 'reshaping' && sel.length === 1 && (
          <FeatureFormPanel
            key={singleKey}
            item={sel[0]}
            ue={ue}
            isNew
            onSaveNew={ue.onSaveNew}
            onCancelNew={ue.onCancelNew}
          />
        )}

        {!ue.mergeMode && sel.length === 1 && (isIdle || ue.sketchMode === 'updating') && (
          <FeatureFormPanel
            key={singleKey}
            item={sel[0]}
            ue={ue}
            onSaveExisting={ue.onSaveExisting}
            onCancel={ue.onCancelEdit}
            onRequestDelete={deleteAllowed ? () => setDeleteScope('single') : undefined}
          />
        )}

        {!ue.mergeMode && sel.length >= 2 && isIdle && (
          <BatchEditPanel
            key={multiKey}
            items={sel}
            ue={ue}
            onRequestDelete={deleteAllowed ? () => setDeleteScope('multi') : undefined}
          />
        )}

        {ue.mergeMode && (
          <MergePanel
            items={sel}
            ue={ue}
          />
        )}

        {deleteScope && (
          <div className='ue-delete-confirm'>
            <p>Удалить {deleteScope === 'multi' ? `${sel.length} объекта(-ов)` : 'объект'}?</p>
            <button type='button' className='ue-tb-btn ue-tb-btn--danger' onClick={() => { ue.onConfirmDelete(deleteScope); setDeleteScope(null) }}>Удалить</button>
            <button type='button' className='ue-tb-btn' onClick={() => setDeleteScope(null)}>Отмена</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Widget
