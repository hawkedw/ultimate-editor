export function enableMiddleMousePan (view: any): () => void {
  const el = view?.container as HTMLElement
  if (!el) return () => {}

  let active = false, lx = 0, ly = 0, rafId = 0

  const down = (e: MouseEvent) => {
    if (e.button !== 1) return
    active = true; lx = e.clientX; ly = e.clientY; e.preventDefault()
  }
  const move = (e: MouseEvent) => {
    if (!active) return
    const dx = e.clientX - lx; const dy = e.clientY - ly
    lx = e.clientX; ly = e.clientY
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      if (!active) return
      const res = (view.resolution as number) || 1
      view.goTo({ center: [view.center.x - dx * res, view.center.y + dy * res] }, { animate: false })
        .catch(() => {})
    })
  }
  const up   = (e: MouseEvent) => { if (e.button === 1) { active = false; cancelAnimationFrame(rafId) } }
  const blur = () => { active = false; cancelAnimationFrame(rafId) }

  el.addEventListener('mousedown', down)
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
  window.addEventListener('blur', blur)

  return () => {
    active = false; cancelAnimationFrame(rafId)
    el.removeEventListener('mousedown', down)
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    window.removeEventListener('blur', blur)
  }
}
