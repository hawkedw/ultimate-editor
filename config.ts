import type { ImmutableObject } from 'jimu-core'

export interface FieldSetting {
  name: string
  label: string
  visible: boolean
  editable: boolean
  required?: boolean
  defaultValue?: string
  defaultIsArcade?: boolean
}

export interface LayerRule {
  id: string
  url?: string
  title?: string
  allowCreate: boolean
  allowUpdate: boolean
  allowAttrUpdate: boolean
  allowGeomUpdate: boolean
  allowDelete?: boolean
  fields?: FieldSetting[]
}

export interface Config {
  mapWidgetId?: string
  layers: LayerRule[]
}

export type IMConfig = ImmutableObject<Config>

export const defaultConfig: Config = {
  layers: []
}
