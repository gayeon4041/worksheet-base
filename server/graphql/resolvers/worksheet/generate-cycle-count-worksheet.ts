import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  generateCycleCount,
  InventoryCheck,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, getManager, Not, IsNull } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const generateCycleCountWorksheetResolver = {
  async generateCycleCountWorksheet(_: any, { executionDate, customerId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await generateCycleCountWorksheet(trxMgr, domain, user, executionDate, customerId)
    })
  }
}

export async function generateCycleCountWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  executionDate: string,
  customerId: string
): Promise<Worksheet> {
  const existingWorksheetCnt: number = await trxMgr.getRepository(Worksheet).count({
    where: { domain, type: WORKSHEET_TYPE.CYCLE_COUNT, status: Not(WORKSHEET_STATUS.DONE) }
  })

  if (existingWorksheetCnt) {
    throw new Error(`Unfinished cycle count worksheet exists.`)
  }

  const cycleCount: InventoryCheck = await generateCycleCount(trxMgr, domain, user, executionDate, customerId)
  // Find out warehouse and customer bizplace
  const customerBizplace: Bizplace = await trxMgr.getRepository(Bizplace).findOne(customerId)

  // Find out inventories which is target for cycle counting
  let inventories: Inventory[] = await trxMgr.getRepository(Inventory).find({
    where: [
      { domain, bizplace: customerBizplace, status: INVENTORY_STATUS.STORED, lockedQty: IsNull },
      { domain, bizplace: customerBizplace, status: INVENTORY_STATUS.STORED, lockedQty: 0 }
    ]
  })

  if (!inventories.length) {
    throw new Error(`Faield to find inventories`)
  }

  // generate order inventory mapping with inventory ID
  let targetInventories: OrderInventory[] = []
  if (!targetInventories.length)
    for (const inventory of inventories) {
      let targetInventory: OrderInventory = new OrderInventory()
      targetInventory.domain = domain
      targetInventory.bizplace = customerBizplace
      targetInventory.status = ORDER_INVENTORY_STATUS.PENDING
      targetInventory.name = OrderNoGenerator.orderInventory()
      targetInventory.inventoryCheck = cycleCount
      targetInventory.releaseQty = 0
      targetInventory.releaseWeight = 0
      targetInventory.inventory = inventory
      targetInventory.creator = user
      targetInventory.updater = user

      targetInventories.push(targetInventory)
    }
  targetInventories = await trxMgr.getRepository(OrderInventory).save(targetInventories)

  // // set a locked qty at all inventory
  inventories.forEach((inventory: Inventory) => {
    inventory.lockedQty = inventory.qty
    inventory.lockedWeight = inventory.weight
    inventory.updater = user
  })
  await trxMgr.getRepository(Inventory).save(inventories)

  // create cycle count worksheet
  let cycleCountWorksheet: Worksheet = new Worksheet()
  cycleCountWorksheet.domain = domain
  cycleCountWorksheet.bizplace = customerBizplace
  cycleCountWorksheet.name = WorksheetNoGenerator.cycleCount()
  cycleCountWorksheet.inventoryCheck = cycleCount
  cycleCountWorksheet.type = WORKSHEET_TYPE.CYCLE_COUNT
  cycleCountWorksheet.status = WORKSHEET_STATUS.DEACTIVATED
  cycleCountWorksheet.creator = user
  cycleCountWorksheet.updater = user
  cycleCountWorksheet = await trxMgr.getRepository(Worksheet).save(cycleCountWorksheet)

  let cycleCountWorksheetDetails: WorksheetDetail[] = []
  for (const targetInventory of targetInventories) {
    let cycleCountWorksheetDetail: WorksheetDetail = new WorksheetDetail()
    cycleCountWorksheetDetail.domain = domain
    cycleCountWorksheetDetail.bizplace = customerBizplace
    cycleCountWorksheetDetail.worksheet = cycleCountWorksheet
    cycleCountWorksheetDetail.name = WorksheetNoGenerator.cycleCountDetail()
    cycleCountWorksheetDetail.targetInventory = targetInventory
    cycleCountWorksheetDetail.type = WORKSHEET_TYPE.CYCLE_COUNT
    cycleCountWorksheetDetail.status = WORKSHEET_STATUS.DEACTIVATED
    cycleCountWorksheetDetail.creator = user
    cycleCountWorksheetDetail.updater = user

    cycleCountWorksheetDetails.push(cycleCountWorksheetDetail)
  }
  cycleCountWorksheetDetails = await trxMgr.getRepository(WorksheetDetail).save(cycleCountWorksheetDetails)

  cycleCountWorksheet.worksheetDetails = cycleCountWorksheetDetails
  return cycleCountWorksheet
}
