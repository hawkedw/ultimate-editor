import { React } from 'jimu-core'

interface Props {
  title: string
  text: string
  onCancel: () => void
}

const ModeNoticePanel = ({ title, text, onCancel }: Props) => (
  <div className='ue-idle-panel'>
    <div className='ue-create-mode'>
      <div>
        <div className='ue-create-mode__title'>{title}</div>
        <div className='ue-create-mode__text'>{text}</div>
      </div>
      <button type='button' className='ue-btn ue-btn--secondary ue-btn--sm' onClick={onCancel}>
        Отмена
      </button>
    </div>
  </div>
)

export default ModeNoticePanel
