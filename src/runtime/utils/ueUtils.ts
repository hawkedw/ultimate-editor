import type FeatureLayer from 'esri/layers/FeatureLayer'
import type Graphic from 'esri/Graphic'
import type { IMConfig, LayerRule, FieldSetting } from '../../config'

export type GeomType = 'point' | 'polyline' | 'polygon'

export function layerKey(layer: __esri.Layer | null | undefined): string {
  const a: any = layer
  const url = (a?.url as string) || ''
  const lid = a?.layerId ?? a?.layer?.layerId
  const id = (a?.id as string) || ''
  const title = (a?.title as string) || ''
  if (id) return `id::${id}`
  if (url) return `${url}::${lid ?? title ?? 'layer'}`
  return `${title || 'layer'}::${lid ?? ''}`
}

export function isFeatureLayer(layer: any): layer is FeatureLayer {
  return !!layer && (layer.type === 'feature' || layer.declaredClass === 'esri.layers.FeatureLayer')
}

function layerServiceUrl(layer: any): string {
  return String(layer?.url || layer?.sourceJSON?.url || layer?.layerDefinition?.url || '').trim()
}

function isFeatureServerUrl(url: string): boolean {
  return /\/FeatureServer(?:\/|$)/i.test(url)
}

function isMapServerUrl(url: string): boolean {
  return /\/MapServer(?:\/|$)/i.test(url)
}

export function isCreatableFeatureAccessLayer(layer: any): layer is FeatureLayer {
  if (!isFeatureLayer(layer) || layer?.isTable) return false
  const url = layerServiceUrl(layer)
  if (!isFeatureServerUrl(url) || isMapServerUrl(url)) return false
  if (typeof layer?.applyEdits !== 'function') return false
  return canCreateByLayerCapabilities(layer)
}

export function oidField(layer: any): string {
  return (layer?.objectIdField as string) || 'OBJECTID'
}

function normUrl(url: any): string {
  return String(url ?? '').trim().replace(/\/+$/, '').toLowerCase()
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
  if (rule.id && id && rule.id === id) score += 200
  if (rule.url && url && normUrl(rule.url) === normUrl(url)) score += 100
  if (rule.id && url && normUrl(rule.id) === normUrl(url)) score += 90
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

function layerEditingEnabled(layer: any): boolean | undefined {
  return boolOrUndef(layer?.effectiveEditingEnabled) ?? boolOrUndef(layer?.editingEnabled)
}

function capabilityTokens(value: any): Set<string> | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return new Set(value.split(',').map(part => part.trim().toLowerCase()).filter(Boolean))
}

function capabilitiesAllowEditing(value: any): boolean | null {
  const tokens = capabilityTokens(value)
  if (!tokens) return null
  return tokens.has('editing')
}

function layerJsonAllowsEditing(json: any): boolean {
  if (!json) return true
  if (json?.editingEnabled === false) return false
  if (json?.layerDefinition?.editingEnabled === false) return false

  const checks = [
    capabilitiesAllowEditing(json?.capabilities),
    capabilitiesAllowEditing(json?.layerDefinition?.capabilities)
  ]
  return !checks.some(value => value === false)
}

function layerExplicitlyDisablesEditing(layer: any): boolean {
  return !layerJsonAllowsEditing(layer?.sourceJSON) || !layerJsonAllowsEditing(layer?.layerDefinition)
}

// ВАЖНО: supportsUpdate / supportsAdd / supportsDelete — это то, что нужно проверять.
export function canUpdateByLayerCapabilities(layer: any): boolean {
  const edit = layerEditingEnabled(layer)
  if (edit === false) return false
  if (layerExplicitlyDisablesEditing(layer)) return false

  const ops = getOps(layer)
  const su = boolOrUndef(ops?.supportsUpdate) ?? boolOrUndef(ops?.update)
  const se = boolOrUndef(ops?.supportsEditing) ?? boolOrUndef(ops?.edit)
  if (su !== undefined) return su
  if (se !== undefined) return se

  if (edit !== undefined) return edit

  return true
}

function geometryUpdateExplicitlyDisabled(layer: any): boolean {
  const effectiveEditing = layer?.effectiveCapabilities?.editing || null
  const editing = layer?.capabilities?.editing || null
  const effectiveOps = layer?.effectiveCapabilities?.operations || null
  const ops = layer?.capabilities?.operations || null
  const flags = [
    layer?.allowGeometryUpdates,
    layer?.sourceJSON?.allowGeometryUpdates,
    effectiveEditing?.supportsGeometryUpdate,
    effectiveEditing?.supportsGeometryUpdates,
    editing?.supportsGeometryUpdate,
    editing?.supportsGeometryUpdates,
    effectiveOps?.supportsGeometryUpdate,
    effectiveOps?.supportsGeometryUpdates,
    effectiveOps?.updateGeometry,
    effectiveOps?.geometryUpdate,
    ops?.supportsGeometryUpdate,
    ops?.supportsGeometryUpdates,
    ops?.updateGeometry,
    ops?.geometryUpdate
  ]

  return flags.some(flag => flag === false)
}

export function canUpdateGeometryByLayerCapabilities(layer: any): boolean {
  if (!canUpdateByLayerCapabilities(layer)) return false
  if (geometryUpdateExplicitlyDisabled(layer)) return false
  return true
}

export function canCreateByLayerCapabilities(layer: any): boolean {
  const edit = layerEditingEnabled(layer)
  if (edit === false) return false
  if (layerExplicitlyDisablesEditing(layer)) return false

  const ops = getOps(layer)
  const sa = boolOrUndef(ops?.supportsAdd) ?? boolOrUndef(ops?.supportsCreate) ?? boolOrUndef(ops?.create)
  if (sa !== undefined) return sa

  if (edit !== undefined) return edit

  return true
}

export function canDeleteByLayerCapabilities(layer: any): boolean {
  const edit = layerEditingEnabled(layer)
  if (edit === false) return false
  if (layerExplicitlyDisablesEditing(layer)) return false

  const ops = getOps(layer)
  const sd = boolOrUndef(ops?.supportsDelete) ?? boolOrUndef(ops?.delete)
  if (sd !== undefined) return sd

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
  const capGeomUpdate = canUpdateGeometryByLayerCapabilities(layer)
  const capDelete = canDeleteByLayerCapabilities(layer)

  const allowCreate = (r?.allowCreate ?? capCreate) && capCreate
  const allowUpdate = (r?.allowUpdate ?? capUpdate) && capUpdate
  const allowDelete = (r?.allowDelete ?? capDelete) && capDelete

  const allowAttrUpdate = (r?.allowAttrUpdate ?? allowUpdate) && allowUpdate
  const allowGeomUpdate = (r?.allowGeomUpdate ?? allowUpdate) && allowUpdate && capGeomUpdate

  return { ...r, id: r?.id ?? '', allowCreate, allowUpdate, allowAttrUpdate, allowGeomUpdate, allowDelete }
}

function toPlainFields(rawFields: any): FieldSetting[] {
  if (!rawFields) return []
  if (typeof rawFields.asMutable === 'function') return rawFields.asMutable({ deep: true }) as FieldSetting[]
  if (Array.isArray(rawFields)) return rawFields as FieldSetting[]
  return []
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
