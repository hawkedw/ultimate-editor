import Graphic from 'esri/Graphic'
import { layerKey } from '../utils/ueUtils'
import { perfLog, perfNow, type UltimateEditorPerfContext } from '../debug'

export function cloneGeometry (g: any) {
  try { return g?.clone?.() ?? g ?? null } catch { return g ?? null }
}

export function sanitizeAttrsForAdd (layer: any, attrs: any = {}) {
  const out = { ...(attrs || {}) }
  const oidField = layer?.objectIdField || 'OBJECTID'
  const gidField = layer?.globalIdField
  delete out[oidField]
  if (gidField) delete out[gidField]
  delete out.OBJECTID
  delete out.objectid
  delete out.GlobalID
  delete out.GLOBALID
  delete out.globalid
  return out
}

function getLayerFieldNames (layer: any): string[] {
  return ((layer?.fields || []) as any[])
    .map((f: any) => String(f?.name || ''))
    .filter(Boolean)
}

export function getMissingLayerFieldNames (layer: any, graphic: any): string[] {
  const attrs = graphic?.attributes || {}
  return getLayerFieldNames(layer).filter(name => !Object.prototype.hasOwnProperty.call(attrs, name))
}

function mergeFetchedAttributesWithBaseGraphic (layer: any, baseGraphic: any, fetchedGraphic: any) {
  if (!baseGraphic || !fetchedGraphic) return fetchedGraphic ?? null
  if (fetchedGraphic?.geometry) return fetchedGraphic

  const merged = new Graphic({
    geometry: baseGraphic.geometry,
    attributes: {
      ...(baseGraphic.attributes || {}),
      ...(fetchedGraphic.attributes || {})
    }
  })
  ;(merged as any).layer = layer
  return merged
}

interface FetchFullGraphicOptions {
  baseGraphic?: any
  outFields?: string[]
  returnGeometry?: boolean
  reason?: string
  perf?: UltimateEditorPerfContext | null
}

export async function fetchFullGraphic (layer: any, oid: number, options: FetchFullGraphicOptions = {}) {
  const reason = options.reason || 'fetch-full-graphic'
  const t0 = perfNow()
  await layer.load?.()
  perfLog(options.perf, 'layer load before feature query complete', {
    reason,
    layer: layerKey(layer),
    oid,
    loadMs: Math.round((perfNow() - t0) * 10) / 10
  })

  const q = layer.createQuery()
  q.objectIds = [oid]
  const requestedFields = options.outFields?.length ? options.outFields : ['*']
  q.outFields = requestedFields
  // ULTIMATE_EDITOR_PERF_OPTIMIZATION: hitTest already gives us geometry for normal selection.
  // Fetch only attributes when possible; this reduces FeatureServer payload on large polygons.
  q.returnGeometry = options.returnGeometry ?? !options.baseGraphic?.geometry
  q.returnDomainNames = false

  const queryStart = perfNow()
  perfLog(options.perf, 'feature query start', {
    reason,
    layer: layerKey(layer),
    oid,
    outFields: requestedFields.length === 1 && requestedFields[0] === '*' ? '*' : requestedFields.length,
    returnGeometry: q.returnGeometry
  })
  const fs = await layer.queryFeatures(q)
  const fetched = fs?.features?.[0] ?? null
  const merged = mergeFetchedAttributesWithBaseGraphic(layer, options.baseGraphic, fetched)
  perfLog(options.perf, 'feature query complete', {
    reason,
    layer: layerKey(layer),
    oid,
    queryMs: Math.round((perfNow() - queryStart) * 10) / 10,
    featureCount: fs?.features?.length ?? 0,
    attrCount: Object.keys(merged?.attributes || {}).length,
    hasGeometry: !!merged?.geometry
  })
  return merged
}

export async function queryGraphicsByOids (layer: any, oids: any[]): Promise<any[]> {
  const valid = (oids || []).filter((o: any) => o != null)
  if (!valid.length) return []
  const oidField = layer?.objectIdField || 'OBJECTID'
  const fs = await layer.queryFeatures({
    objectIds: valid,
    outFields: ['*'],
    returnGeometry: true
  } as any)
  const byOid = new Map<any, any>((fs?.features || []).map((g: any) => [g?.attributes?.[oidField], g]))
  return valid.map((oid: any) => byOid.get(oid)).filter(Boolean)
}

export async function addBlueprints (layer: any, blueprints: any[]) {
  if (!blueprints?.length) return []
  const res = await layer.applyEdits({
    addFeatures: blueprints.map((b: any) => ({
      geometry: cloneGeometry(b.geometry),
      attributes: sanitizeAttrsForAdd(layer, b.attributes)
    }))
  } as any)
  const oids = (res?.addFeatureResults || []).map((r: any) => r.objectId).filter((o: any) => o != null)
  return await queryGraphicsByOids(layer, oids)
}

export async function replaceFeatureSet (layer: any, currentGraphics: any[], targetBlueprints: any[]) {
  const source = (currentGraphics || []).filter(Boolean)
  const target = (targetBlueprints || []).filter(Boolean)
  const oidField = layer?.objectIdField || 'OBJECTID'

  if (source.length && target.length) {
    const updateFeatures: any[] = []
    const updatedOids: any[] = []
    const pairCount = Math.min(source.length, target.length)

    for (let i = 0; i < pairCount; i++) {
      const src = source[i]
      const oid = src?.attributes?.[oidField]
      if (oid == null) break
      updateFeatures.push({
        ...(target[i]?.geometry ? { geometry: cloneGeometry(target[i].geometry) } : {}),
        attributes: { ...(target[i]?.attributes || {}), [oidField]: oid }
      })
      updatedOids.push(oid)
    }

    if (updateFeatures.length) {
      const edits: any = { updateFeatures }
      if (source.length > updateFeatures.length) edits.deleteFeatures = source.slice(updateFeatures.length)

      const remainingTargets = target.slice(updateFeatures.length)
      let addedGraphics: any[] = []
      if (remainingTargets.length) {
        const res = await layer.applyEdits({
          ...edits,
          addFeatures: remainingTargets.map((b: any) => ({
            geometry: cloneGeometry(b.geometry),
            attributes: sanitizeAttrsForAdd(layer, b.attributes)
          }))
        } as any)
        const addedOids = (res?.addFeatureResults || []).map((r: any) => r.objectId).filter((o: any) => o != null)
        addedGraphics = await queryGraphicsByOids(layer, addedOids)
      } else {
        await layer.applyEdits(edits as any)
      }

      const updatedGraphics = await queryGraphicsByOids(layer, updatedOids)
      return [...updatedGraphics, ...addedGraphics]
    }
  }

  if (source.length) {
    await layer.applyEdits({ deleteFeatures: source } as any)
  }

  if (!target.length) return []
  return await addBlueprints(layer, target)
}
