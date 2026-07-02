import { React } from 'jimu-core'

export type DivideMethod = 'proportional' | 'equal'

export interface DivideSettings {
  method: DivideMethod
  azimuth: string
  plotCount: string
  plotArea: string
}

interface Props {
  layerTitle: string
  directionReady: boolean
  directionTool: 'pick-edge' | 'draw-line' | null
  onPickEdge: () => void
  onDrawDirection: () => void
  onSwitchDirection: () => void
  onCancel: () => void
  onSettingsChange: (settings: DivideSettings) => void
  onDivide: (settings: DivideSettings) => void
}

const parseOptionalNumber = (value: string) => {
  const clean = value.trim().replace(',', '.')
  if (!clean) return null
  const n = Number(clean)
  return Number.isFinite(n) ? n : NaN
}

const parseRequiredNumber = (value: string) => {
  const n = parseOptionalNumber(value)
  return n == null ? NaN : n
}

const DividePanel = ({
  layerTitle,
  directionReady,
  directionTool,
  onPickEdge,
  onDrawDirection,
  onSwitchDirection,
  onCancel,
  onSettingsChange,
  onDivide
}: Props) => {
  const [settings, setSettings] = React.useState<DivideSettings>({
    method: 'proportional',
    azimuth: '',
    plotCount: '',
    plotArea: ''
  })
  const [touched, setTouched] = React.useState(false)

  const patch = (p: Partial<DivideSettings>) => {
    setSettings(prev => ({ ...prev, ...p }))
  }

  React.useEffect(() => {
    onSettingsChange(settings)
  }, [settings, onSettingsChange])

  const azimuth = parseOptionalNumber(settings.azimuth)
  const plotCount = parseOptionalNumber(settings.plotCount)
  const plotArea = parseRequiredNumber(settings.plotArea)

  const azimuthOk = azimuth == null || (Number.isFinite(azimuth) && azimuth >= 0 && azimuth < 360)
  const countOk = plotCount == null || (Number.isInteger(plotCount) && plotCount > 1)
  const areaOk = settings.method !== 'equal' || (Number.isFinite(plotArea) && plotArea > 0)
  const basisReady = directionReady || (azimuth != null && azimuthOk)
  const formOk = basisReady && azimuthOk && countOk && areaOk

  const handleDivide = () => {
    setTouched(true)
    if (!formOk) return
    onDivide(settings)
  }

  return (
    <div className='ue-form-host ue-divide-panel'>
      <div className='ue-form-header'>
        <div className='ue-form-title'>{layerTitle}</div>
      </div>

      <div className='ue-form-body'>
        <div className='ue-divide-section'>
          <div className='ue-divide-label'>Метод</div>
          <div className='ue-divide-segments' role='radiogroup' aria-label='Метод разбиения'>
            <button
              type='button'
              className={'ue-divide-segment' + (settings.method === 'proportional' ? ' ue-divide-segment--active' : '')}
              onClick={() => { patch({ method: 'proportional' }) }}
            >
              Пропорциональные части
            </button>
            <button
              type='button'
              className={'ue-divide-segment' + (settings.method === 'equal' ? ' ue-divide-segment--active' : '')}
              onClick={() => { patch({ method: 'equal' }) }}
            >
              Равная площадь
            </button>
          </div>
        </div>

        <div className='ue-divide-grid'>
          <label className='ue-divide-field'>
            <span>Азимут</span>
            <input
              value={settings.azimuth}
              inputMode='decimal'
              placeholder='0-359'
              onChange={(e) => { patch({ azimuth: e.currentTarget.value }) }}
            />
          </label>

          <label className='ue-divide-field'>
            <span>Количество участков</span>
            <input
              value={settings.plotCount}
              inputMode='numeric'
              placeholder='Не задано'
              onChange={(e) => { patch({ plotCount: e.currentTarget.value }) }}
            />
          </label>

          {settings.method === 'equal' && (
            <label className='ue-divide-field ue-divide-field--wide'>
              <span>Площадь участка, га</span>
              <input
                value={settings.plotArea}
                inputMode='decimal'
                placeholder='Например 12,5'
                onChange={(e) => { patch({ plotArea: e.currentTarget.value }) }}
              />
            </label>
          )}
        </div>

        <div className='ue-divide-section'>
          <div className='ue-divide-label'>Направление</div>
          <div className='ue-divide-tools'>
            <button
              type='button'
              className={'ue-btn ue-btn--secondary' + (directionTool === 'pick-edge' ? ' ue-btn--active' : '')}
              onClick={onPickEdge}
            >
              Выбрать ребро
            </button>
            <button
              type='button'
              className={'ue-btn ue-btn--secondary' + (directionTool === 'draw-line' ? ' ue-btn--active' : '')}
              onClick={onDrawDirection}
            >
              Нарисовать линию
            </button>
            <button
              type='button'
              className='ue-btn ue-btn--secondary'
              onClick={onSwitchDirection}
              disabled={!directionReady}
            >
              Сменить направление
            </button>
          </div>
          <div className='ue-form-hint'>
            {directionReady
              ? 'Направление задано. Предпросмотр останется на карте, пока панель открыта.'
              : 'Выберите существующее ребро или нарисуйте линию направления на карте.'}
          </div>
        </div>

        <div className='ue-divide-footer'>
          <button type='button' className='ue-btn ue-btn--secondary' onClick={onCancel}>
            Отмена
          </button>
          <button type='button' className='ue-btn ue-btn--success' onClick={handleDivide}>
            Разбить
          </button>
        </div>

        {touched && !formOk && (
          <div className='ue-divide-error'>
            {!basisReady && <div>Задайте направление разбиения.</div>}
            {!azimuthOk && <div>Азимут должен быть числом от 0 до 359.</div>}
            {!countOk && <div>Количество участков должно быть целым числом больше 1.</div>}
            {!areaOk && <div>Для режима равной площади укажите площадь участка в гектарах.</div>}
          </div>
        )}
      </div>
    </div>
  )
}

export default DividePanel
