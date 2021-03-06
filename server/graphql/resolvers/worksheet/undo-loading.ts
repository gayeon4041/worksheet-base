import { Bizplace } from '@things-factory/biz-base'
import { DeliveryOrder, OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Inventory, INVENTORY_TRANSACTION_TYPE } from '@things-factory/warehouse-base'
import { Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { generateInventoryHistory } from '../../../utils'

export const undoLoading = {
  async undoLoading(_: any, { deliveryOrder, palletIds }, context: any) {
    return await getManager().transaction(async trxMgr => {
      if (!deliveryOrder?.id) throw new Error(`There's no delivery order id`)
      const foundDO: DeliveryOrder = await trxMgr.getRepository(DeliveryOrder).findOne({
        where: { id: deliveryOrder.id },
        relations: ['bizplace', 'releaseGood']
      })
      const customerBizplace: Bizplace = foundDO.bizplace

      // 1. Find target inventories based on delivery order and status
      let targetInventories: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          deliveryOrder: foundDO,
          status: ORDER_INVENTORY_STATUS.LOADED
        },
        relations: ['inventory', 'releaseGood']
      })

      // 2. Filter out inventories which is included palletIds list.
      targetInventories = targetInventories
        .filter((targetInv: OrderInventory) => palletIds.includes(targetInv.inventory.palletId))
        .map((targetInv: OrderInventory) => {
          return {
            ...targetInv,
            deliveryOrder: null,
            status: ORDER_INVENTORY_STATUS.LOADING,
            updater: context.state.user
          }
        })

      // 3. Remove relation with Delivery Order
      await trxMgr.getRepository(OrderInventory).save(targetInventories)

      // 4. Check whethere there's more order inventories which is related with foundDO
      // 4. 1) If there's no more order inventories which is related with foundDO
      //       Remove delivery order
      const remainTargetInv: number = await trxMgr.getRepository(OrderInventory).count({
        where: {
          deliveryOrder: foundDO
        }
      })

      if (!remainTargetInv) await trxMgr.getRepository(DeliveryOrder).delete(foundDO.id)

      // 5. If there was remained items => Merge into previous order inventories
      await Promise.all(
        targetInventories.map(async (targetInv: OrderInventory) => {
          const prevTargetInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
            where: {
              id: Not(Equal(targetInv.id)),
              releaseGood: targetInv.releaseGood,
              status: ORDER_INVENTORY_STATUS.LOADING,
              inventory: targetInv.inventory
            }
          })

          if (prevTargetInv) {
            await trxMgr.getRepository(OrderInventory).save({
              ...prevTargetInv,
              releaseQty: targetInv.releaseQty + prevTargetInv.releaseQty,
              releaseWeight: targetInv.releaseWeight + prevTargetInv.releaseWeight,
              updater: context.state.user
            })
          }

          // 6. Create Inventory Hisotry
          let inventory: Inventory = targetInv.inventory
          inventory = await trxMgr.getRepository(Inventory).findOne({
            where: { id: inventory.id },
            relations: ['bizplace', 'product', 'warehouse', 'location']
          })

          await generateInventoryHistory(
            inventory,
            foundDO.releaseGood,
            INVENTORY_TRANSACTION_TYPE.UNDO_LOADING,
            0,
            0,
            context.state.user
          )

          // 7. If targetInv is merged into previous target inventory
          //    TERMINATE order inventory
          //    else
          //    Save order inventory
          if (prevTargetInv) {
            await trxMgr.getRepository(OrderInventory).save({
              ...targetInv,
              status: ORDER_INVENTORY_STATUS.TERMINATED,
              updater: context.state.user
            })

            await trxMgr.getRepository(WorksheetDetail).delete({
              targetInventory: targetInv.id,
              type: WORKSHEET_TYPE.LOADING,
              status: WORKSHEET_STATUS.DONE
            })
          } else {
            await trxMgr.getRepository(OrderInventory).save(targetInv)
            const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
              where: {
                targetInventory: targetInv,
                type: WORKSHEET_TYPE.LOADING,
                status: WORKSHEET_STATUS.DONE
              }
            })

            await trxMgr.getRepository(WorksheetDetail).save({
              ...worksheetDetail,
              status: WORKSHEET_STATUS.EXECUTING,
              updater: context.state.user
            })
          }
        })
      )
    })
  }
}
