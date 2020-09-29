import { User } from '@things-factory/auth-base'
import { InventoryCheck, OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  Warehouse
} from '@things-factory/warehouse-base'
import { EntityManager, getManager, In } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { generateInventoryHistory, switchLocationStatus } from '../../../utils'

export const cycleCountAdjustmentResolver = {
  async cycleCountAdjustment(_: any, { cycleCountNo, cycleCountWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await cycleCountAdjustment(trxMgr, domain, user, cycleCountNo, cycleCountWorksheetDetails)
    })
  }
}

export async function cycleCountAdjustment(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  cycleCountNo: string,
  cycleCountWorksheetDetails: Partial<WorksheetDetail>[]
): Promise<void> {
  // get cycle count no
  const foundCC: InventoryCheck = await trxMgr.getRepository(InventoryCheck).findOne({
    where: {
      domain,
      name: cycleCountNo,
      status: ORDER_STATUS.PENDING_REVIEW
    }
  })

  // get cycle count wsd that is not tally
  const foundWSD: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
    where: {
      domain,
      name: In(cycleCountWorksheetDetails.map(wsd => wsd.name)),
      status: WORKSHEET_STATUS.NOT_TALLY
    },
    relations: [
      'targetInventory',
      'targetInventory.inventory',
      'targetInventory.inventory.location',
      'targetInventory.inspectedLocation',
      'targetInventory.inspectedLocation.warehouse'
    ]
  })

  // get order inventory
  await Promise.all(
    foundWSD.map(async (wsd: WorksheetDetail) => {
      const foundOI: OrderInventory = wsd.targetInventory
      const inventory: Inventory = foundOI.inventory

      const transactQty: number = foundOI.inspectedQty - inventory.qty
      const transactWeight: number = foundOI.inspectedWeight - inventory.weight

      const foundInspectedLoc: Location = foundOI.inspectedLocation
      const foundWarehouse: Warehouse = foundInspectedLoc.warehouse

      // new allocated location
      const allocatedItemCnt: number = await trxMgr.getRepository(Inventory).count({
        domain,
        status: INVENTORY_STATUS.STORED,
        location: foundInspectedLoc
      })

      // previous allocated location
      const prevLocItemCnt: number = await trxMgr.getRepository(Inventory).count({
        domain,
        status: INVENTORY_STATUS.STORED,
        location: inventory.location
      })

      if (foundOI.inspectedQty == 0) {
        // create inventory history
        await generateInventoryHistory(
          inventory,
          foundCC,
          INVENTORY_TRANSACTION_TYPE.ADJUSTMENT,
          transactQty,
          transactWeight,
          user,
          trxMgr
        )

        // change inventory qty to 0 and terminate it
        const terminatedInv: Inventory = await trxMgr.getRepository(Inventory).save({
          ...inventory,
          qty: foundOI.inspectedQty,
          lockedQty: 0,
          weight: foundOI.inspectedWeight,
          lockedWeight: 0,
          location: foundInspectedLoc,
          status: INVENTORY_STATUS.TERMINATED,
          updater: user
        })

        // create inventory history
        await generateInventoryHistory(
          terminatedInv,
          foundCC,
          INVENTORY_TRANSACTION_TYPE.TERMINATED,
          0,
          0,
          user,
          trxMgr
        )
      } else {
        if (inventory.location.name !== foundInspectedLoc.name) {
          if (!prevLocItemCnt) {
            // if no inventory at previous location, set status to empty
            await switchLocationStatus(domain, inventory.location, user, trxMgr)
          }

          if (!allocatedItemCnt) {
            // if no inventory, set status to stored
            await switchLocationStatus(domain, foundInspectedLoc, user, trxMgr)
          }
        }

        // change inventory qty
        const adjustedInv: Inventory = await trxMgr.getRepository(Inventory).save({
          ...inventory,
          qty: foundOI.inspectedQty,
          lockedQty: 0,
          weight: foundOI.inspectedWeight,
          lockedWeight: 0,
          location: foundInspectedLoc,
          warehouse: foundWarehouse,
          updater: user
        })

        // create inv history
        await generateInventoryHistory(
          adjustedInv,
          foundCC,
          INVENTORY_TRANSACTION_TYPE.ADJUSTMENT,
          transactQty,
          transactWeight,
          user,
          trxMgr
        )
      }

      await trxMgr.getRepository(OrderInventory).save({
        ...foundOI,
        status: ORDER_INVENTORY_STATUS.TERMINATED,
        updater: user
      })

      await trxMgr.getRepository(WorksheetDetail).save({
        ...wsd,
        status: WORKSHEET_STATUS.ADJUSTED,
        updater: user
      })
    })
  )

  // change cycle count status to DONE
  await trxMgr.getRepository(InventoryCheck).save({
    ...foundCC,
    status: ORDER_STATUS.DONE,
    updater: user
  })
}
