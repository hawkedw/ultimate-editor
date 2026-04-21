import { useRef, useCallback, useState } from 'react'
import SketchViewModel from 'esri/widgets/Sketch/SketchViewModel'
import GraphicsLayer from 'esri/layers/GraphicsLayer'
import Graphic from 'esri/Graphic'
import Polygon from 'esri/geometry/Polygon'
import Point from 'esri/geometry/Point'
import * as geometryEngine from 'esri/geometry/geometryEngine'
import type MapView from 'esri/views/MapView'
import type FeatureLayer from 'esri/layers/FeatureLayer'

export type SketchMode = 'idle' | 'creating' | 'reshaping' | 'splitting' | 'reshapeLine' | 'updating'

export function useGeometry () {
  const [sketchMode, setSketchMode] = useState<SketchMode>('idle')
  const sketchModeRef = useRef<SketchMode>('idle')

  const svmRef = useRef<any>(null)
  const glRef = useRef<any>(null)

  const createLayerRef = useRef<any>(null)
  const createTemplateRef = useRef<any>(null)
  const createAttrsRef = useRef<Record<string, any>>({})
  const createCbRef = useRef<((g: any) => void) | null>(null)

  const reshapeOidRef = useRef<number | null>(null)
  const reshapeLayerRef = useRef<any>(null)
  const reshapeGraphicRef = useRef<any>(null)
  const reshapeReadyRef = useRef(false)
  const manualDoneRef = useRef(false)

  const splitItemRef = useRef<any>(null)
  const splitCbRef = useRef<((r: { before: any[], after: any[] }) => void) | null>(null)

  const reshapeLineItemRef = useRef<any>(null)
  const reshapeLineCbRef = useRef<((r: { before: any[], after: any[] } | null) => void) | null>(null)
  const viewRef = useRef<MapView | null>(null)

  const updateOidRef = useRef<number | null>(null)
  const updateLayerRef = useRef<any>(null)
  const updateSketchGraphicRef = useRef<any>(null)
  const updateOriginalGraphicRef = useRef<any>(null)
  const updateAllowMoveRef = useRef(false)
  const updateCbRef = useRef<((g: any) => void) | null>(null)
  const suppressUpdateCancelRef = useRef(false)
  const suppressReshapeCancelRef = useRef(false)
  const reshapeSketchGraphicRef = useRef<any>(null)
  const reshapeLayerViewRef = useRef<any>(null)
  const updateLayerViewRef = useRef<any>(null)
  const updateSourceGraphicRef = useRef<any>(null)
  const updateSourceVisibleRef = useRef<boolean>(true)

  const _setMode = (m: SketchMode) => {
    sketchModeRef.current = m
    setSketchMode(m)
  }

  const _clearCreate = () => {
    createLayerRef.current = null
    createTemplateRef.current = null
    createAttrsRef.current = {}
    createCbRef.current = null
  }

  const _clearReshape = () => {
    suppressReshapeCancelRef.current = false
    try {
      if (reshapeLayerViewRef.current) {
        ;(reshapeLayerViewRef.current as any).filter = null
        reshapeLayerViewRef.current = null
      }
    } catch {}
    reshapeOidRef.current = null
    reshapeLayerRef.current = null
    reshapeGraphicRef.current = null
    reshapeSketchGraphicRef.current = null
    reshapeReadyRef.current = false
    manualDoneRef.current = false
  }

  const _clearUpdate = () => {
    try {
      if (updateLayerViewRef.current) {
        ;(updateLayerViewRef.current as any).filter = null
        updateLayerViewRef.current = null
      }
    } catch {}
    updateOidRef.current = null
    updateLayerRef.current = null
    updateSketchGraphicRef.current = null
    updateOriginalGraphicRef.current = null
    updateAllowMoveRef.current = false
    updateCbRef.current = null
    suppressUpdateCancelRef.current = false
    updateSourceGraphicRef.current = null
    updateSourceVisibleRef.current = true
  }

  const _clearReshapeLine = () => {
    reshapeLineItemRef.current = null
    reshapeLineCbRef.current = null
  }

  type XY = { x: number, y: number }

  const sameXY = (a: XY, b: XY, eps = 1e-9) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
  const toXY = (p: any): XY => Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p.x), y: Number(p.y) }

  const dedupePath = (pts: XY[]) => {
    const out: XY[] = []
    for (const p of pts) {
      if (!out.length || !sameXY(out[out.length - 1], p)) out.push(p)
    }
    return out
  }

  const ringArea = (ring: XY[]) => {
    let sum = 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      sum += a.x * b.y - b.x * a.y
    }
    return sum / 2
  }

  const getOuterRing = (polygon: any): XY[] | null => {
    const rings = polygon?.rings || []
    if (!rings.length) return null
    let best: XY[] | null = null
    let bestArea = -1
    for (const ring of rings) {
      const pts = ring.map((p: any) => toXY(p))
      const open = sameXY(pts[0], pts[pts.length - 1]) ? pts.slice(0, -1) : pts.slice()
      if (open.length < 3) continue
      const area = Math.abs(ringArea(open))
      if (area > bestArea) {
        bestArea = area
        best = open
      }
    }
    return best
  }

  const buildBoundaryPath = (ring: XY[], fromPoint: XY, fromSegIndex: number, toPoint: XY, toSegIndex: number) => {
    const n = ring.length
    const out: XY[] = [{ ...fromPoint }]
    let seg = fromSegIndex

    if (fromSegIndex === toSegIndex) {
      if (!sameXY(out[out.length - 1], toPoint)) out.push({ ...toPoint })
      return out
    }

    while (seg !== toSegIndex) {
      const v = ring[(seg + 1) % n]
      if (!sameXY(out[out.length - 1], v)) out.push({ ...v })
      seg = (seg + 1) % n
    }

    if (!sameXY(out[out.length - 1], toPoint)) out.push({ ...toPoint })
    return out
  }

  const closeRing = (pts: XY[]) => {
    const open = dedupePath(pts)
    if (!open.length) return [] as number[][]
    const closed = sameXY(open[0], open[open.length - 1]) ? open : [...open, open[0]]
    return closed.map((p) => [p.x, p.y])
  }

  const polygonAreaAbs = (polygon: any) => {
    try {
      const a = Number((geometryEngine as any).planarArea?.(polygon))
      if (Number.isFinite(a) && a > 0) return a
    } catch {}
    const ring = getOuterRing(polygon)
    return ring ? Math.abs(ringArea(ring)) : 0
  }

  const polylineMidPoint = (pts: XY[]) => {
    if (!pts.length) return null
    let total = 0
    const segLens: number[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x
      const dy = pts[i + 1].y - pts[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segLens.push(len)
      total += len
    }
    if (total <= 0) return pts[0]
    let rest = total / 2
    for (let i = 0; i < segLens.length; i++) {
      const len = segLens[i]
      if (rest <= len) {
        const a = pts[i]
        const b = pts[i + 1]
        const t = len <= 0 ? 0 : rest / len
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      }
      rest -= len
    }
    return pts[pts.length - 1]
  }

  const simplifyPolygon = (polygon: any) => {
    try {
      return (geometryEngine as any).simplify?.(polygon) || polygon
    } catch {
      return polygon
    }
  }

  const cross2d = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx

  const segmentIntersection = (a1: XY, a2: XY, b1: XY, b2: XY) => {
    const r = { x: a2.x - a1.x, y: a2.y - a1.y }
    const s = { x: b2.x - b1.x, y: b2.y - b1.y }
    const denom = cross2d(r.x, r.y, s.x, s.y)
    const qp = { x: b1.x - a1.x, y: b1.y - a1.y }
    const eps = 1e-9

    if (Math.abs(denom) <= eps) return null

    const t = cross2d(qp.x, qp.y, s.x, s.y) / denom
    const u = cross2d(qp.x, qp.y, r.x, r.y) / denom
    if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null

    return {
      point: { x: a1.x + r.x * t, y: a1.y + r.y * t },
      t: Math.max(0, Math.min(1, t)),
      u: Math.max(0, Math.min(1, u))
    }
  }

  const getLineBoundaryIntersections = (linePts: XY[], ring: XY[]) => {
    const hits: Array<{ point: XY, lineSegIndex: number, lineT: number, ringSegIndex: number }> = []

    for (let i = 0; i < linePts.length - 1; i++) {
      const a1 = linePts[i]
      const a2 = linePts[i + 1]
      for (let j = 0; j < ring.length; j++) {
        const b1 = ring[j]
        const b2 = ring[(j + 1) % ring.length]
        const hit = segmentIntersection(a1, a2, b1, b2)
        if (!hit) continue
        const dup = hits.find((h) => sameXY(h.point, hit.point) && Math.abs((h.lineSegIndex + h.lineT) - (i + hit.t)) <= 1e-7)
        if (!dup) hits.push({ point: hit.point, lineSegIndex: i, lineT: hit.t, ringSegIndex: j })
      }
    }

    hits.sort((a, b) => (a.lineSegIndex + a.lineT) - (b.lineSegIndex + b.lineT))
    return hits
  }

  const sliceLineByHits = (linePts: XY[], startHit: any, endHit: any) => {
    const out: XY[] = [{ ...startHit.point }]
    for (let i = startHit.lineSegIndex + 1; i <= endHit.lineSegIndex; i++) {
      const p = linePts[i]
      if (p && !sameXY(out[out.length - 1], p)) out.push({ ...p })
    }
    if (!sameXY(out[out.length - 1], endHit.point)) out.push({ ...endHit.point })
    return dedupePath(out)
  }

  const pickBestGeometry = (orig: any, variants: any[], mode: 'add' | 'subtract') => {
    const origArea = polygonAreaAbs(orig)
    const eps = Math.max(origArea * 1e-9, 1e-9)
    const scored = variants
      .map((g) => ({ geometry: simplifyPolygon(g), area: polygonAreaAbs(g) }))
      .filter((x) => x.geometry && x.area > 0)

    if (!scored.length) return null

    if (mode === 'subtract') {
      const valid = scored.filter((x) => x.area < origArea - eps).sort((a, b) => b.area - a.area)
      return (valid[0] || scored.sort((a, b) => a.area - b.area)[0]).geometry
    }

    const valid = scored.filter((x) => x.area > origArea + eps).sort((a, b) => a.area - b.area)
    return (valid[0] || scored.sort((a, b) => b.area - a.area)[0]).geometry
  }

  const buildReshapedPolygonGeometry = (polygon: any, line: any) => {
    const ring = getOuterRing(polygon)
    const rawPath = line?.paths?.[0]
    if (!ring || !rawPath || rawPath.length < 2) return null

    const linePts = dedupePath(rawPath.map((p: any) => toXY(p)))
    if (linePts.length < 2) return null

    const hits = getLineBoundaryIntersections(linePts, ring)
    if (hits.length < 2) return null

    const startHit = hits[0]
    const endHit = hits[hits.length - 1]
    const drawPath = sliceLineByHits(linePts, startHit, endHit)
    if (drawPath.length < 2) return null

    const arcEndToStart = buildBoundaryPath(ring, endHit.point, endHit.ringSegIndex, startHit.point, startHit.ringSegIndex)
    const arcStartToEnd = buildBoundaryPath(ring, startHit.point, startHit.ringSegIndex, endHit.point, endHit.ringSegIndex)

    const patchA = simplifyPolygon(new Polygon({
      rings: [closeRing([...drawPath, ...arcEndToStart])],
      spatialReference: polygon.spatialReference
    } as any))

    const patchB = simplifyPolygon(new Polygon({
      rings: [closeRing([...arcStartToEnd, ...drawPath.slice().reverse()])],
      spatialReference: polygon.spatialReference
    } as any))

    const mid = polylineMidPoint(drawPath)
    let midInside = false
    if (mid) {
      try {
        midInside = !!(geometryEngine as any).contains?.(polygon, new Point({ x: mid.x, y: mid.y, spatialReference: polygon.spatialReference } as any))
      } catch {}
    }

    if (midInside) {
      const diffA = (geometryEngine as any).difference?.(polygon, patchA)
      const diffB = (geometryEngine as any).difference?.(polygon, patchB)
      return pickBestGeometry(polygon, [diffA, diffB], 'subtract')
    }

    const unionA = (geometryEngine as any).union?.([polygon, patchA]) || (geometryEngine as any).union?.(polygon, patchA)
    const unionB = (geometryEngine as any).union?.([polygon, patchB]) || (geometryEngine as any).union?.(polygon, patchB)
    return pickBestGeometry(polygon, [unionA, unionB], 'add')
  }

  const activePolygonUpdateSymbol = {
    type: 'simple-fill',
    style: 'solid',
    color: [170, 170, 170, 0.05],
    outline: {
      color: [160, 160, 160, 0.95],
      width: 1.5,
      style: 'solid'
    }
  } as any

  const activePolylineUpdateSymbol = {
    type: 'simple-line',
    color: [160, 160, 160, 0.95],
    width: 2
  } as any

  function applyUpdateSketchSymbol (draft: any, geometryType: string | null | undefined) {
    if (!draft) return
    try {
      if (geometryType === 'polygon') {
        draft.symbol = activePolygonUpdateSymbol
        return
      }
      if (geometryType === 'polyline') {
        draft.symbol = activePolylineUpdateSymbol
      }
    } catch {}
  }



  function _restartReshapeSession (sketchG: any) {
    reshapeSketchGraphicRef.current = sketchG
    applyUpdateSketchSymbol(sketchG, reshapeLayerRef.current?.geometryType)
    applySnappingForLayer(reshapeLayerRef.current)
    refreshUpdateDraftGraphic(sketchG)
    svmRef.current?.update([sketchG], {
      tool: 'reshape',
      enabledTools: ['reshape'],
      toggleToolOnClick: false,
      enableRotation: false,
      enableScaling: false,
      preserveAspectRatio: false
    } as any)
  }

  const refreshUpdateDraftGraphic = useCallback((draft: any) => {
    const gl = glRef.current
    if (!gl || !draft) return
    try { gl.removeAll?.() } catch {}
    try { gl.add?.(draft) } catch {}
  }, [])

  const applySnappingForLayer = useCallback((layer: any) => {
    const svm = svmRef.current as any
    if (!svm) return
    try {
      svm.snappingOptions = {
        enabled: true,
        selfEnabled: true,
        featureEnabled: true,
        featureSources: layer ? [{ layer, enabled: true }] : []
      } as any
    } catch {}
  }, [])

  const restartUpdateSession = useCallback((draft: any, allowMove: boolean) => {
    const svm = svmRef.current
    if (!svm || !draft) return

    refreshUpdateDraftGraphic(draft)
    applyUpdateSketchSymbol(draft, updateLayerRef.current?.geometryType)
    applySnappingForLayer(updateLayerRef.current)

    if (allowMove) {
      svm.update([draft], {
        tool: 'move',
        toggleToolOnClick: false,
        enableRotation: false,
        enableScaling: false,
        preserveAspectRatio: false
      } as any)
      return
    }

    svm.update([draft], {
      tool: 'reshape',
      enabledTools: ['reshape'],
      toggleToolOnClick: false,
      enableRotation: false,
      enableScaling: false,
      preserveAspectRatio: false
    } as any)
  }, [applySnappingForLayer, refreshUpdateDraftGraphic])

  const setupOnView = useCallback((view: MapView) => {
    viewRef.current = view
    const gl = new GraphicsLayer({ listMode: 'hide' }) as any
    ;(view as any).map.add(gl)
    glRef.current = gl

    const svm = new SketchViewModel({
      view: view as any,
      layer: gl,
      updateOnGraphicClick: false,
      defaultCreateOptions: { mode: 'click' },
      defaultUpdateOptions: {
        tool: 'reshape',
        toggleToolOnClick: false,
        enableRotation: false,
        enableScaling: false,
        preserveAspectRatio: false
      } as any
    }) as any

    const viewEl = (view as any)?.container as HTMLElement | null
    const onContextMenu = (e: MouseEvent) => {
      if (sketchModeRef.current !== 'updating' && sketchModeRef.current !== 'reshaping') return
      e.preventDefault()
      e.stopPropagation()
    }
    viewEl?.addEventListener('contextmenu', onContextMenu, true)

    svm.on('create', async (ev: any) => {
      if (ev.state === 'cancel') {
        try { gl.removeAll() } catch {}
        _clearCreate()
        _clearReshapeLine()
        splitItemRef.current = null
        splitCbRef.current = null
        _setMode('idle')
        return
      }

      if (ev.state !== 'complete') return

      const sketchGraphic = ev.graphic
      if (!sketchGraphic?.geometry) {
        try { gl.removeAll() } catch {}
        _clearCreate()
        _clearReshapeLine()
        splitItemRef.current = null
        splitCbRef.current = null
        _setMode('idle')
        return
      }

      if (sketchModeRef.current === 'creating') {
        const lyr = createLayerRef.current
        const tmpl = createTemplateRef.current
        const cb = createCbRef.current
        const xtra = createAttrsRef.current

        _clearCreate()

        if (!lyr || !cb) {
          try { gl.removeAll() } catch {}
          _setMode('idle')
          return
        }

        const attrs: any = { ...(tmpl?.prototype?.attributes || {}), ...xtra }

        let oid: number | null = null
        try {
          const res = await lyr.applyEdits({
            addFeatures: [{ geometry: sketchGraphic.geometry, attributes: attrs }]
          })
          oid = res.addFeatureResults?.[0]?.objectId ?? null
        } catch (e) {
          console.error('[UE] applyEdits ADD error:', e)
          try { gl.removeAll() } catch {}
          _setMode('idle')
          return
        }

        if (oid == null) {
          try { gl.removeAll() } catch {}
          _setMode('idle')
          return
        }

        // Hide newly created feature from layer while reshaping
        const _vv = viewRef.current as any
        if (_vv?.whenLayerView) {
          _vv.whenLayerView(lyr).then((lv: any) => {
            if (lv && typeof lv.filter !== 'undefined') {
              reshapeLayerViewRef.current = lv
              const oidF2 = (lyr as any).objectIdField || 'OBJECTID'
              lv.filter = { where: `${oidF2} <> ${oid}` } as any
            }
          }).catch(() => {})
        }

        let layerGraphic: any = null
        try {
          const q = await lyr.queryFeatures({
            objectIds: [oid],
            outFields: ['*'],
            returnGeometry: true
          })
          layerGraphic = q.features?.[0] || null
          if (layerGraphic) cb(layerGraphic)
        } catch (e) {
          console.warn('[UE] queryFeatures failed', e)
        }

        reshapeOidRef.current = oid
        reshapeLayerRef.current = lyr
        reshapeGraphicRef.current = layerGraphic

        _setMode('reshaping')

        setTimeout(() => {
          if (sketchModeRef.current !== 'reshaping') return
          reshapeReadyRef.current = true
          reshapeSketchGraphicRef.current = sketchGraphic
          applyUpdateSketchSymbol(sketchGraphic, (lyr as any)?.geometryType)
          applySnappingForLayer(lyr)
          refreshUpdateDraftGraphic(sketchGraphic)
          svm.update([sketchGraphic], {
            tool: 'reshape',
            enabledTools: ['reshape'],
            toggleToolOnClick: false,
            enableRotation: false,
            enableScaling: false,
            preserveAspectRatio: false
          } as any)
        }, 250)

        return
      }

      if (sketchModeRef.current === 'reshapeLine') {
        try { gl.removeAll() } catch {}

        const target = reshapeLineItemRef.current
        const cb = reshapeLineCbRef.current
        _clearReshapeLine()

        if (!target?.layer) {
          _setMode('idle')
          cb?.(null)
          return
        }

        const layer = target.layer as FeatureLayer
        const line = sketchGraphic.geometry
        const oidField = (layer as any).objectIdField || 'OBJECTID'

        if (!line) {
          _setMode('idle')
          cb?.(null)
          return
        }

        try {
          let srcGraphic: any = target.graphic || null
          let oid: any = target.oid ?? (srcGraphic ? srcGraphic?.attributes?.[oidField] : null)
          let nextGeometry: any = null

          if (!srcGraphic) {
            try { await (layer as any).load?.() } catch {}
            const q = (layer as any).createQuery ? (layer as any).createQuery() : {}
            q.geometry = line
            q.spatialRelationship = 'intersects'
            q.outFields = ['*']
            q.returnGeometry = true
            const fs = await (layer as any).queryFeatures(q)
            const candidates = fs?.features || []

            let bestGraphic: any = null
            let bestGeometry: any = null
            let bestAreaDelta = Number.POSITIVE_INFINITY

            for (const feature of candidates) {
              const candidateGeometry = buildReshapedPolygonGeometry(feature?.geometry, line)
              if (!candidateGeometry) continue
              const delta = Math.abs(polygonAreaAbs(candidateGeometry) - polygonAreaAbs(feature?.geometry))
              if (!bestGraphic || delta < bestAreaDelta) {
                bestGraphic = feature
                bestGeometry = candidateGeometry
                bestAreaDelta = delta
              }
            }

            if (!bestGraphic || !bestGeometry) {
              console.warn('[UE] reshape-line failed')
              _setMode('idle')
              cb?.(null)
              return
            }

            srcGraphic = bestGraphic
            nextGeometry = bestGeometry
            oid = srcGraphic?.attributes?.[oidField]
          } else {
            nextGeometry = buildReshapedPolygonGeometry(srcGraphic.geometry, line)
            if (!nextGeometry) {
              console.warn('[UE] reshape-line failed')
              _setMode('idle')
              cb?.(null)
              return
            }
          }

          await (layer as any).applyEdits({
            updateFeatures: [{
              geometry: nextGeometry,
              attributes: { [oidField]: oid }
            }]
          } as any)

          let updatedGraphic: any = null
          try {
            const q2 = await (layer as any).queryFeatures({
              objectIds: [oid],
              outFields: ['*'],
              returnGeometry: true
            } as any)
            updatedGraphic = q2.features?.[0] || null
          } catch (e) {
            console.warn('[UE] reshape-line query failed', e)
          }

          _setMode('idle')
          cb?.({ before: srcGraphic ? [srcGraphic] : [], after: updatedGraphic ? [updatedGraphic] : [] })
        } catch (e) {
          console.error('[UE] reshape-line applyEdits error:', e)
          _setMode('idle')
          cb?.(null)
        }
        return
      }

      if (sketchModeRef.current === 'splitting') {
        try { gl.removeAll() } catch {}

        const target = splitItemRef.current
        const cb = splitCbRef.current
        splitItemRef.current = null
        splitCbRef.current = null

        if (!target || !cb) {
          _setMode('idle')
          return
        }

        const cutter = sketchGraphic.geometry
        const layer = target.layer as FeatureLayer

        try {
          await layer.load?.()
        } catch {}

        const featuresToSplit: any[] = []

        if (target.graphic) {
          featuresToSplit.push(target.graphic)
        } else {
          try {
            const q = layer.createQuery()
            q.geometry = cutter
            q.spatialRelationship = 'intersects'
            q.outFields = ['*']
            q.returnGeometry = true

            const fs = await layer.queryFeatures(q)
            featuresToSplit.push(...(fs.features || []))
          } catch (e) {
            console.error('[UE] split query error:', e)
          }
        }

        if (!featuresToSplit.length) {
          _setMode('idle')
          cb({ before: [], after: [] })
          return
        }

        const deleteFeatures: any[] = []
        const addFeatures: any[] = []

        for (const src of featuresToSplit) {
          let parts: any[] = []
          try {
            parts = geometryEngine.cut(src.geometry, cutter) as any[]
          } catch (e) {
            console.error('[UE] cut error:', e)
            continue
          }

          if (!parts?.length || parts.length < 2) continue

          deleteFeatures.push(src)
          addFeatures.push(
            ...parts.map((p: any) => ({
              geometry: p,
              attributes: { ...src.attributes }
            }))
          )
        }

        if (!deleteFeatures.length || !addFeatures.length) {
          _setMode('idle')
          cb({ before: [], after: [] })
          return
        }

        try {
          const res = await layer.applyEdits({
            deleteFeatures,
            addFeatures
          } as any)

          const oids = (res.addFeatureResults || [])
            .map((r: any) => r.objectId)
            .filter((o: any) => o != null)

          let newGraphics: any[] = []
          if (oids.length) {
            const q = await layer.queryFeatures({
              objectIds: oids,
              outFields: ['*'],
              returnGeometry: true
            } as any)
            newGraphics = q.features || []
          }

          cb({ before: featuresToSplit, after: newGraphics })
        } catch (e) {
          console.error('[UE] split applyEdits error:', e)
          cb({ before: [], after: [] })
        }

        _setMode('idle')
      }
    })

    svm.on('update', async (ev: any) => {
      if (sketchModeRef.current === 'updating') {
        const evGraphic = ev.graphics?.[0]
        if (evGraphic) updateSketchGraphicRef.current = evGraphic
        const draft = updateSketchGraphicRef.current
        applyUpdateSketchSymbol(draft, updateLayerRef.current?.geometryType)

        if (ev.state === 'cancel' || ev.state === 'complete') {
          // If mode is no longer 'updating' — this cancel came after we intentionally exited.
          // (We call _setMode('idle') BEFORE svm.cancel() on intentional exits.)
          if (sketchModeRef.current !== 'updating') return

          // We're still in 'updating' → this came from a vertex delete or SVM auto-complete.
          // Restart with a fresh Graphic to avoid JSAPI reuse issues.
          const savedGeom = (ev.graphics?.[0] ?? updateSketchGraphicRef.current)?.geometry
          if (!savedGeom) { _clearUpdate(); _setMode('idle'); return }

          setTimeout(() => {
            if (sketchModeRef.current !== 'updating') return
            const freshDraft = new Graphic({
              geometry: savedGeom.clone(),
              symbol: activePolygonUpdateSymbol
            } as any)
            applyUpdateSketchSymbol(freshDraft, updateLayerRef.current?.geometryType)
            updateSketchGraphicRef.current = freshDraft
            try { gl.removeAll() } catch {}
            try { gl.add(freshDraft) } catch {}
            applySnappingForLayer(updateLayerRef.current)
            svm.update([freshDraft], {
              tool: updateAllowMoveRef.current ? 'move' : 'reshape',
              enabledTools: updateAllowMoveRef.current ? undefined : ['reshape'],
              toggleToolOnClick: false,
              enableRotation: false,
              enableScaling: false,
              preserveAspectRatio: false
            } as any)
          }, 50)
          return
        }

        return
      }

      if (sketchModeRef.current !== 'reshaping') return

      if (ev.toolEventInfo && String(ev.toolEventInfo.type).includes('move')) {
        try { svm.cancel() } catch {}
        return
      }

      if (manualDoneRef.current) return
      if (!reshapeReadyRef.current) return

      if (ev.state === 'cancel' || ev.state === 'complete') {
        // Intentional exits call _setMode('idle') BEFORE svm.cancel() — so mode != 'reshaping' here.
        if (sketchModeRef.current !== 'reshaping') return

        // vertex delete / auto-complete → restart reshape with fresh Graphic
        const sketchG = ev.graphics?.[0] || reshapeSketchGraphicRef.current
        const savedReshapeGeom = sketchG?.geometry
        if (savedReshapeGeom) {
          setTimeout(() => {
            if (sketchModeRef.current !== 'reshaping') return
            const freshG = new Graphic({
              geometry: savedReshapeGeom.clone(),
              symbol: activePolygonUpdateSymbol
            } as any)
            applyUpdateSketchSymbol(freshG, reshapeLayerRef.current?.geometryType)
            reshapeSketchGraphicRef.current = freshG
            try { gl.removeAll() } catch {}
            try { gl.add(freshG) } catch {}
            applySnappingForLayer(reshapeLayerRef.current)
            svm.update([freshG], {
              tool: 'reshape',
              enabledTools: ['reshape'],
              toggleToolOnClick: false,
              enableRotation: false,
              enableScaling: false,
              preserveAspectRatio: false
            } as any)
          }, 50)
        } else {
          try { gl.removeAll() } catch {}
          _clearReshape()
          _setMode('idle')
        }
        return
      }
    })

    svmRef.current = svm

    return () => {
      _setMode('idle')
      try { viewEl?.removeEventListener('contextmenu', onContextMenu, true) } catch {}
      try { svm.cancel() } catch {}
      try { svm.destroy() } catch {}
      svmRef.current = null

      try { (view as any).map.remove(gl) } catch {}
      glRef.current = null

      _clearCreate()
      _clearReshape()
      _clearReshapeLine()
      _clearUpdate()
      splitItemRef.current = null
      splitCbRef.current = null
      viewRef.current = null
      _setMode('idle')
    }
  }, [restartUpdateSession])

  const cancel = useCallback(() => {
    _setMode('idle')                        // set BEFORE svm.cancel so events are ignored
    try { svmRef.current?.cancel() } catch {}
    try { glRef.current?.removeAll?.() } catch {}
    _clearCreate()
    _clearReshape()
    _clearReshapeLine()
    _clearUpdate()
    splitItemRef.current = null
    splitCbRef.current = null
  }, [])

  const confirmCreate = useCallback(async (draftAttrs: Record<string, any>) => {
  const graphic = reshapeGraphicRef.current
  const oid = reshapeOidRef.current
  const layer = reshapeLayerRef.current
  suppressReshapeCancelRef.current = true
  manualDoneRef.current = true
  try { svmRef.current?.cancel() } catch {}
  try { glRef.current?.removeAll?.() } catch {}
  if (oid && layer) {
    const oidF = (layer as any).objectIdField || 'OBJECTID'
    const currentGeom = reshapeSketchGraphicRef.current?.geometry ?? graphic?.geometry
    try {
      await layer.applyEdits({
        updateFeatures: [{
          ...(currentGeom ? { geometry: currentGeom } : {}),
          attributes: { ...(graphic?.attributes || {}), ...draftAttrs, [oidF]: oid }
          //                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ЭТО ДОБАВЛЕНО
        }]
      } as any)
    } catch (e) { console.error('[UE] confirmCreate error:', e) }
  }
  _clearReshape()
  _setMode('idle')
}, [])


  const cancelCreate = useCallback(async () => {
    const graphic = reshapeGraphicRef.current
    const oid = reshapeOidRef.current
    const layer = reshapeLayerRef.current

    suppressReshapeCancelRef.current = true
    manualDoneRef.current = true
    try { svmRef.current?.cancel() } catch {}
    try { glRef.current?.removeAll?.() } catch {}

    if (oid && layer && graphic) {
      try {
        await layer.applyEdits({
          deleteFeatures: [graphic]
        })
      } catch (e) {
        console.warn('[UE] cancelCreate delete error:', e)
      }
    }

    _clearReshape()
    _setMode('idle')
  }, [])

  const startCreate = useCallback((
    layer: FeatureLayer,
    template: any,
    extraAttrs: Record<string, any>,
    onCreated: (g: any) => void
  ) => {
    const svm = svmRef.current
    if (!svm) return

    createLayerRef.current = layer
    createTemplateRef.current = template
    createAttrsRef.current = extraAttrs
    createCbRef.current = onCreated

    const gt = (layer as any).geometryType as string
    const svmType = gt === 'polygon'
      ? 'polygon'
      : gt === 'polyline'
        ? 'polyline'
        : 'point'

    _setMode('creating')
    svm.create(svmType)
  }, [])

  const startSplit = useCallback((
    itemOrLayer: { graphic?: any, layer: FeatureLayer },
    onDone: (r: { before: any[], after: any[] }) => void
  ) => {
    cancel()
    splitItemRef.current = itemOrLayer
    splitCbRef.current = onDone
    _setMode('splitting')
    svmRef.current?.create('polyline')
  }, [cancel])

  const startReshapeByLine = useCallback((
    itemOrLayer: { graphic?: any, layer: FeatureLayer, oid?: number },
    onDone?: (r: { before: any[], after: any[] } | null) => void
  ) => {
    const svm = svmRef.current
    if (!svm || !itemOrLayer?.layer) return

    cancel()
    reshapeLineItemRef.current = itemOrLayer
    reshapeLineCbRef.current = onDone || null
    _setMode('reshapeLine')
    svm.create('polyline')
  }, [cancel])

  const startGeometryEdit = useCallback((
    item: { graphic: any, layer: FeatureLayer },
    onDone?: (r: { before: any[], after: any[] } | null) => void
  ) => {
    const svm = svmRef.current
    const gl = glRef.current
    if (!svm || !gl || !item?.graphic || !item?.layer) return

    _setMode('idle')                        // prevent stale cancel events
    try { svm.cancel?.() } catch {}
    try { gl.removeAll?.() } catch {}

    _clearCreate()
    _clearReshape()
    _clearUpdate()
    splitItemRef.current = null
    splitCbRef.current = null

    const layer = item.layer as any
    const src = item.graphic as any
    const oidField = layer.objectIdField || 'OBJECTID'
    const rawOid = src?.attributes?.[oidField]
    const oid = typeof rawOid === 'number' ? rawOid : Number(rawOid)

    if (!Number.isFinite(oid)) return

    const draft = src?.clone
      ? src.clone()
      : new Graphic({
          geometry: src.geometry,
          attributes: { ...(src.attributes || {}) }
        } as any)

    const original = src?.clone
      ? src.clone()
      : new Graphic({
          geometry: src.geometry,
          attributes: { ...(src.attributes || {}) }
        } as any)

    try {
      updateSourceGraphicRef.current = src
      // Hide via layerView.filter — compatible with JSAPI 4.15+
      const v = viewRef.current as any
      if (v?.whenLayerView) {
        v.whenLayerView(layer).then((lv: any) => {
          if (lv && typeof lv.filter !== 'undefined') {
            updateLayerViewRef.current = lv
            lv.filter = { where: `${oidField} <> ${oid}` } as any
          }
        }).catch(() => {})
      }
    } catch {}

    applyUpdateSketchSymbol(draft, layer.geometryType)
    refreshUpdateDraftGraphic(draft)

    updateOidRef.current = oid
    updateLayerRef.current = layer
    updateSketchGraphicRef.current = draft
    updateOriginalGraphicRef.current = original
    updateAllowMoveRef.current = (layer.geometryType === 'point')
    updateCbRef.current = onDone || null

    _setMode('updating')
    restartUpdateSession(draft, !!updateAllowMoveRef.current)
  }, [restartUpdateSession])

  const commitUpdate = useCallback(async (draftAttrs: Record<string, any> = {}) => {
    const gl = glRef.current
    const sketchG = updateSketchGraphicRef.current
    const oid = updateOidRef.current
    const layer = updateLayerRef.current

    if (!sketchG?.geometry || !oid || !layer) return null

    const oidF = layer.objectIdField || 'OBJECTID'
    const baseAttrs = { ...(sketchG.attributes || {}) }

    try {
      await layer.applyEdits({
        updateFeatures: [{
          geometry: sketchG.geometry,
          attributes: {
            ...baseAttrs,
            ...draftAttrs,
            [oidF]: oid
          }
        }]
      })
    } catch (e) {
      console.error('[UE] commitUpdate error:', e)
      return null
    }

    let updatedGraphic: any = null
    try {
      const q = await layer.queryFeatures({
        objectIds: [oid],
        outFields: ['*'],
        returnGeometry: true
      } as any)
      updatedGraphic = q.features?.[0] || null
    } catch (e) {
      console.warn('[UE] commitUpdate queryFeatures failed', e)
    }

    _setMode('idle')                        // set BEFORE svm.cancel so events are ignored
    try { svmRef.current?.cancel?.() } catch {}
    try { gl?.removeAll?.() } catch {}

    _clearUpdate()
    updateCbRef.current?.(updatedGraphic)

    return updatedGraphic
  }, [])

  return {
    setupOnView,
    cancel,
    cancelCreate,
    confirmCreate,
    startCreate,
    startSplit,
    startReshapeByLine,
    startGeometryEdit,
    commitUpdate,
    sketchMode,
    sketchModeRef
  }
}
