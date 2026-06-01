import Polygon from 'esri/geometry/Polygon'
import * as geometryEngine from 'esri/geometry/geometryEngine'
import type { DivideSettings } from '../components/DividePanel'

export interface DivideDirection {
  start: any
  end: any
  reversed: boolean
}

export interface DivideBuildResult {
  geometries: any[]
  direction: DivideDirection | null
}

interface Vec2 {
  x: number
  y: number
}

interface DivideBasis {
  d: Vec2
  n: Vec2
  minU: number
  maxU: number
  minV: number
  maxV: number
  pad: number
  spatialReference: any
}

const MIN_PART_AREA_HA = 0.0001
const MAX_AUTO_PARTS = 500

export function parseDivideNumber (value: string): number | null {
  const clean = String(value || '').trim().replace(',', '.')
  if (!clean) return null
  const n = Number(clean)
  return Number.isFinite(n) ? n : NaN
}

export function parseDivideCount (value: string): number | null {
  const n = parseDivideNumber(value)
  if (n == null) return null
  return Number.isInteger(n) && n > 1 ? n : NaN
}

export function normalizeDivideAreaHa (value: string): number {
  const n = parseDivideNumber(value)
  if (n == null || !Number.isFinite(n) || n <= 0) return NaN
  return Math.round(n * 100) / 100
}

function toXY (p: any): Vec2 {
  return Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p?.x), y: Number(p?.y) }
}

function dot (p: Vec2, v: Vec2): number {
  return p.x * v.x + p.y * v.y
}

function normalize (v: Vec2): Vec2 | null {
  const len = Math.sqrt(v.x * v.x + v.y * v.y)
  if (!Number.isFinite(len) || len <= 0) return null
  return { x: v.x / len, y: v.y / len }
}

function polygonPoints (polygon: any): Vec2[] {
  const out: Vec2[] = []
  for (const ring of (polygon?.rings || [])) {
    for (const p of ring || []) {
      const xy = toXY(p)
      if (Number.isFinite(xy.x) && Number.isFinite(xy.y)) out.push(xy)
    }
  }
  return out
}

function areaHa (geometry: any): number {
  if (!geometry) return 0
  try {
    const a = Number((geometryEngine as any).geodesicArea?.(geometry, 'hectares'))
    if (Number.isFinite(a)) return Math.abs(a)
  } catch {}
  try {
    const a = Number((geometryEngine as any).planarArea?.(geometry, 'hectares'))
    if (Number.isFinite(a)) return Math.abs(a)
  } catch {}
  return 0
}

function simplifyPolygon (geometry: any): any {
  if (!geometry) return null
  try { return (geometryEngine as any).simplify?.(geometry) || geometry } catch { return geometry }
}

function normalizePolygonResult (geometry: any): any {
  const candidates = (Array.isArray(geometry) ? geometry : [geometry])
    .map((g: any) => simplifyPolygon(g))
    .filter((g: any) => g?.type === 'polygon' && areaHa(g) > MIN_PART_AREA_HA)
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]
  try { return simplifyPolygon(geometryEngine.union(candidates as any)) } catch { return candidates[0] }
}

function directionFromAzimuth (azimuth: number): Vec2 | null {
  if (!Number.isFinite(azimuth)) return null
  const rad = (azimuth * Math.PI) / 180
  return normalize({ x: Math.sin(rad), y: Math.cos(rad) })
}

function directionFromLine (direction: DivideDirection | null): Vec2 | null {
  if (!direction?.start || !direction?.end) return null
  return normalize({
    x: Number(direction.end.x) - Number(direction.start.x),
    y: Number(direction.end.y) - Number(direction.start.y)
  })
}

function lineFromVector (polygon: any, d: Vec2, reversed: boolean): DivideDirection | null {
  const extent = polygon?.extent
  const center = extent?.center
  if (!center) return null
  const width = Number(extent.width || 0)
  const height = Number(extent.height || 0)
  const len = Math.max(width, height, 1)
  return {
    start: {
      x: Number(center.x) - d.x * len * 0.5,
      y: Number(center.y) - d.y * len * 0.5,
      spatialReference: polygon.spatialReference
    },
    end: {
      x: Number(center.x) + d.x * len * 0.5,
      y: Number(center.y) + d.y * len * 0.5,
      spatialReference: polygon.spatialReference
    },
    reversed
  }
}

export function resolveDivideDirection (
  polygon: any,
  settings: DivideSettings,
  pickedDirection: DivideDirection | null,
  reversedFallback = false
): DivideDirection | null {
  const azimuth = parseDivideNumber(settings.azimuth)
  if (azimuth != null && Number.isFinite(azimuth) && azimuth >= 0 && azimuth < 360) {
    const d = directionFromAzimuth(azimuth)
    return d ? lineFromVector(polygon, d, pickedDirection?.reversed ?? reversedFallback) : null
  }
  return pickedDirection
}

