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

  if (sel.length > 0) {
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
  }

console.log('[UE][state]', {
  sketchMode: ue.sketchMode,
  selLen: sel.length,
  oid: sel[0]?.oid,
  mergeMode: ue.mergeMode
})


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

        {!ue.mergeMode && sel.length === 1 && ue.canGeom && (
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
        {ue.sketchMode === 'creating' && (
          <div className='ue-form-host'>
            <div className='ue-form-title ue-form-title--sm'>Оцифровка объекта</div>
            <p className='ue-hint'>Кликайте для добавления вершин. Двойной клик — завершить.</p>
            <button
              type='button'
              className='ue-btn ue-btn--secondary'
              onClick={ue.onCancelSketch}
            >
              Отмена
            </button>
          </div>
        )}

        {ue.sketchMode === 'splitting' && (
          <div className='ue-form-host'>
            <div className='ue-form-title'>Разрезание объекта</div>
            <p className='ue-hint'>Нарисуйте линию разреза. Двойной клик — завершить.</p>
            <button
              type='button'
              className='ue-btn ue-btn--secondary'
              onClick={ue.onCancelSketch}
            >
              Отмена
            </button>
          </div>
        )}

        {ue.sketchMode === 'reshapeLine' && (
          <div className='ue-form-host'>
            <div className='ue-form-title'>Изменение формы</div>
            <p className='ue-hint'>Нарисуйте линию от контура к контуру. Линия внутри полигона вырезает часть, линия снаружи добавляет часть.</p>
            <button
              type='button'
              className='ue-btn ue-btn--secondary'
              onClick={ue.onCancelSketch}
            >
              Отмена
            </button>
          </div>
        )}

        {ue.sketchMode === 'reshaping' && sel.length === 0 && (
          <div className='ue-form-host'>
            <div className='ue-form-title'>Подготовка…</div>
          </div>
        )}

        {ue.sketchMode === 'reshaping' && sel.length === 1 && (
          <FeatureFormPanel
            key={singleKey}
            ue={ue}
            item={sel[0]}
            cfg={ue.cfg}
            onSaveNew={ue.onSaveNew}
            onCancelNew={ue.onCancelNew}
            onDeleted={ue.clearSelection}
            isNew
          />
        )}

        {ue.sketchMode === 'idle' && ue.mergeMode && sel.length >= 2 && (
          <MergePanel
            items={sel}
            onCancel={ue.onCancelMerge}
            onConfirm={ue.onConfirmMerge}
            onPreview={ue.onPreviewMergeItem}
          />
        )}

        {ue.sketchMode === 'idle' && !ue.mergeMode && sel.length === 0 && (
          <IdlePanel
            key={idleKey}
            templateLayers={ue.editableLayers}
            showAttrHint={ue.attrEditableLayers.length > 0}
            onSelectTemplate={ue.onStartCreate}
          />
        )}

        {!ue.mergeMode && sel.length === 1 && (ue.sketchMode === 'idle' || ue.sketchMode === 'updating') && (
          <FeatureFormPanel
            key={singleKey}
            ue={ue}
            item={sel[0]}
            cfg={ue.cfg}
            onDeleted={ue.clearSelection}
            onCancel={ue.onCancelEdit}
            onSaved={ue.clearSelection}
            onSaveExisting={ue.onSaveExisting}
            onRequestDelete={deleteAllowed ? () => setDeleteScope('single') : undefined}
            deleteConfirm={deleteAllowed && deleteScope === 'single'}
            onCancelDelete={() => setDeleteScope(null)}
            onConfirmDelete={() => {
              if (!deleteAllowed) return
              ue.onConfirmDelete('single')
              setDeleteScope(null)
            }}
          />
        )}

        {ue.sketchMode === 'idle' && !ue.mergeMode && sel.length >= 2 && (
          <BatchEditPanel
            key={multiKey}
            ue={ue}
            items={sel}
            cfg={ue.cfg}
            onDeleted={ue.clearSelection}
            onCancel={ue.onCancelEdit}
            onRequestDelete={deleteAllowed ? () => setDeleteScope('multi') : undefined}
            deleteConfirm={deleteAllowed && deleteScope === 'multi'}
            onCancelDelete={() => setDeleteScope(null)}
            onConfirmDelete={() => {
              if (!deleteAllowed) return
              ue.onConfirmDelete('multi')
              setDeleteScope(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

export default Widget
