export type PopupLayerState = { layer: any, popupEnabled?: boolean }

export type PopupViewState = {
  autoOpenEnabled?: boolean
  defaultPopupTemplateEnabled?: boolean
  layers: PopupLayerState[]
}

export function captureAndDisablePopups (view: any): PopupViewState {
  const state: PopupViewState = {
    autoOpenEnabled: view?.popup?.autoOpenEnabled,
    defaultPopupTemplateEnabled: view?.popup?.defaultPopupTemplateEnabled,
    layers: []
  }

  const arr = view?.map?.allLayers?.toArray?.() || []
  arr.forEach((l: any) => {
    try {
      if ('popupEnabled' in l) {
        state.layers.push({ layer: l, popupEnabled: l.popupEnabled })
        l.popupEnabled = false
      }
    } catch {}
  })

  try {
    if (view?.popup) {
      view.popup.autoOpenEnabled = false
      view.popup.defaultPopupTemplateEnabled = false
      view.popup.close?.()
    }
  } catch {}

  return state
}

export function disablePopupsForNewLayers (view: any, stateRef: { current: PopupViewState | null }) {
  const arr = view?.map?.allLayers?.toArray?.() || []
  const state = stateRef.current
  arr.forEach((l: any) => {
    try {
      if (!('popupEnabled' in l)) return
      const exists = !!state?.layers?.some(x => x.layer === l)
      if (!exists) state?.layers?.push({ layer: l, popupEnabled: l.popupEnabled })
      l.popupEnabled = false
    } catch {}
  })
}

export function restorePopups (view: any, state: PopupViewState | null) {
  try {
    if (view?.popup && state) {
      if (typeof state.autoOpenEnabled === 'boolean') view.popup.autoOpenEnabled = state.autoOpenEnabled
      if (typeof state.defaultPopupTemplateEnabled === 'boolean') view.popup.defaultPopupTemplateEnabled = state.defaultPopupTemplateEnabled
    }
  } catch {}

  ;(state?.layers || []).forEach(({ layer, popupEnabled }) => {
    try {
      if ('popupEnabled' in layer && typeof popupEnabled === 'boolean') layer.popupEnabled = popupEnabled
    } catch {}
  })
}
