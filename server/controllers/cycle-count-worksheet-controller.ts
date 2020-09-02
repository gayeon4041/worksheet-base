import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  InventoryCheck,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import { BasicInterface, WorksheetController } from './worksheet-controller'

export interface GenerateCycleCountInterface extends BasicInterface {
  cycleCountNo: string
  inventories: Inventory[]
}

export interface ActivateCycleCountInterface extends BasicInterface {
  worksheetNo: string
}

export interface CompleteCycleCountInterface extends BasicInterface {
  inventoryCheckNo: string
}

export class CycleCountWorksheetController extends WorksheetController {
  /**
   * @summary Generate Cycle Count Worksheet
   * @description
   * Create cycle count worksheet
   *  - status: DEACTIVATED
   *
   * Update inventories to lock qty & weight
   *
   * Create order inventories
   *  - status: PENDING
   *
   * Create cycle count worksheet details
   *  - status: DEACTIVATED
   *
   * @param {GenerateCycleCountInterface} worksheetInterface
   * @returns {Promise<Worksheet>}
   */
  async generateCycleCountWorksheet(worksheetInterface: GenerateCycleCountInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user

    const cycleCount: InventoryCheck = await this.findRefOrder(
      InventoryCheck,
      {
        domain,
        name: worksheetInterface.cycleCountNo,
        status: ORDER_STATUS.PENDING
      },
      ['bizplace']
    )

    const bizplace: Bizplace = cycleCount.bizplace

    let inventories: Inventory[] = worksheetInterface.inventories
    if (inventories.some((inv: Inventory) => !(inv instanceof Inventory))) {
      const palletIds: string[] = inventories.map((inv: Inventory) => inv.palletId)
      inventories = await this.trxMgr.getRepository(Inventory).find({
        where: { domain, palletId: In(palletIds), status: INVENTORY_STATUS.STORED }
      })
    }

    /* Update inventories to lock up available qty & weight */
    inventories.forEach((inv: Inventory) => {
      inv.lockedQty = inv.qty
      inv.lockedWeight = inv.weight
      inv.updater = user
    })
    inventories = await this.trxMgr.getRepository(Inventory).save(inventories)

    let targetInventories: OrderInventory[] = inventories.map((inventory: Inventory) => {
      return {
        domain,
        bizplace,
        status: ORDER_INVENTORY_STATUS.PENDING,
        name: OrderNoGenerator.orderInventory(),
        InventoryCheck: cycleCount,
        releaseQty: 0,
        releaseWeight: 0,
        inventory,
        creator: user,
        updater: user
      }
    })
    targetInventories = await this.trxMgr.getRepository(OrderInventory).save(targetInventories)

    return await this.generateWorksheet(
      domain,
      user,
      WORKSHEET_TYPE.CYCLE_COUNT,
      cycleCount,
      targetInventories,
      cycleCount.status,
      ORDER_INVENTORY_STATUS.PENDING
    )
  }

  async activateCycleCount(worksheetInterface: ActivateCycleCountInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    const worksheetNo: string = worksheetInterface.worksheetNo
    const worksheet: Worksheet = await this.findActivatableWorksheet(domain, worksheetNo, WORKSHEET_TYPE.CYCLE_COUNT, [
      'inventoryCheck',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
      targetInventory.updater = user
      return targetInventory
    })

    let cycleCount: InventoryCheck = worksheet.inventoryCheck
    cycleCount.status = ORDER_STATUS.INSPECTING
    cycleCount.updater = user
    await this.updateRefOrder(cycleCount)
    await this.updateOrderTargets(targetInventories)
    return await this.activateWorksheet(worksheet, worksheetDetails, [], user)
  }

  async completeCycleCount(worksheetInterface: CompleteCycleCountInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    const inventoryCheckNo: string = worksheetInterface.inventoryCheckNo

    const inventoryCheck: InventoryCheck = await this.findRefOrder(InventoryCheck, {
      domain,
      name: inventoryCheckNo,
      status: ORDER_STATUS.INSPECTING
    })

    let worksheet: Worksheet = await this.findWorksheetByRefOrder(domain, inventoryCheck, WORKSHEET_TYPE.CYCLE_COUNT, [
      'worksheetDetails',
      'worksheetDetails.targetInventory',
      'worksheetDetails.targetInventory.inventory'
    ])
    this.checkWorksheetValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    let targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)
    const notTallyWorksheetDetails: WorksheetDetail[] = worksheetDetails.filter(
      (wsd: WorksheetDetail) => wsd.status === WORKSHEET_STATUS.NOT_TALLY
    )

    // terminate all order inventory if all inspection accuracy is 100%
    if (!notTallyWorksheetDetails?.length) {
      targetInventories.forEach((targetInventory: OrderInventory) => {
        targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
        targetInventory.updater = user
      })
      await this.updateOrderTargets(targetInventories)
      worksheet = await this.completWorksheet(worksheet, user, ORDER_STATUS.DONE)
    } else {
      type InspectionResult = { tallyTargetInventories: OrderInventory[]; nonTallyTargetInventories: OrderInventory[] }

      let { tallyTargetInventories, nonTallyTargetInventories }: InspectionResult = targetInventories.reduce(
        (inspectionResult: InspectionResult, targetInventory) => {
          if (targetInventory.status === ORDER_INVENTORY_STATUS.INSPECTED) {
            inspectionResult.tallyTargetInventories.push(targetInventory)
          } else {
            inspectionResult.nonTallyTargetInventories.push(targetInventory)
          }
          return inspectionResult
        },
        { tallyTargetInventories: [], nonTallyTargetInventories: [] }
      )

      let inventories: Inventory[] = tallyTargetInventories.map(
        (targetInventory: OrderInventory) => targetInventory.inventory
      )
      inventories.forEach((inventory: Inventory) => {
        inventory.lockedQty = 0
        inventory.lockedWeight = 0
        inventory.updater = user
      })
      await this.trxMgr.getRepository(Inventory).save(inventories)

      worksheet = await this.completWorksheet(worksheet, user, ORDER_STATUS.PENDING_REVIEW)

      nonTallyTargetInventories.forEach((targetInventory: OrderInventory) => {
        targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
        targetInventory.updater = user
      })
      await this.updateOrderTargets(nonTallyTargetInventories)
    }

    return worksheet
  }
}
