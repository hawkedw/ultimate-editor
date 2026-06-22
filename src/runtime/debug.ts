export const isDebugEnabled = () => (window as any).__UE_DEBUG === true

export const dlog = (...args: any[]) => {
  if (isDebugEnabled()) console.log(...args)
}

export const dwarn = (...args: any[]) => {
  if (isDebugEnabled()) console.warn(...args)
}

export const dgroup = (title: string) => {
  if (isDebugEnabled()) console.groupCollapsed(title)
}

export const dgroupEnd = () => {
  if (isDebugEnabled()) console.groupEnd()
}

export interface UltimateEditorPerfContext {
  id: string
  startedAt: number
  lastAt: number
  marks: { [key: string]: number }
  data?: { [key: string]: any }
}

let perfSeq = 0
const perfContextByObject = new WeakMap<object, UltimateEditorPerfContext>()

export const perfNow = () => {
  try { return window.performance?.now?.() ?? Date.now() } catch { return Date.now() }
}

function roundMs (value: number): number {
  return Math.round(value * 10) / 10
}

export function perfStart (event: string, data: { [key: string]: any } = {}): UltimateEditorPerfContext {
  const now = perfNow()
  const ctx: UltimateEditorPerfContext = {
    id: `${Date.now().toString(36)}-${++perfSeq}`,
    startedAt: now,
    lastAt: now,
    marks: { [event]: now },
    data
  }
  console.info('ULTIMATE_EDITOR_PERF', event, {
    id: ctx.id,
    elapsedMs: 0,
    deltaMs: 0,
    ...data
  })
  return ctx
}

export function perfLog (ctx: UltimateEditorPerfContext | null | undefined, event: string, data: { [key: string]: any } = {}) {
  if (!ctx) return
  const now = perfNow()
  const previous = ctx.lastAt || ctx.startedAt
  ctx.marks[event] = now
  ctx.lastAt = now
  console.info('ULTIMATE_EDITOR_PERF', event, {
    id: ctx.id,
    elapsedMs: roundMs(now - ctx.startedAt),
    deltaMs: roundMs(now - previous),
    ...ctx.data,
    ...data
  })
}

export function perfAttach (target: any, ctx: UltimateEditorPerfContext | null | undefined) {
  if (!target || typeof target !== 'object' || !ctx) return
  try { perfContextByObject.set(target, ctx) } catch {}
}

export function perfGet (target: any): UltimateEditorPerfContext | null {
  if (!target || typeof target !== 'object') return null
  try { return perfContextByObject.get(target) ?? null } catch { return null }
}
