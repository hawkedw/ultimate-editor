// src/widgets/ultimate-editor/src/runtime/components/EditorPanel.tsx
import { React } from 'jimu-core'
import type { IMConfig } from '../../config'
import BatchEditPanel from './BatchEditPanel'
import FeatureTemplatesPanel from './FeatureTemplatesPanel'
import { resolveRuleEffective } from '../utils/ueUtils'
import type { SelItem } from '../editor/useSelection'

interface Props {
  cfg: IMConfig
  view: __esri.MapView | __esri.SceneView | null
  editableLayers: __esri.FeatureLayer[]
  selectedItems: SelItem[]
  onStartCreate: (layer: __esri.FeatureLayer, template: __esri.FeatureTemplate) => void
  clearSelection: () => void
  onRequestDelete?: () => void
  deleteConfirm?: boolean
  onCancelDelete?: () => void
  onConfirmDelete?: () => void
}

const EditorPanel = ({
  cfg,
  view,
  editableLayers,
  selectedItems,
  onStartCreate,
  clearSelection,
  onRequestDelete,
  deleteConfirm,
  onCancelDelete,
  onConfirmDelete
}: Props) => {
  const layer = selectedItems[0]?.layer as any
  const rule  = React.useMemo(
    () => (layer ? resolveRuleEffective(cfg, layer) : null),
    [cfg, layer]
  )

  const canEdit   = (rule as any)?.allowAttrUpdate !== false
  const canDelete = (rule as any)?.allowDelete     !== false
  const showBatch = selectedItems.length > 0 && (canEdit || canDelete)

  return (
    <div className='ue-editor-panel'>
      <FeatureTemplatesPanel
        view={view}
        layers={editableLayers as any}
        onSelectTemplate={onStartCreate as any}
        visible={true}
      />

      {showBatch && (
        <BatchEditPanel
          items={selectedItems}
          cfg={cfg}
          onDeleted={clearSelection}
          onCancel={clearSelection}
          onRequestDelete={onRequestDelete}
          deleteConfirm={deleteConfirm}
          onCancelDelete={onCancelDelete}
          onConfirmDelete={onConfirmDelete}
        />
      )}
    </div>
  )
}

export default EditorPanel
