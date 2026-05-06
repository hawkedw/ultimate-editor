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
import Toolbar from './components/Toolbar'
import { dlog, isDebugEnabled } from './debug'
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

  React.useEffect(() => {
    setDeleteScope(null)
  }, [singleKey, multiKey])

  const deleteAllowed = sel.length > 0
    ? resolveRuleEffective(ue.cfg, sel[0].layer).allowDelete === true
    : false

  React.useEffect(() => {
    if (!isDebugEnabled()) return

    dlog('[UE][state]', {
      sketchMode: ue.sketchMode,
      selLen: sel.length,
      oid: sel[0]?.oid,
      mergeMode: ue.mergeMode
    })
  }, [ue.sketchMode, ue.mergeMode, sel.length, sel[0]?.oid])

  React.useEffect(() => {
    if (!isDebugEnabled() || sel.length === 0) return

    const layer = sel[0].layer as any
    const resolvedRule = resolveRuleEffective(ue.cfg, layer)
    const rawRule = (ue.cfg?.layers as unknown as any[])?.find(r =>
      r.id === resolvedRule.id ||
      r.url === layer.url ||
      r.title === layer.title
    )

    dlog('[UE][widget] rule-check', {
      layerId: layer.id,
      layerTitle: layer.title,
      layerUrl: layer.url,
      resolvedRule,
      resolvedRuleFields: (resolvedRule as any)?.fields,
      rawRule
    })
  }, [ue.cfg, sel])

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

      <Toolbar
        selCount={sel.length}
        tool={ue.tool}
        mergeMode={ue.mergeMode}
        showSplitButton={ue.showSplitButton}
        canSplit={ue.canSplit}
        canMerge={ue.canMerge}
        canGeom={ue.canGeom}
        geomChecked={ue.geomChecked}
        sketchMode={ue.sketchMode}
        canUndo={ue.canUndo}
        canRedo={ue.canRedo}
        onCancelSketch={ue.onCancelSketch}
        onToggleAdd={ue.onToggleAdd}
        onToggleRemove={ue.onToggleRemove}
        onToggleSplit={ue.onToggleSplit}
        onToggleReshape={ue.onToggleReshape}
        onUndo={ue.onUndo}
        onRedo={ue.onRedo}
        onGeomToggle={ue.onGeomToggle}
        onStartMerge={ue.onStartMerge}
        onClear={ue.clearSelection}
      />

      <div className='ue-panel'>
        {(isIdle || isCreating) && sel.length === 0 && (
          <IdlePanel
            key={idleKey}
            templateLayers={ue.editableLayers}
            showAttrHint={isIdle && ue.attrEditableLayers.length > 0}
            isCreating={isCreating}
            onCancelCreate={ue.onCancelSketch}
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
            deleteConfirm={deleteScope === 'single'}
            onCancelDelete={() => setDeleteScope(null)}
            onConfirmDelete={() => { ue.onConfirmDelete('single'); setDeleteScope(null) }}
          />
        )}

        {!ue.mergeMode && sel.length >= 2 && isIdle && (
          <BatchEditPanel
            key={multiKey}
            items={sel}
            cfg={ue.cfg}
            ue={ue}
            onSaved={ue.clearSelection}
            onCancel={ue.clearSelection}
            onRequestDelete={deleteAllowed ? () => setDeleteScope('multi') : undefined}
            deleteConfirm={deleteScope === 'multi'}
            onCancelDelete={() => setDeleteScope(null)}
            onConfirmDelete={() => { ue.onConfirmDelete('multi'); setDeleteScope(null) }}
          />
        )}

        {ue.mergeMode && (
          <MergePanel
            items={sel}
            onCancel={ue.onCancelMerge}
            onConfirm={ue.onConfirmMerge}
            onPreview={ue.onPreviewMergeItem}
          />
        )}

      </div>
    </div>
  )
}

export default Widget
