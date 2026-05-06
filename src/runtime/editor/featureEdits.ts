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

export async function fetchFullGraphic (layer: any, oid: number) {
  await layer.load?.()

  const q = layer.createQuery()
  q.objectIds = [oid]
  q.outFields = ['*']
  q.returnGeometry = true
  ;(q as any).returnDomainNames = false

  const fs = await layer.queryFeatures(q)
  return fs?.features?.[0] ?? null
}

export async function queryGraphicsByOids (layer: any, oids: any[]) {
  const valid = (oids || []).filter((o: any) => o != null)
  if (!valid.length) return []
  const fs = await layer.queryFeatures({
    objectIds: valid,
    outFields: ['*'],
    returnGeometry: true
  } as any)
  return fs?.features || []
}

export async function addBlueprints (layer: any, blueprints: any[]) {
  if (!blueprints?.length) return []
  const res = await layer.applyEdits({
    addFeatures: blueprints.map((b: any) => ({
      geometry: cloneGeometry(b.geometry),
      attributes: { ...(b.attributes || {}) }
    }))
  } as any)
  const oids = (res?.addFeatureResults || []).map((r: any) => r.objectId).filter((o: any) => o != null)
  return await queryGraphicsByOids(layer, oids)
}

export async function replaceFeatureSet (layer: any, currentGraphics: any[], targetBlueprints: any[]) {
  const source = (currentGraphics || []).filter(Boolean)
  const target = (targetBlueprints || []).filter(Boolean)
  const oidField = layer?.objectIdField || 'OBJECTID'

  if (source.length === 1 && target.length === 1) {
    const src = source[0]
    const oid = src?.attributes?.[oidField]
    if (oid != null) {
      await layer.applyEdits({
        updateFeatures: [{
          ...(target[0]?.geometry ? { geometry: cloneGeometry(target[0].geometry) } : {}),
          attributes: { ...(target[0]?.attributes || {}), [oidField]: oid }
        }]
      } as any)
      return await queryGraphicsByOids(layer, [oid])
    }
  }

  if (source.length) {
    await layer.applyEdits({ deleteFeatures: source } as any)
  }

  if (!target.length) return []
  return await addBlueprints(layer, target)
}