function buildBasis (polygon: any, direction: DivideDirection): DivideBasis | null {
  const d = directionFromLine(direction)
  if (!d) return null
  const sign = direction.reversed ? -1 : 1
  const n = { x: -d.y * sign, y: d.x * sign }
  const pts = polygonPoints(polygon)
  if (!pts.length) return null

  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const p of pts) {
    const u = dot(p, d)
    const v = dot(p, n)
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
    minV = Math.min(minV, v)
    maxV = Math.max(maxV, v)
  }

  if (![minU, maxU, minV, maxV].every(Number.isFinite) || maxV <= minV) return null
  const spanU = Math.max(maxU - minU, 1)
  const spanV = Math.max(maxV - minV, 1)
  const pad = Math.max(spanU, spanV) * 4
  return {
    d,
    n,
    minU: minU - pad,
    maxU: maxU + pad,
    minV: minV - pad * 0.001,
    maxV: maxV + pad * 0.001,
    pad,
    spatialReference: polygon.spatialReference
  }
}

function fromBasis (basis: DivideBasis, u: number, v: number): number[] {
  return [
    basis.d.x * u + basis.n.x * v,
    basis.d.y * u + basis.n.y * v
  ]
}

function stripPolygon (basis: DivideBasis, fromV: number, toV: number): any {
  const ring = [
    fromBasis(basis, basis.minU, fromV),
    fromBasis(basis, basis.maxU, fromV),
    fromBasis(basis, basis.maxU, toV),
    fromBasis(basis, basis.minU, toV),
    fromBasis(basis, basis.minU, fromV)
  ]
  return new Polygon({ rings: [ring], spatialReference: basis.spatialReference } as any)
}

function clipStrip (polygon: any, basis: DivideBasis, fromV: number, toV: number): any {
  if (!Number.isFinite(fromV) || !Number.isFinite(toV) || toV <= fromV) return null
  const strip = stripPolygon(basis, fromV, toV)
  try {
    return normalizePolygonResult(geometryEngine.intersect(polygon, strip))
  } catch {
    return null
  }
}

function cumulativeArea (polygon: any, basis: DivideBasis, toV: number): number {
  return areaHa(clipStrip(polygon, basis, basis.minV, toV))
}

function findCutForArea (polygon: any, basis: DivideBasis, targetAreaHa: number, lowV: number): number | null {
  let lo = lowV
  let hi = basis.maxV
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2
    const a = cumulativeArea(polygon, basis, mid)
    if (a < targetAreaHa) lo = mid
    else hi = mid
  }
  return Number.isFinite(hi) && hi > lowV ? hi : null
}

function buildPartsFromCuts (polygon: any, basis: DivideBasis, cuts: number[]): any[] {
  const ordered = [basis.minV, ...cuts.filter(Number.isFinite), basis.maxV]
  const parts: any[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const part = clipStrip(polygon, basis, ordered[i], ordered[i + 1])
    if (part && areaHa(part) > MIN_PART_AREA_HA) parts.push(part)
  }
  return parts
}

function buildProportionalParts (polygon: any, basis: DivideBasis, settings: DivideSettings): any[] {
  const totalArea = areaHa(polygon)
  const countRaw = parseDivideCount(settings.plotCount)
  const count = typeof countRaw === 'number' && Number.isFinite(countRaw) ? countRaw : 2
  if (!Number.isFinite(totalArea) || totalArea <= MIN_PART_AREA_HA || count < 2) return []

  const cuts: number[] = []
  let lowV = basis.minV
  for (let i = 1; i < count; i++) {
    const cut = findCutForArea(polygon, basis, (totalArea * i) / count, lowV)
    if (cut == null) break
    cuts.push(cut)
    lowV = cut
  }
  return buildPartsFromCuts(polygon, basis, cuts)
}

function buildEqualAreaParts (polygon: any, basis: DivideBasis, settings: DivideSettings): any[] {
  const totalArea = areaHa(polygon)
  const targetArea = normalizeDivideAreaHa(settings.plotArea)
  const countRaw = parseDivideCount(settings.plotCount)
  const limit = typeof countRaw === 'number' && Number.isFinite(countRaw) ? countRaw : MAX_AUTO_PARTS
  if (!Number.isFinite(totalArea) || totalArea <= MIN_PART_AREA_HA || !Number.isFinite(targetArea) || targetArea <= 0 || limit < 2) return []

  const cuts: number[] = []
  let lowV = basis.minV
  for (let i = 1; i < limit; i++) {
    const target = targetArea * i
    if (target >= totalArea - MIN_PART_AREA_HA) break
    const cut = findCutForArea(polygon, basis, target, lowV)
    if (cut == null) break
    cuts.push(cut)
    lowV = cut
  }

  return buildPartsFromCuts(polygon, basis, cuts)
}

export function buildDivideGeometries (
  polygon: any,
  settings: DivideSettings,
  pickedDirection: DivideDirection | null,
  reversedFallback = false
): DivideBuildResult {
  const cleanPolygon = simplifyPolygon(polygon)
  const direction = resolveDivideDirection(cleanPolygon, settings, pickedDirection, reversedFallback)
  if (!cleanPolygon || cleanPolygon?.type !== 'polygon' || !direction) return { geometries: [], direction }

  const basis = buildBasis(cleanPolygon, direction)
  if (!basis) return { geometries: [], direction }

  const geometries = settings.method === 'equal'
    ? buildEqualAreaParts(cleanPolygon, basis, settings)
    : buildProportionalParts(cleanPolygon, basis, settings)

  return {
    direction,
    geometries: geometries.filter((g) => g?.type === 'polygon' && areaHa(g) > MIN_PART_AREA_HA)
  }
}
