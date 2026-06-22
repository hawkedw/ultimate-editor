import { React } from 'jimu-core'
import Graphic from 'esri/Graphic'
import type FeatureLayer from 'esri/layers/FeatureLayer'
import type FeatureLayerView from 'esri/views/layers/FeatureLayerView'
import type { IMConfig } from '../../config'
import { isFeatureLayer, getGraphicOid, layerKey, resolveRuleEffective } from '../utils/ueUtils'
import { dgroup, dgroupEnd, dlog, perfAttach, perfLog, type UltimateEditorPerfContext } from '../debug'
import { fetchFullGraphic } from './featureEdits'

export interface SelItem {
  layer: FeatureLayer
  graphic: Graphic
  oid: number
}

export type SelectMode = 'replace' | 'add' | 'remove'
type ToolRef = React.MutableRefObject<'none' | 'add' | 'remove' | 'split'>

interface Opts {
  cfgRef: React.MutableRefObject<IMConfig | undefined>
}

function getDomainFieldNames(layer: any): string[] {
  const fields = (layer?.fields || []) as any[]
  return fields.filter(f => !!f?.domain).map(f => f.name).filter(Boolean)
}

function hasAllDomainFields(layer: any, g: any): boolean {
  const attrs = g?.attributes
  if (!attrs) return false
  const domainFields = getDomainFieldNames(layer)
  if (!domainFields.length) return true // нет доменов — нечего проверять
  return domainFields.every(fn => Object.prototype.hasOwnProperty.call(attrs, fn))
}

