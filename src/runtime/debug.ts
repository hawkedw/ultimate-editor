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
