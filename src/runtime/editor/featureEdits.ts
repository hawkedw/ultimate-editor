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
