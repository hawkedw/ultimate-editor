import { React, type AllWidgetSettingProps, Immutable } from 'jimu-core'
import { MapWidgetSelector, SettingSection } from 'jimu-ui/advanced/setting-components'
import type { IMConfig } from '../config'

const EditorMap = React.lazy(() =>
  import('./components/editor-map').catch(() => ({
    default: () => React.createElement(
      'div',
      { style: { padding: 8, color: 'red', fontSize: 12 } },
      'Ошибка загрузки editor-map.tsx — проверь наличие файла в setting/components/'
    )
  }))
)

const translate = (key: string): string => ({
  layers: 'Слои',
  allLayers: 'Все слои',
  permissions: 'Разрешения',
  fields: 'Поля'
}[key] ?? key)

const Setting = (props: AllWidgetSettingProps<any>) => {
  const { config, onSettingChange, id } = props
  const mapWidgetId = (props.useMapWidgetIds as any)?.[0]

  const handleMapSelect = React.useCallback((ids: string[]) => {
    onSettingChange({ id, useMapWidgetIds: Immutable(ids) as any })
  }, [id, onSettingChange])

  return (
    <div>
      <SettingSection title=''>
        <div style={{ marginBottom: 8 }}>
          <MapWidgetSelector
            useMapWidgetIds={props.useMapWidgetIds}
            onSelect={handleMapSelect}
          />
        </div>

        {mapWidgetId
          ? (
            <React.Suspense fallback={<div style={{ padding: 8 }}>Загрузка…</div>}>
              <EditorMap
                widgetId={id}
                mapWidgetId={mapWidgetId}
                config={config as IMConfig}
                onConfigChange={(cfg) => onSettingChange({ id, config: cfg })}
                translate={translate}
              />
            </React.Suspense>
            )
          : (
            <div style={{ padding: 8, opacity: 0.8 }}>
              Выберите карту для настройки слоёв
            </div>
            )}
      </SettingSection>
    </div>
  )
}

export default Setting