export function useSelection(toolRef: ToolRef, opts: Opts) {
  const { cfgRef } = opts

  const viewRef = React.useRef<any>(null)

  const [selectedItems, setSelectedItems] = React.useState<SelItem[]>([])
  const selectedItemsRef = React.useRef<SelItem[]>([])
  React.useEffect(() => { selectedItemsRef.current = selectedItems }, [selectedItems])

  const storeRef = React.useRef<Map<string, { layer: FeatureLayer; byOid: Map<number, Graphic> }>>(new Map())
  const layerViewsRef = React.useRef<Map<string, FeatureLayerView>>(new Map())
  const highlightRef = React.useRef<Map<string, __esri.Handle>>(new Map())

  const isSelectableLayer = React.useCallback((layer: any) => {
    if (!isFeatureLayer(layer)) return false
    return resolveRuleEffective(cfgRef.current, layer).allowAttrUpdate === true
  }, [cfgRef])

  const clearHighlights = React.useCallback(() => {
    for (const h of highlightRef.current.values()) {
      try { h.remove() } catch {}
    }
    highlightRef.current.clear()
  }, [])

  const rebuildState = React.useCallback(() => {
    const out: SelItem[] = []
    for (const entry of storeRef.current.values()) {
      for (const [oid, g] of entry.byOid.entries()) out.push({ layer: entry.layer, oid, graphic: g })
    }
    selectedItemsRef.current = out
    setSelectedItems(out)
  }, [])

  const applyHighlights = React.useCallback(async () => {
    const view = viewRef.current
    if (!view) return

    clearHighlights()

    for (const [k, entry] of storeRef.current.entries()) {
      const oids = Array.from(entry.byOid.keys())
      if (!oids.length) continue

      let lv = layerViewsRef.current.get(k)
      if (!lv) {
        try {
          lv = await view.whenLayerView(entry.layer)
          layerViewsRef.current.set(k, lv)
        } catch {
          continue
        }
      }

      try {
        const hh = (lv as any).highlight(oids)
        highlightRef.current.set(k, hh)
      } catch {}
    }
  }, [clearHighlights])

  const clearSelection = React.useCallback(() => {
    storeRef.current.clear()
    rebuildState()
    clearHighlights()
  }, [rebuildState, clearHighlights])

  const setupOnView = React.useCallback((view: any) => {
    viewRef.current = view
    return () => {
      viewRef.current = null
      clearSelection()
      layerViewsRef.current.clear()
    }
  }, [clearSelection])

  const selectGraphic = React.useCallback(async (g: Graphic, mode: SelectMode, perf?: UltimateEditorPerfContext | null) => {
    const layer = (g as any)?.layer as any
    if (!isFeatureLayer(layer)) return

    try {
      // важно для hitTest/форм: outFields должны быть заданы до load, но на всякий случай дубль
      layer.outFields = ['*']
    } catch {}
    try { if (layer?.loadStatus !== 'loaded') await layer.load() } catch {}

    const eff = resolveRuleEffective(cfgRef.current, layer)
    if (eff.allowAttrUpdate !== true) {
      dlog('[UE][Sel] skip not editable', layerKey(layer))
      return
    }

    const oid = getGraphicOid(g)
    if (oid == null) return
    perfLog(perf, 'selected feature received', {
      mode,
      layer: layerKey(layer),
      oid,
      attrCount: Object.keys((g as any)?.attributes || {}).length,
      hasGeometry: !!(g as any)?.geometry
    })

    const k = layerKey(layer)
    const cur = selectedItemsRef.current
    const fixedKey = cur.length ? layerKey(cur[0].layer) : null

    if ((mode === 'add' || mode === 'remove') && fixedKey && fixedKey !== k) return

    dgroup(`[UE][Sel] ${mode} oid=${oid} layer=${k}`)
    try {
      dlog('tool:', toolRef.current)
      dlog('attrs keys:', Object.keys((g as any)?.attributes || {}).length)
      const domainFields = getDomainFieldNames(layer)
      const missingDomain = domainFields.filter(fn => !Object.prototype.hasOwnProperty.call((g as any)?.attributes || {}, fn))
      dlog('domainFields:', domainFields.length, 'missing:', missingDomain)
    } finally {
      dgroupEnd()
    }

    if (mode === 'replace') storeRef.current.clear()

    if (mode === 'remove') {
      const entry = storeRef.current.get(k)
      if (entry) entry.byOid.delete(oid)
    } else {
      // КЛЮЧЕВО: если graphic неполный (нет доменных полей) — догружаем полный feature по OID
      let g2: any = g
      if (!hasAllDomainFields(layer, g2)) {
        try {
          // ULTIMATE_EDITOR_PERF_OPTIMIZATION: if the selected graphic already has geometry,
          // only missing attributes are fetched for domain-backed form fields.
          const missingDomainFields = getDomainFieldNames(layer)
            .filter(fn => !Object.prototype.hasOwnProperty.call((g2 as any)?.attributes || {}, fn))
          const full = await fetchFullGraphic(layer, oid, {
            baseGraphic: g2,
            outFields: missingDomainFields.length ? missingDomainFields : ['*'],
            returnGeometry: !g2?.geometry,
            reason: 'selection-missing-domain-fields',
            perf
          })
          if (full) g2 = full
        } catch (e) {
          console.warn('[UE][Sel] fetchFullGraphicByOid failed', e)
        }
      }
      perfAttach(g2, perf)
      perfLog(perf, 'selected feature attributes available', {
        layer: k,
        oid,
        attrCount: Object.keys((g2 as any)?.attributes || {}).length,
        hasGeometry: !!(g2 as any)?.geometry
      })

      let entry = storeRef.current.get(k)
      if (!entry) {
        entry = { layer, byOid: new Map<number, Graphic>() }
        storeRef.current.set(k, entry)
      }
      entry.byOid.set(oid, g2)
    }

    const entry = storeRef.current.get(k)
    if (entry && entry.byOid.size === 0) storeRef.current.delete(k)

    rebuildState()
    perfLog(perf, 'selection state committed', {
      layer: k,
      oid,
      selectedCount: selectedItemsRef.current.length
    })
    await applyHighlights()
    perfLog(perf, 'selection highlight complete', {
      layer: k,
      oid,
      selectedCount: selectedItemsRef.current.length
    })
  }, [applyHighlights, isSelectableLayer, rebuildState, cfgRef])

  const selectGraphics = React.useCallback(async (graphics: Graphic[], mode: SelectMode) => {
    const list = (graphics || []).filter(Boolean)
    if (!list.length) return

    if (mode === 'replace') storeRef.current.clear()

    let fixedKey = selectedItemsRef.current.length ? layerKey(selectedItemsRef.current[0].layer) : null

    for (const g of list) {
      const layer = (g as any)?.layer as any
      if (!isFeatureLayer(layer)) continue

      try { layer.outFields = ['*'] } catch {}
      try { if (layer?.loadStatus !== 'loaded') await layer.load() } catch {}

      const eff = resolveRuleEffective(cfgRef.current, layer)
      if (eff.allowAttrUpdate !== true) continue

      const oid = getGraphicOid(g)
      if (oid == null) continue

      const k = layerKey(layer)
      if ((mode === 'add' || mode === 'remove') && fixedKey && fixedKey !== k) continue
      if (!fixedKey && mode !== 'replace') fixedKey = k

      if (mode === 'remove') {
        const entry = storeRef.current.get(k)
        if (entry) entry.byOid.delete(oid)
        continue
      }

      let entry = storeRef.current.get(k)
      if (!entry) {
        entry = { layer, byOid: new Map<number, Graphic>() }
        storeRef.current.set(k, entry)
      }
      entry.byOid.set(oid, g)
    }

    for (const [k, entry] of storeRef.current.entries()) {
      if (entry.byOid.size === 0) storeRef.current.delete(k)
    }

    rebuildState()
    await applyHighlights()
  }, [applyHighlights, rebuildState, cfgRef])

  return React.useMemo(() => ({
    selectedItems,
    setupOnView,
    clearSelection,
    selectGraphic,
    selectGraphics
  }), [selectedItems, setupOnView, clearSelection, selectGraphic, selectGraphics])
}
