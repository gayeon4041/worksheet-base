import { activateCycleCount } from './activate-cycle-count'
import { activateLoadingResolver } from './activate-loading'
import { activatePickingResolver } from './activate-picking'
import { activatePutawayResolver } from './activate-putaway'
import { activateReturnResolver } from './activate-return'
import { activateUnloadingResolver } from './activate-unloading'
import { activateVasResolver } from './activate-vas'
import { assignVasInventoriesResolver } from './assign-vas-inventories'
import { completeInspection } from './complete-inspection'
import { completeLoading } from './complete-loading'
import { completePicking } from './complete-picking'
import { completePreunload } from './complete-preunload'
import { completePutaway } from './complete-putaway'
import { completeReturn } from './complete-return'
import { completeUnloading } from './complete-unloading'
import { completeUnloadingPartiallyResolver } from './complete-unloading-partially'
import { completeVas } from './complete-vas'
import { confirmCancellationReleaseOrder } from './confirm-cancellation-release-order'
import { createWorksheet } from './create-worksheet'
import { crossDockPickingResolver } from './cross-dock-picking'
import { cycleCountAdjustment } from './cycle-count-adjustment'
import { cycleCountWorksheetResolver } from './cycle-count-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { deliveryOrderByWorksheetResolver } from './delivery-order-by-worksheet'
import { editBatchNo } from './edit-batch-no'
import { executeVasResolver } from './execute-vas'
import { Mutation as GenerateWorksheetMutations } from './generate-worksheet'
import { havingVasResolver } from './having-vas'
import { inspecting } from './inspecting'
import { inventoriesByPalletResolver } from './inventories-by-pallet'
import { loadedInventories } from './loaded-inventories'
import { loading } from './loading'
import { loadingWorksheetResolver } from './loading-worksheet'
import { pendingCancellationReleaseOrder } from './pending-cancellation-release-order'
import { picking } from './picking'
import { pickingWorksheetResolver } from './picking-worksheet'
import { preunload } from './preunload'
import { preunloadWorksheetResolver } from './preunload-worksheet'
import { proceedEditedBatchResolver } from './proceed-edited-batch'
import { proceedExtraProductsResolver } from './proceed-extra-products'
import { putaway } from './putaway'
import { putawayWorksheetResolver } from './putaway-worksheet'
import { rejectCancellationReleaseOrder } from './reject-cancellation-release-order'
import { replacePickingPalletsResolver } from './replace-picking-pallets'
import { returnWorksheetResolver } from './return-worksheet'
import { returning } from './returning'
import { submitAdjustmentForApprovalResolver } from './submit-adjustment-for-approval'
import { transfer } from './transfer'
import { undoInspection } from './undo-inspection'
import { undoLoading } from './undo-loading'
import { undoPickingAssigmentResolver } from './undo-picking-assignment'
import { undoPreunload } from './undo-preunload'
import { undoPutaway } from './undo-putaway'
import { undoUnloading } from './undo-unloading'
import { undoVas } from './undo-vas'
import { unload } from './unload'
import { unloadedInventories } from './unloaded-inventories'
import { unloadingWorksheetResolver } from './unloading-worksheet'
import { updateWorksheet } from './update-worksheet'
import { vasCandidatesResolver } from './vas-candidates'
import {
  checkRelabelableResolver,
  relabelingResolver,
  repackagingResolver,
  repalletizingResolver,
  undoRelabelingResolver,
  undoRepackagingResolver,
  undoRepalletizingResolver
} from './vas-transactions'
import { vasWorksheetResolver } from './vas-worksheet'
import { worksheetResolver } from './worksheet'
import { worksheetByOrderNoResolver } from './worksheet-by-order-no'
import { worksheetsResolver } from './worksheets'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver,
  ...unloadingWorksheetResolver,
  ...preunloadWorksheetResolver,
  ...deliveryOrderByWorksheetResolver,
  ...putawayWorksheetResolver,
  ...returnWorksheetResolver,
  ...pickingWorksheetResolver,
  ...cycleCountWorksheetResolver,
  ...vasWorksheetResolver,
  ...loadingWorksheetResolver,
  ...unloadedInventories,
  ...loadedInventories,
  ...vasCandidatesResolver,
  ...inventoriesByPalletResolver,
  ...checkRelabelableResolver,
  ...havingVasResolver,
  ...worksheetByOrderNoResolver
}

export const Mutation = {
  ...GenerateWorksheetMutations,
  ...updateWorksheet,
  ...createWorksheet,
  ...cycleCountAdjustment,
  ...deleteWorksheet,
  ...activateUnloadingResolver,
  ...activatePutawayResolver,
  ...activateLoadingResolver,
  ...activateReturnResolver,
  ...activateVasResolver,
  ...activatePickingResolver,
  ...activateCycleCount,
  ...completeInspection,
  ...editBatchNo,
  ...proceedEditedBatchResolver,
  ...preunload,
  ...completePreunload,
  ...undoPreunload,
  ...unload,
  ...returning,
  ...undoUnloading,
  ...undoPutaway,
  ...undoInspection,
  ...completeUnloading,
  ...completeUnloadingPartiallyResolver,
  ...completeLoading,
  ...completeReturn,
  ...putaway,
  ...loading,
  ...undoLoading,
  ...transfer,
  ...inspecting,
  ...completePutaway,
  ...picking,
  ...completePicking,
  ...executeVasResolver,
  ...undoVas,
  ...completeVas,
  ...proceedExtraProductsResolver,
  ...replacePickingPalletsResolver,
  ...pendingCancellationReleaseOrder,
  ...confirmCancellationReleaseOrder,
  ...rejectCancellationReleaseOrder,
  ...submitAdjustmentForApprovalResolver,
  ...assignVasInventoriesResolver,
  ...repalletizingResolver,
  ...undoRepalletizingResolver,
  ...repackagingResolver,
  ...undoRepackagingResolver,
  ...relabelingResolver,
  ...undoRelabelingResolver,
  ...undoPickingAssigmentResolver,
  ...crossDockPickingResolver
}
