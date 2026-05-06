// src/widgets/ultimate-editor/src/runtime/editor/useUltimateEditor.ts
import { React, type AllWidgetProps } from 'jimu-core'
import type { JimuMapView } from 'jimu-arcgis'
import type { IMConfig, FieldSetting } from '../../config'

import type FeatureLayer from 'esri/layers/FeatureLayer'
import GraphicsLayer from 'esri/layers/GraphicsLayer'
import Graphic from 'esri/Graphic'
import Extent from 'esri/geometry/Extent'
import * as geometryEngine from 'esri/geometry/geometryEngine'

import { useSelection } from './useSelection'
import { useGeometry } from './useGeometry'
import { dlog, isDebugEnabled } from '../debug'
import {
  captureAndDisablePopups,
  disablePopupsForNewLayers,
  restorePopups,
  type PopupViewState
} from './popupManager'
import { fetchFullGraphic, replaceFeatureSet } from './featureEdits'
import { makeHistoryEntry } from './history'

import {
  isFeatureLayer,
  resolveRuleEffective,
  applyDefaultValues,
  applyArcadeDefaults,
  layerKey
} from '../utils/ueUtils'

export type Tool = 'none' | 'add' | 'remove' | 'split' | 'reshape'

export interface FieldPolicy {
  hidden: Set<string>
  readonly: Set<string>
  labels: Map<string, string>
  order: string[]
}

function toPlainFields (raw: any): FieldSetting[] {
  if (!raw) return []
  if (typeof raw.asMutable === 'function') return raw.asMutable({ deep: true }) as FieldSetting[]
  if (Array.isArray(raw)) return raw as FieldSetting[]
  return []
}

const MAX_HISTORY = 10

function setMapCursor (view: any, cursor: string) {
  try {
    if (view?.container) view.container.style.cursor = cursor
  } catch {}
}

function getOid (layer: any, g: any): number | null {
  const oidField = layer?.objectIdField
  const v = oidField ? g?.attributes?.[oidField] : null
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN)
  return Number.isFinite(n) ? n : null
}

function collectFeatureLayersFromMap (v: any, topFirst = false): any[] {
  const ordered: any[] = []
  const seen = new Set<any>()

  const visit = (layer: any) => {
    if (!layer || seen.has(layer)) return
    seen.add(layer)
    if (isFeatureLayer(layer) && !layer.isTable) ordered.push(layer)

    const children = layer?.layers?.toArray?.() || layer?.sublayers?.toArray?.() || []
    for (const child of children) visit(child)
  }

  const roots = v?.map?.layers?.toArray?.() || []
  const rootOrder = topFirst ? [...roots].reverse() : roots
  for (const layer of rootOrder) visit(layer)

  const all = v?.map?.allLayers?.toArray?.() || []
  const fallbackOrder = topFirst ? [...all].reverse() : all
  for (const layer of fallbackOrder) visit(layer)

  return ordered
}

function boxSymbol () {
  return {
    type: 'simple-fill',
    style: 'none',
    color: [0, 0, 0, 0],
    outline: {
      color: [230, 230, 230, 0.95],
      width: 1.25,
      style: 'dash'
    }
  } as any
}

function mergePreviewSymbol () {
  return {
    type: 'simple-fill',
    style: 'solid',
    color: [255, 196, 0, 0.12],
    outline: {
      color: [255, 196, 0, 1],
      width: 2.5,
      style: 'solid'
    }
  } as any
}

