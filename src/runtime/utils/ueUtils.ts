import type FeatureLayer from 'esri/layers/FeatureLayer'
import type Graphic from 'esri/Graphic'
import type Field from 'esri/layers/support/Field'
import type { IMConfig, LayerRule, FieldSetting } from '../../config'

export type GeomType = 'point' | 'polyline' | 'polygon'

export function layerKey(layer: __esri.Layer | null | undefined): string {
  const a: any = layer
  const url = (a?.url as string) || ''
  const lid = a?.layerId ?? a?.layer?.layerId
  const id = (a?.id as string) || ''
  const title = (a?.title as string) || ''
  if (url) return `${url}::${lid ?? id ?? title ?? 'layer'}`
  return `${id || title || 'layer'}::${lid ?? ''}`
}

export function isFeatureLayer(layer: any): layer is FeatureLayer {
  return !!layer && (layer.type === 'feature' || layer.declaredClass === 'esri.layers.FeatureLayer')
}

export function oidField(layer: any): string {
  return (layer?.objectIdField as string) || 'OBJECTID'
}

export function getGraphicOid(g: Graphic): number | null {
  const a: any = g
  const f = oidField(a?.layer)
  const v = a?.attributes?.[f]
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN)
  return Number.isFinite(n) ? n : null
}

export function normalizeGeomType(esriGeomType: string | null | undefined): GeomType | null {
  if (!esriGeomType) return null
  if (esriGeomType === 'point' || esriGeomType === 'multipoint') return 'point'
  if (esriGeomType === 'polyline') return 'polyline'
  if (esriGeomType === 'polygon') return 'polygon'
  return null
}

function ruleMatchScore(rule: LayerRule, layer: any): number {
  const url = (layer?.url as string) || ''
  const id = (layer?.id as string) || ''
  const title = (layer?.title as string) || ''
  let score = 0
  if (rule.url && url && rule.url === url) score += 100
  if (rule.id && id && rule.id === id) score += 50
  if (rule.title && title && rule.title === title) score += 10
  return score
}

export function findRule(cfg: IMConfig | undefined, layer: any): LayerRule | null {
  const rules = (cfg?.layers as any as LayerRule[]) || []
  if (!rules.length) return null
  let best: LayerRule | null = null
  let bestScore = 0
  for (const r of rules) {
    const s = ruleMatchScore(r, layer)
    if (s > bestScore) { bestScore = s; best = r }
  }
  return bestScore > 0 ? best : null
}

function getOps(layer: any): any {
  return layer?.effectiveCapabilities?.operations || layer?.capabilities?.operations || null
}

function boolOrUndef(v: any): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

// ВАЖНО: supportsUpdate / supportsAdd / supportsDelete — это то, что нужно проверять.
export function canUpdateByLayerCapabilities(layer: any): boolean {
  const ops = getOps(layer)
  const su = boolOrUndef(ops?.supportsUpdate) ?? boolOrUndef(ops?.update)
  const se = boolOrUndef(ops?.supportsEditing) ?? boolOrUndef(ops?.edit)
  if (su !== undefined) return su
  if (se !== undefined) return se

  const edit = boolOrUndef(layer?.editingEnabled)
  if (edit !== undefined) return edit

  return true
}

export function canCreateByLayerCapabilities(layer: any): boolean {
  const ops = getOps(layer)
  const sa = boolOrUndef(ops?.supportsAdd) ?? boolOrUndef(ops?.supportsCreate) ?? boolOrUndef(ops?.create)
  if (sa !== undefined) return sa

  const edit = boolOrUndef(layer?.editingEnabled)
  if (edit !== undefined) return edit

  return true
}

export function canDeleteByLayerCapabilities(layer: any): boolean {
  const ops = getOps(layer)
  const sd = boolOrUndef(ops?.supportsDelete) ?? boolOrUndef(ops?.delete)
  if (sd !== undefined) return sd

  const edit = boolOrUndef(layer?.editingEnabled)
  if (edit !== undefined) return edit

  return true
}

/**
 * cfg может запрещать, но НЕ может разрешить то, чего нет в capabilities.
 */
export function resolveRuleEffective(cfg: IMConfig | undefined, layer: any): LayerRule {
  const r = findRule(cfg, layer)

  const capCreate = canCreateByLayerCapabilities(layer)
  const capUpdate = canUpdateByLayerCapabilities(layer)
  const capDelete = canDeleteByLayerCapabilities(layer)

  const allowCreate = (r?.allowCreate ?? capCreate) && capCreate
  const allowUpdate = (r?.allowUpdate ?? capUpdate) && capUpdate
  const allowDelete = (r?.allowDelete ?? capDelete) && capDelete

  const allowAttrUpdate = (r?.allowAttrUpdate ?? allowUpdate) && allowUpdate
  const allowGeomUpdate = (r?.allowGeomUpdate ?? allowUpdate) && allowUpdate

  return { ...r, id: r?.id ?? '', allowCreate, allowUpdate, allowAttrUpdate, allowGeomUpdate, allowDelete }
}

function toPlainFields(rawFields: any): FieldSetting[] {
  if (!rawFields) return []
  if (typeof rawFields.asMutable === 'function') return rawFields.asMutable({ deep: true }) as FieldSetting[]
  if (Array.isArray(rawFields)) return rawFields as FieldSetting[]
  return []
}

export function buildFieldConfig(layer: any, rule: LayerRule): __esri.FieldConfig[] | null {
  const fs = toPlainFields((rule as any).fields)
  if (!fs.length) return null

  const layerFields: Field[] = (layer?.fields as any) || []
  const layerFieldNames = new Set(layerFields.map((f: any) => f.name))
  const layerEditable: boolean = rule.allowAttrUpdate !== false

  const out: __esri.FieldConfig[] = []
  for (const f of fs) {
    if (!f?.name) continue
    if (!layerFieldNames.has(f.name)) continue

    const isVisible = f.visible !== false && (f as any).visible !== 'false'
    if (!isVisible) continue

    out.push({
      name: f.name,
      label: f.label,
      editable: layerEditable && f.editable !== false && (f as any).editable !== 'false',
      required: !!(f as any).required
    } as any)
  }

  return out.length ? out : null
}

export function applyDefaultValues(rule: LayerRule): Record<string, any> {
  const fs = toPlainFields((rule as any).fields)
  const out: Record<string, any> = {}
  for (const f of fs) {
    if (!f?.name) continue
    const val = (f as any).defaultValue
    if (val === undefined || val === null || val === '') continue
    if ((f as any).defaultIsArcade) continue
    out[f.name] = val
  }
  return out
}

export async function applyArcadeDefaults(
  rule: LayerRule,
  layer: any,
  graphic: any
): Promise<Record<string, any>> {
  const fs = toPlainFields((rule as any).fields)
  const arcadeFields = fs.filter(f => f?.name && (f as any).defaultIsArcade && (f as any).defaultValue)
  if (!arcadeFields.length) return {}

  let arcade: any
  try {
    const [mod] = await (window as any).__arcgisRequire?.(['esri/arcade']) ?? [null]
    arcade = mod
  } catch { return {} }
  if (!arcade) return {}

  const out: Record<string, any> = {}
  for (const f of arcadeFields) {
    try {
      const profile = arcade.createArcadeProfile('form-calculation')
      const executor = await arcade.createArcadeExecutor((f as any).defaultValue, profile)
      const result = executor.execute({ $feature: graphic, $layer: layer })
      if (result !== undefined && result !== null) out[f.name] = result
    } catch (e) {
      console.warn(`[UE] arcade default eval failed for field ${f.name}:`, e)
    }
  }
  return out
}
