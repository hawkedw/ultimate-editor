import { cloneGeometry, sanitizeAttrsForAdd } from './featureEdits'

function snapshotGraphic (layer: any, g: any) {
  if (!g) return null
  return {
    geometry: cloneGeometry(g.geometry),
    attributes: sanitizeAttrsForAdd(layer, { ...(g.attributes || {}) })
  }
}

export function makeHistoryEntry (layer: any, beforeGraphics: any[], afterGraphics: any[], label: string) {
  const before = (beforeGraphics || []).map((g: any) => snapshotGraphic(layer, g)).filter(Boolean)
  const after = (afterGraphics || []).map((g: any) => snapshotGraphic(layer, g)).filter(Boolean)
  return {
    layer,
    label,
    before,
    after,
    currentBefore: beforeGraphics || [],
    currentAfter: afterGraphics || []
  }
}