export function useUltimateEditor (props: AllWidgetProps<IMConfig>) {
  const cfg = props.config
  const cfgRef = React.useRef(cfg)
  React.useEffect(() => { cfgRef.current = cfg }, [cfg])

  const mapWidgetId = props.useMapWidgetIds?.[0]

  const [tool, setTool] = React.useState<Tool>('none')
  const toolRef = React.useRef<Tool>('none')
  React.useEffect(() => { toolRef.current = tool }, [tool])

  const [mergeMode, setMergeMode] = React.useState(false)

  const selection = useSelection(toolRef as any, { cfgRef })
  const geometry = useGeometry()

  const [view, setView] = React.useState<__esri.MapView | __esri.SceneView | null>(null)

  const [geomChecked, setGeomChecked] = React.useState(false)
  const [editableLayers, setEditableLayers] = React.useState<FeatureLayer[]>([])
  const [attrEditableLayers, setAttrEditableLayers] = React.useState<FeatureLayer[]>([])
  const [showSplitButton, setShowSplitButton] = React.useState(false)
  const [undoStack, setUndoStack] = React.useState<any[]>([])
  const [redoStack, setRedoStack] = React.useState<any[]>([])
  const [historyBusy, setHistoryBusy] = React.useState(false)
  const historyBusyRef = React.useRef(false)

  const selCleanupRef = React.useRef<(() => void) | null>(null)
  const geomCleanupRef = React.useRef<(() => void) | null>(null)
  const miscCleanupRef = React.useRef<(() => void) | null>(null)

  const viewRef = React.useRef<any>(null)

  const boxLayerRef = React.useRef<__esri.GraphicsLayer | null>(null)
  const boxGraphicRef = React.useRef<__esri.Graphic | null>(null)
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const isBoxDraggingRef = React.useRef(false)

  const mergePreviewLayerRef = React.useRef<__esri.GraphicsLayer | null>(null)
  const mergePreviewGraphicRef = React.useRef<__esri.Graphic | null>(null)
  const popupStateRef = React.useRef<PopupViewState | null>(null)

  const sel = selection.selectedItems || []

  const selectedLayer = sel.length > 0 ? sel[0].layer : null
  const sameLayerSelected = sel.length > 0 && sel.every((s) => layerKey(s.layer) === layerKey(sel[0].layer))
  const layerRule = selectedLayer ? resolveRuleEffective(cfgRef.current, selectedLayer) : null

  function ensureMergePreviewLayer (v: any) {
    if (mergePreviewLayerRef.current) return
    const gl = new GraphicsLayer({ listMode: 'hide' } as any)
    v.map.add(gl)
    mergePreviewLayerRef.current = gl
  }

  function clearMergePreview () {
    try { mergePreviewLayerRef.current?.removeAll?.() } catch {}
    mergePreviewGraphicRef.current = null
  }

  async function previewMergeItem (oid: number | null) {
    clearMergePreview()
    if (oid == null) return
    if (!viewRef.current || !sameLayerSelected || !selectedLayer) return
    const item = sel.find((s) => s.oid === oid)
    const geom = item?.graphic?.geometry
    if (!geom) return
    ensureMergePreviewLayer(viewRef.current)
    const gg = new Graphic({ geometry: geom, symbol: mergePreviewSymbol() } as any)
    mergePreviewGraphicRef.current = gg as any
    mergePreviewLayerRef.current?.add(gg as any)
    dlog('[UE] merge preview graphic oid=', oid)
  }

  function getTopSplittableLayer (v: any): FeatureLayer | null {
    const all = collectFeatureLayersFromMap(v, true)
    for (const l of all) {
      if (!isFeatureLayer(l) || !l.visible) continue
      const r = resolveRuleEffective(cfgRef.current, l)
      if (r.allowGeomUpdate === true && (l as any).geometryType === 'polygon') return l as FeatureLayer
    }
    return null
  }

  const activeSplitLayer = getTopSplittableLayer(viewRef.current)
  const canSplit = !!activeSplitLayer
  const canReshape = !!layerRule?.allowGeomUpdate && sel.length === 1 && sameLayerSelected && (selectedLayer as any)?.geometryType === 'polygon'
  const canMerge = !!layerRule?.allowGeomUpdate && sel.length >= 2 && sameLayerSelected && (selectedLayer as any)?.geometryType === 'polygon'
  const canGeom = !!layerRule?.allowGeomUpdate && sel.length === 1 && sameLayerSelected
  const canUndo = !historyBusy && undoStack.length > 0
  const canRedo = !historyBusy && redoStack.length > 0

  React.useEffect(() => {
    if (!canMerge && mergeMode) { setMergeMode(false); clearMergePreview() }
  }, [canMerge, mergeMode])

  React.useEffect(() => { if (!mergeMode) clearMergePreview() }, [mergeMode])
  React.useEffect(() => { if (!mergeMode) return; clearMergePreview() }, [sel, mergeMode])

  React.useEffect(() => {
    if (sel.length === 1 && canGeom) return
    if (geomChecked) setGeomChecked(false)
    if (geometry.sketchModeRef.current === 'updating') geometry.cancel()
  }, [sel.length, canGeom, geomChecked, geometry])

  // NOTE: 'reshaping' is exclusive to the create-new-object flow and is unrelated
  // to geomChecked. Including it here caused a feedback loop with the effect above
  // when canGeom=false: A sets geomChecked=true, B resets to false, repeat → form flicker.
  React.useEffect(() => {
    const activeGeomEdit = geometry.sketchMode === 'updating'
    if (activeGeomEdit && !geomChecked) setGeomChecked(true)
    if (!activeGeomEdit && geomChecked && geometry.sketchMode === 'idle' && sel.length !== 1) setGeomChecked(false)
  }, [geometry.sketchMode, geomChecked, sel.length])

  function refreshEditableLayers (v: any) {
    const all = collectFeatureLayersFromMap(v).filter((l: any) => isFeatureLayer(l) && l.visible)
    const creatable = all.filter((l: any) => resolveRuleEffective(cfgRef.current, l).allowCreate === true) as FeatureLayer[]
    const attrEditable = all.filter((l: any) => resolveRuleEffective(cfgRef.current, l).allowAttrUpdate === true) as FeatureLayer[]
    setEditableLayers(creatable)
    setAttrEditableLayers(attrEditable)
    setShowSplitButton(all.some((l: any) => resolveRuleEffective(cfgRef.current, l).allowGeomUpdate === true && (l as any).geometryType === 'polygon'))
    if (isDebugEnabled()) {
      dlog('[UE] creatableLayers:', creatable.map((l: any) => ({ title: l.title, id: l.id, templates: l.templates?.length })))
      dlog('[UE] attrEditableLayers:', attrEditable.map((l: any) => ({ title: l.title, id: l.id })))
    }
  }

  function isSelectableLayer (l: any): boolean {
    if (!isFeatureLayer(l) || !l.visible) return false
    return resolveRuleEffective(cfgRef.current, l).allowAttrUpdate === true
  }

  function getTopSelectableLayer (v: any): FeatureLayer | null {
    const all = collectFeatureLayersFromMap(v, true)
    for (const l of all) {
      if (isSelectableLayer(l)) return l as FeatureLayer
    }
    return null
  }

  function getSelectableLayers (v: any): FeatureLayer[] {
    return collectFeatureLayersFromMap(v, true).filter((l: any) => isSelectableLayer(l)) as FeatureLayer[]
  }

  async function applyBoxSelect (extent: __esri.Extent) {
    const v = viewRef.current
    if (!v) return
    const fixedLayer = sel.length ? (sel[0].layer as any) : null
    const targetLayers = fixedLayer && isSelectableLayer(fixedLayer)
      ? [fixedLayer as FeatureLayer]
      : getSelectableLayers(v)
    if (!targetLayers.length) return

    for (const targetLayer of targetLayers) {
      try {
        await targetLayer.load?.()
        const lv = await v.whenLayerView(targetLayer)
        const q = targetLayer.createQuery()
        q.geometry = extent
        q.spatialRelationship = 'intersects'
        q.returnGeometry = true
        q.outFields = ['*']
        ;(q as any).returnDomainNames = false
        const fs = await lv.queryFeatures(q)
        const feats = fs?.features || []
        dlog('[UE][box-select]', {
          layer: (targetLayer as any).title || (targetLayer as any).id,
          count: feats.length
        })
        if (!feats.length) continue
        const mode = toolRef.current === 'remove' ? 'remove' : 'add'
        for (const g of feats) await selection.selectGraphic(g, mode as any)
        break
      } catch (e) {
        console.warn('[UE] box-select query error', e)
      }
    }
  }

  function ensureBoxLayer (v: any) {
    if (boxLayerRef.current) return
    const gl = new GraphicsLayer({ listMode: 'hide' } as any)
    v.map.add(gl)
    boxLayerRef.current = gl
  }

  function clearBoxGraphic () {
    try { boxLayerRef.current?.removeAll() } catch {}
    boxGraphicRef.current = null
  }

  const onActiveViewChange = React.useCallback((jmv: JimuMapView) => {
    const prevView = viewRef.current as any
    selCleanupRef.current?.()
    geomCleanupRef.current?.()
    miscCleanupRef.current?.()
    restorePopups(prevView, popupStateRef.current)
    popupStateRef.current = null

    const v = jmv?.view as any
    viewRef.current = v
    setView(v ?? null)
    if (!v) return

    popupStateRef.current = captureAndDisablePopups(v)
    const hPopup = v.map?.allLayers?.on?.('change', () => disablePopupsForNewLayers(v, popupStateRef))

    refreshEditableLayers(v)

    const visHandles: __esri.Handle[] = []
    const attachVisibleWatches = () => {
      while (visHandles.length) { try { visHandles.pop().remove() } catch {} }
      const all = v?.map?.allLayers?.toArray?.() || []
      for (const l of all) {
        if (!isFeatureLayer(l)) continue
        try { const h = l.watch('visible', () => refreshEditableLayers(v)); visHandles.push(h) } catch {}
      }
    }

    attachVisibleWatches()
    const hLayers = v.map?.allLayers?.on?.('change', () => { attachVisibleWatches(); refreshEditableLayers(v) })

    ;(async () => {
      const layers = (v?.map?.allLayers?.toArray?.() || []).filter((l: any) => isFeatureLayer(l))
      for (const l of layers) { try { l.outFields = ['*'] } catch {} }
      await Promise.allSettled(layers.map((l: any) => l.load?.()))
    })()

    const hClick = v.on('immediate-click', async (ev: any) => {
      if (
        geometry.sketchModeRef.current === 'creating' ||
        geometry.sketchModeRef.current === 'splitting' ||
        geometry.sketchModeRef.current === 'reshapeLine' ||
        geometry.sketchModeRef.current === 'reshaping' ||
        geometry.sketchModeRef.current === 'updating'
      ) return
      if (isBoxDraggingRef.current) return
      if (mergeMode) return
      try { v.popup?.close?.() } catch {}

      const t = toolRef.current
      const fixedKey = sel.length ? layerKey(sel[0].layer) : null

      const ht = await v.hitTest(ev)
      const results = ((ht?.results || []) as any[])

      let pickedRaw: any = null
      for (const r of results) {
        const g = r?.graphic
        if (!isFeatureLayer(g?.layer)) continue
        const eff = resolveRuleEffective(cfgRef.current, g.layer)
        if (eff.allowAttrUpdate !== true) continue
        if (fixedKey && layerKey(g.layer) !== fixedKey) continue
        pickedRaw = g
        break
      }

      if (!pickedRaw) {
        if (geomChecked) {
          geometry.cancel()
          selection.clearSelection()
          clearMergePreview()
          setMergeMode(false)
          setTool('none')
          setGeomChecked(false)
          setMapCursor(viewRef.current, 'default')
          try { refreshEditableLayers(v) } catch {}
          return
        }
        if (t === 'none') selection.clearSelection()
        try { refreshEditableLayers(v) } catch {}
        return
      }

      const mode: any = t === 'remove' ? 'remove' : t === 'add' ? 'add' : 'replace'
      const oid = getOid(pickedRaw.layer, pickedRaw)

      if (mode === 'replace') {
        try {
          let g = pickedRaw
          if (oid != null) { const full = await fetchFullGraphic(pickedRaw.layer, oid); if (full) g = full }
          await selection.selectGraphic(g, 'replace')
        } catch (e) {
          console.warn('[UE] click full fetch failed', e)
          await selection.selectGraphic(pickedRaw, 'replace')
        } finally { try { refreshEditableLayers(v) } catch {} }
        return
      }

      try {
        let g = pickedRaw
        if (oid != null) { const full = await fetchFullGraphic(pickedRaw.layer, oid); if (full) g = full }
        await selection.selectGraphic(g, mode)
      } catch (e) {
        console.warn('[UE] click full fetch failed', e)
        await selection.selectGraphic(pickedRaw, mode)
      } finally { try { refreshEditableLayers(v) } catch {} }
    })

    const hDrag = v.on('drag', async (e: any) => {
      if (geometry.sketchModeRef.current !== 'idle') return
      if (mergeMode) return
      const t = toolRef.current
      if (t !== 'add' && t !== 'remove') return

      if (e.action === 'start') {
        isBoxDraggingRef.current = true
        dragStartRef.current = { x: e.x, y: e.y }
        ensureBoxLayer(v)
        clearBoxGraphic()
        e.stopPropagation()
        return
      }

      if (e.action === 'update') {
        if (!dragStartRef.current) return
        e.stopPropagation()
        const p1 = v.toMap(dragStartRef.current)
        const p2 = v.toMap({ x: e.x, y: e.y })
        if (!p1 || !p2) return
        const ext = new Extent({ xmin: Math.min(p1.x, p2.x), ymin: Math.min(p1.y, p2.y), xmax: Math.max(p1.x, p2.x), ymax: Math.max(p1.y, p2.y), spatialReference: v.spatialReference })
        if (!boxGraphicRef.current) {
          const gg = new Graphic({ geometry: ext, symbol: boxSymbol() } as any)
          boxGraphicRef.current = gg as any
          boxLayerRef.current?.add(gg as any)
        } else {
          ;(boxGraphicRef.current as any).geometry = ext
          ;(boxGraphicRef.current as any).symbol = boxSymbol()
        }
        return
      }

      if (e.action === 'end') {
        e.stopPropagation()
        const start = dragStartRef.current
        dragStartRef.current = null
        const moved = start ? (Math.abs(e.x - start.x) + Math.abs(e.y - start.y)) : 0
        const ext = boxGraphicRef.current?.geometry as any
        clearBoxGraphic()
        isBoxDraggingRef.current = false
        if (!ext || moved < 6) return
        await applyBoxSelect(ext)
      }
    })

    selCleanupRef.current = selection.setupOnView(v)
    geomCleanupRef.current = geometry.setupOnView(v as any)

    miscCleanupRef.current = () => {
      clearMergePreview()
      try { hClick.remove() } catch {}
      try { hDrag.remove() } catch {}
      try { hPopup?.remove?.() } catch {}
      try { hLayers?.remove?.() } catch {}
      while (visHandles.length) { try { visHandles.pop().remove() } catch {} }
      try { if (boxLayerRef.current) v.map.remove(boxLayerRef.current) } catch {}
      try { boxLayerRef.current?.destroy?.() } catch {}
      boxLayerRef.current = null
      boxGraphicRef.current = null
      try { if (mergePreviewLayerRef.current) v.map.remove(mergePreviewLayerRef.current) } catch {}
      try { mergePreviewLayerRef.current?.destroy?.() } catch {}
      mergePreviewLayerRef.current = null
      mergePreviewGraphicRef.current = null
      dragStartRef.current = null
      isBoxDraggingRef.current = false
      setMapCursor(v, 'default')
      viewRef.current = null
      setView(null)
    }
  }, [selection, geometry, sel.length, mergeMode, geomChecked])

  React.useEffect(() => {
    const state = String((props as any)?.state ?? '')
    const isActive = state === '' || state === 'OPENED' || state === 'ACTIVE'
    const v = viewRef.current as any
    if (isActive) {
      if (v && !popupStateRef.current) { popupStateRef.current = captureAndDisablePopups(v) }
      else if (v && popupStateRef.current) { disablePopupsForNewLayers(v, popupStateRef); try { v.popup?.close?.() } catch {} }
      return
    }
    if (geometry.sketchModeRef.current !== 'idle') {
      try { geometry.cancel() } catch {}
    }
    if (sel.length > 0) {
      try { selection.clearSelection() } catch {}
    }
    clearMergePreview()
    if (mergeMode) setMergeMode(false)
    if (toolRef.current !== 'none') setTool('none')
    if (geomChecked) setGeomChecked(false)
    setMapCursor(viewRef.current, 'default')
    restorePopups(v, popupStateRef.current)
    popupStateRef.current = null
  }, [(props as any)?.state, sel.length, mergeMode, geomChecked, geometry.cancel, geometry.sketchModeRef, selection.clearSelection])

  React.useEffect(() => {
    return () => {
      clearMergePreview()
      selCleanupRef.current?.()
      geomCleanupRef.current?.()
      miscCleanupRef.current?.()
      restorePopups(viewRef.current as any, popupStateRef.current)
      popupStateRef.current = null
    }
  }, [])

  const pushHistory = React.useCallback((entry: any) => {
    if (!entry || (!entry.before?.length && !entry.after?.length)) return
    setUndoStack((prev) => [...prev, entry].slice(-MAX_HISTORY))
    setRedoStack([])
  }, [])

  const applyHistoryEntry = React.useCallback(async (entry: any, direction: 'undo' | 'redo') => {
    if (!entry?.layer) return
    const nextGraphics = await replaceFeatureSet(
      entry.layer,
      direction === 'undo' ? (entry.currentAfter || []) : (entry.currentBefore || []),
      direction === 'undo' ? (entry.before || []) : (entry.after || [])
    )
    if (direction === 'undo') entry.currentBefore = nextGraphics
    else entry.currentAfter = nextGraphics
  }, [])

  const resetUiState = React.useCallback(() => {
    geometry.cancel()
    selection.clearSelection()
    clearMergePreview()
    setMergeMode(false)
    setTool('none')
    setGeomChecked(false)
    setMapCursor(viewRef.current, 'default')
  }, [geometry, selection])

  const onUndo = React.useCallback(async () => {
    if (historyBusyRef.current) return
    const entry = undoStack[undoStack.length - 1]
    if (!entry) return
    historyBusyRef.current = true
    setHistoryBusy(true)
    resetUiState()
    try {
      await applyHistoryEntry(entry, 'undo')
      setUndoStack((prev) => prev.slice(0, -1))
      setRedoStack((prev) => [...prev, entry].slice(-MAX_HISTORY))
    } catch (e) { console.error('[UE] undo error', e) } finally {
      historyBusyRef.current = false
      setHistoryBusy(false)
    }
  }, [undoStack, applyHistoryEntry, resetUiState])

  const onRedo = React.useCallback(async () => {
    if (historyBusyRef.current) return
    const entry = redoStack[redoStack.length - 1]
    if (!entry) return
    historyBusyRef.current = true
    setHistoryBusy(true)
    resetUiState()
    try {
      await applyHistoryEntry(entry, 'redo')
      setRedoStack((prev) => prev.slice(0, -1))
      setUndoStack((prev) => [...prev, entry].slice(-MAX_HISTORY))
    } catch (e) { console.error('[UE] redo error', e) } finally {
      historyBusyRef.current = false
      setHistoryBusy(false)
    }
  }, [redoStack, applyHistoryEntry, resetUiState])

  const onToggleAdd = React.useCallback(() => {
    if (geometry.sketchModeRef.current === 'updating') geometry.cancel()
    setGeomChecked(false); setMergeMode(false)
    setTool(prev => { const next = prev === 'add' ? 'none' : 'add'; setMapCursor(viewRef.current, next === 'none' ? 'default' : 'crosshair'); return next })
  }, [geometry])

  const onToggleRemove = React.useCallback(() => {
    if (geometry.sketchModeRef.current === 'updating') geometry.cancel()
    setGeomChecked(false); setMergeMode(false)
    setTool(prev => { const next = prev === 'remove' ? 'none' : 'remove'; setMapCursor(viewRef.current, next === 'none' ? 'default' : 'crosshair'); return next })
  }, [geometry])

  const startReshapeSession = React.useCallback((itemOrLayer: any) => {
    if (!itemOrLayer?.layer) return
    setGeomChecked(false); setMergeMode(false); clearMergePreview(); setTool('reshape'); setMapCursor(viewRef.current, 'default')
    geometry.startReshapeByLine(itemOrLayer as any, async (result: any) => {
      const beforeGs = result?.before || []
      const afterGs = result?.after || []
      if (beforeGs.length && afterGs.length) pushHistory(makeHistoryEntry(itemOrLayer.layer, beforeGs, afterGs, 'reshape'))
      selection.clearSelection(); clearMergePreview(); setMergeMode(false); setTool('none'); setGeomChecked(false); setMapCursor(viewRef.current, 'default')
    })
  }, [geometry, selection])

  const onToggleReshape = React.useCallback(() => {
    setGeomChecked(false); setMergeMode(false); clearMergePreview()
    if (tool === 'reshape') { geometry.cancel(); selection.clearSelection(); setTool('none'); setMapCursor(viewRef.current, 'default'); return }
    const reshapeLayer = getTopSplittableLayer(viewRef.current)
    if (!reshapeLayer) return
    const reshapeTarget = sel.length === 1 && sameLayerSelected && layerKey(sel[0].layer) === layerKey(reshapeLayer) ? sel[0] : { layer: reshapeLayer }
    startReshapeSession(reshapeTarget)
  }, [tool, geometry, selection, sel, sameLayerSelected, startReshapeSession])

  const onToggleSplit = React.useCallback(() => {
    setGeomChecked(false); setMergeMode(false); clearMergePreview()
    if (tool === 'split') { geometry.cancel(); setTool('none'); setMapCursor(viewRef.current, 'default'); return }
    const splitLayer = getTopSplittableLayer(viewRef.current)
    if (!splitLayer) return
    setTool('split'); setMapCursor(viewRef.current, 'default')
    const splitTarget = sel.length === 1 && sameLayerSelected && layerKey(sel[0].layer) === layerKey(splitLayer) ? sel[0] : { layer: splitLayer }
    geometry.startSplit(splitTarget as any, async (result: any) => {
      const beforeGs = result?.before || []
      const afterGs = result?.after || []
      if (beforeGs.length && afterGs.length) pushHistory(makeHistoryEntry(splitLayer, beforeGs, afterGs, 'split'))
      selection.clearSelection(); setTool('none')
    })
  }, [tool, geometry, selection, sel, sameLayerSelected])

  const onStartMerge = React.useCallback(() => {
    if (!canMerge) return
    if (geometry.sketchModeRef.current === 'updating') geometry.cancel()
    setGeomChecked(false); setTool('none'); setMapCursor(viewRef.current, 'default'); setMergeMode(true)
  }, [canMerge, geometry])

  const onCancelMerge = React.useCallback(() => { clearMergePreview(); setMergeMode(false) }, [])

  const onPreviewMergeItem = React.useCallback(async (oid: number | null) => {
    await previewMergeItem(oid)
  }, [sel, sameLayerSelected, selectedLayer])

  const onConfirmMerge = React.useCallback(async (masterOid: number) => {
    if (!canMerge || !sameLayerSelected || !selectedLayer) return
    const layer = selectedLayer as any
    const master = sel.find((s) => s.oid === masterOid)
    if (!master) return
    const geoms = sel.map((s) => s.graphic?.geometry).filter(Boolean)
    if (geoms.length < 2) return
    let mergedGeometry: any = null
    try { mergedGeometry = geometryEngine.union(geoms as any) } catch (e) { console.error('[UE] merge union error', e); return }
    if (!mergedGeometry) return
    try {
      const res = await layer.applyEdits({
        deleteFeatures: sel.map((s) => s.graphic),
        addFeatures: [{ geometry: mergedGeometry, attributes: { ...(master.graphic?.attributes || {}) } }]
      } as any)
      const newOid = res?.addFeatureResults?.[0]?.objectId
      clearMergePreview()
      if (newOid == null) { setMergeMode(false); selection.clearSelection(); return }
      const q = layer.createQuery()
      q.objectIds = [newOid]; q.outFields = ['*']; q.returnGeometry = true
      const fs = await layer.queryFeatures(q)
      const mergedGraphic = fs?.features?.[0]
      selection.clearSelection()
      if (mergedGraphic) await selection.selectGraphic(mergedGraphic, 'replace' as any)
      setMergeMode(false)
    } catch (e) { console.error('[UE] merge applyEdits error', e) }
  }, [canMerge, sameLayerSelected, selectedLayer, sel, selection])

  const onGeomToggle = React.useCallback(() => {
    if (!canGeom || sel.length !== 1) return
    if (geomChecked) { if (geometry.sketchModeRef.current === 'updating') geometry.cancel(); setGeomChecked(false); return }
    setTool('none'); setMergeMode(false); clearMergePreview(); setMapCursor(viewRef.current, 'default'); setGeomChecked(true)
    geometry.startGeometryEdit(sel[0] as any)
  }, [canGeom, sel, geomChecked, geometry])

  const onStartCreate = React.useCallback((layer: FeatureLayer, template: any) => {
    setMergeMode(false); setGeomChecked(false); setTool('none'); clearMergePreview(); setMapCursor(viewRef.current, 'crosshair')
    const rule = resolveRuleEffective(cfgRef.current, layer)
    const staticAttrs = applyDefaultValues(rule)
    geometry.startCreate(layer, template, staticAttrs, async (g) => {
      const arcadeAttrs = await applyArcadeDefaults(rule, layer, g)
      if (Object.keys(arcadeAttrs).length > 0) {
        try {
          await layer.applyEdits({ updateFeatures: [{ geometry: (g as any).geometry, attributes: { ...(g as any).attributes, ...arcadeAttrs } } as any] } as any)
          ;(g as any).attributes = { ...(g as any).attributes, ...arcadeAttrs }
        } catch {}
      }
      await selection.selectGraphic(g, 'replace' as any)
    })
  }, [geometry, selection])

  const onSaveNew = React.useCallback(async (draftAttrs: Record<string, any>) => {
    const item = sel[0]
    const layer = item?.layer as any
    const createdGraphic = await geometry.confirmCreate(draftAttrs)
    if (layer && createdGraphic) pushHistory(makeHistoryEntry(layer, [], [createdGraphic], 'create'))
    selection.clearSelection(); clearMergePreview(); setMergeMode(false); setTool('none'); setGeomChecked(false); setMapCursor(viewRef.current, 'default')
  }, [geometry, selection, sel, pushHistory])

  const onCancelNew = React.useCallback(async () => {
    await geometry.cancelCreate()
    selection.clearSelection(); clearMergePreview(); setMergeMode(false); setTool('none'); setGeomChecked(false); setMapCursor(viewRef.current, 'default')
  }, [geometry, selection])

  const onSaveExisting = React.useCallback(async (draftAttrs: Record<string, any>) => {
    const item = sel[0]
    if (!item) return
    const layer = item.layer as any
    const oidField = layer.objectIdField || 'OBJECTID'
    const beforeGraphic = item.graphic?.clone ? item.graphic.clone() : item.graphic
    let afterGraphic: any = null
    const isGeomEdit = geomChecked || geometry.sketchModeRef.current === 'updating'
    if (isGeomEdit) {
      afterGraphic = await geometry.commitUpdate(draftAttrs)
    } else {
      try {
        await layer.applyEdits({ updateFeatures: [{ attributes: { ...(item.graphic?.attributes || {}), ...draftAttrs, [oidField]: item.oid } }] } as any)
        afterGraphic = await fetchFullGraphic(layer, item.oid)
      } catch (e) { console.error('[UE] attr save error', e); return }
    }
    if (beforeGraphic && afterGraphic) pushHistory(makeHistoryEntry(layer, [beforeGraphic], [afterGraphic], isGeomEdit ? 'geometry-update' : 'attr-update'))
    selection.clearSelection(); clearMergePreview(); setMergeMode(false); setTool('none'); setGeomChecked(false); setMapCursor(viewRef.current, 'default')
  }, [sel, geomChecked, geometry, selection, pushHistory])

  const onCancelEdit = React.useCallback(() => {
    geometry.cancel(); selection.clearSelection(); clearMergePreview(); setMergeMode(false); setTool('none'); setGeomChecked(false); setMapCursor(viewRef.current, 'default')
  }, [geometry, selection])

  const onCancelSketch = React.useCallback(() => {
    const isReshape = tool === 'reshape' || geometry.sketchModeRef.current === 'reshapeLine'
    geometry.cancel()
    if (isReshape) selection.clearSelection()
    clearMergePreview(); setMergeMode(false); setTool('none'); setGeomChecked(false); setMapCursor(viewRef.current, 'default')
  }, [geometry, selection, tool])

  const clearSelection = React.useCallback(() => {
    geometry.cancel(); selection.clearSelection(); clearMergePreview(); setMergeMode(false); setTool('none'); setGeomChecked(false); setMapCursor(viewRef.current, 'default')
  }, [geometry, selection])

  const onConfirmDelete = React.useCallback(async (scope: 'single' | 'multi') => {
    const items = sel
    if (!items.length) return
    const layer = items[0].layer as any
    const rule = resolveRuleEffective(cfgRef.current, layer)
    if (rule.allowDelete === false) return
    const beforeGraphics = (scope === 'single' ? [items[0].graphic] : items.map(it => it.graphic)).filter(Boolean)
    try {
      await layer.applyEdits({ deleteFeatures: beforeGraphics } as any)
      if (beforeGraphics.length) pushHistory(makeHistoryEntry(layer, beforeGraphics, [], 'delete'))
    } catch (e) { console.error('[UE] delete applyEdits error', e) }
    geometry.cancel(); selection.clearSelection(); clearMergePreview(); setMergeMode(false); setTool('none'); setGeomChecked(false); setMapCursor(viewRef.current, 'default')
  }, [sel, selection, geometry, pushHistory])

  const getFieldPolicy = React.useCallback((layer: FeatureLayer | any): FieldPolicy => {
    if (!layer) {
      return { hidden: new Set<string>(), readonly: new Set<string>(), labels: new Map<string, string>(), order: [] }
    }

    const rule = resolveRuleEffective(cfgRef.current, layer) as any
    const cfgFields = toPlainFields(rule?.fields)
    const layerFields = ((layer?.fields || []) as any[])
    const layerFieldNames = new Set(layerFields.map((f: any) => String(f?.name || '')))

    const hidden = new Set<string>()
    const readonly = new Set<string>()
    const labels = new Map<string, string>()
    const order: string[] = []

    if (!cfgFields.length) {
      if (rule?.allowAttrUpdate === false) {
        for (const lf of layerFields) {
          const name = String(lf?.name || '')
          if (name) readonly.add(name)
        }
      }
      return { hidden, readonly, labels, order }
    }

    const cfgNames = new Set<string>()
    for (const f of cfgFields) {
      const name = String((f as any)?.name || '')
      if (!name || !layerFieldNames.has(name)) continue
      order.push(name)
      cfgNames.add(name)
      if ((f as any)?.label) labels.set(name, String((f as any).label))
      if ((f as any)?.visible === false) hidden.add(name)
      if ((f as any)?.editable === false) readonly.add(name)
    }

    for (const lf of layerFields) {
      const name = String(lf?.name || '')
      if (!name) continue
      if (!cfgNames.has(name)) hidden.add(name)
    }

    if (rule?.allowAttrUpdate === false) {
      for (const lf of layerFields) {
        const name = String(lf?.name || '')
        if (name) readonly.add(name)
      }
    }

    return { hidden, readonly, labels, order }
  }, [])

  return {
    mapWidgetId, onActiveViewChange, cfg, view,
    selectedItems: sel, tool, mergeMode, geomChecked, sketchMode: geometry.sketchMode,
    editableLayers, attrEditableLayers, showSplitButton,
    canSplit, canReshape, canMerge, canGeom, canUndo, canRedo,
    onToggleAdd, onToggleRemove, onToggleSplit, onToggleReshape, onUndo, onRedo, onGeomToggle,
    onStartMerge, onCancelMerge, onConfirmMerge, onPreviewMergeItem,
    onStartCreate, onSaveNew, onCancelNew, onSaveExisting, onCancelEdit, onCancelSketch,
    onConfirmDelete, clearSelection, getFieldPolicy
  }
}
