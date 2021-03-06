import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { Product } from '@things-factory/product-base'
import {
  ArrivalNotice,
  OrderNoGenerator,
  OrderProduct,
  OrderVas,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_TYPES,
  ORDER_VAS_STATUS,
  Vas,
  VAS_TARGET_TYPES
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'
import { activatePicking } from './activate-picking'
import { activateVas } from './activate-vas'
import { worksheetByOrderNo } from './worksheet-by-order-no'

export const activateUnloadingResolver = {
  async activateUnloading(_: any, { worksheetNo, unloadingWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      let unloadingWS: Worksheet = await activateUnloading(
        trxMgr,
        worksheetNo,
        unloadingWorksheetDetails,
        context.state.domain,
        context.state.user
      )

      const crossDocking: boolean = unloadingWS?.arrivalNotice?.crossDocking
      if (crossDocking) {
        unloadingWS = await trxMgr.getRepository(Worksheet).findOne(unloadingWS.id, {
          relations: ['arrivalNotice', 'arrivalNotice.releaseGood']
        })
      }

      if (crossDocking) {
        const pickingWS: Worksheet = await worksheetByOrderNo(
          context.state.domain,
          unloadingWS.arrivalNotice.releaseGood.name,
          WORKSHEET_TYPE.PICKING,
          trxMgr
        )

        // Check whether picking targets stored inventory
        if (pickingWS.worksheetDetails.every((wsd: WorksheetDetail) => wsd.targetInventory.crossDocking)) {
          await activatePicking(trxMgr, pickingWS.name, context.state.domain, context.state.user)
        }
      }

      return unloadingWS
    })
  }
}

export async function activateUnloading(
  trxMgr: EntityManager,
  worksheetNo: string,
  unloadingWorksheetDetails: any[],
  domain: Domain,
  user: User
): Promise<Worksheet> {
  const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: {
      domain,
      name: worksheetNo,
      type: WORKSHEET_TYPE.UNLOADING,
      status: WORKSHEET_STATUS.DEACTIVATED
    },
    relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetProduct']
  })

  if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
  const customerBizplace: Bizplace = foundWorksheet.bizplace
  const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
  let targetProducts: OrderProduct[] = foundWSDs.map((foundWSD: WorksheetDetail) => {
    return {
      ...foundWSD.targetProduct,
      palletQty: foundWSD.targetProduct.palletQty
        ? foundWSD.targetProduct.palletQty
        : unloadingWorksheetDetails.find((worksheetDetail: WorksheetDetail) => worksheetDetail.name === foundWSD.name)
            .palletQty
    }
  })

  /**
   * 2. Update description of product worksheet details (status: DEACTIVATED => EXECUTING)
   */
  await Promise.all(
    unloadingWorksheetDetails.map(async (unloadingWSD: WorksheetDetail) => {
      await trxMgr.getRepository(WorksheetDetail).update(
        {
          domain,
          bizplace: customerBizplace,
          name: unloadingWSD.name,
          status: WORKSHEET_STATUS.DEACTIVATED,
          worksheet: foundWorksheet
        },
        {
          description: unloadingWSD.description,
          status: WORKSHEET_STATUS.EXECUTING,
          updater: user
        }
      )
    })
  )

  /**
   * 3. Update target products (status: READY_TO_UNLOAD => UNLOADING)
   */
  targetProducts = targetProducts.map((targetProduct: OrderProduct) => {
    targetProduct.status = ORDER_PRODUCT_STATUS.UNLOADING
    targetProduct.updater = user
    return targetProduct
  })
  await trxMgr.getRepository(OrderProduct).save(targetProducts)

  /**
   * 4. Update Arrival Notice (status: READY_TO_UNLOAD => PROCESSING)
   */
  let arrivalNotice: ArrivalNotice = foundWorksheet.arrivalNotice
  arrivalNotice.status = ORDER_STATUS.PROCESSING
  arrivalNotice.updater = user
  await trxMgr.getRepository(ArrivalNotice).save(arrivalNotice)

  let relatedVasWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, arrivalNotice, type: WORKSHEET_TYPE.VAS },
    relations: ['worksheetDetails']
  })

  /**
   * Activate VAS worksheet if it's exists
   * It means that there are VAS which is requested from customer side.
   *
   * VAS should be completed within unloading step warehouse manager doesn't need to activate it manually.
   */
  if (relatedVasWorksheet) {
    await activateVas(trxMgr, domain, user, relatedVasWorksheet.name, relatedVasWorksheet.worksheetDetails)
  }

  /**
   * 5. Is VAS worksheet creating needed? (If there's some palletQty and palletizingDescription)
   *  - For loosen product case. (Without vas relation but description from palletizingDescription)
   *  - 5. 1) Check if there's VAS worksheet which is related with current arrival notice
   *          - YES => Append more VAS worksheet
   *          - NO => create additional VAS worksheet
   *  - 5. 2) Append new vas worksheet details
   */
  // Check there's some pallet qty and palletizingDescription => need to create vas worksheet
  // if (
  //   unloadingWorksheetDetails.some(
  //     (worksheetDetail: any) => worksheetDetail.palletQty && worksheetDetail.palletizingDescription
  //   )
  // ) {
  //   // Check if there's VAS worksheet which is related with current arrival notice order.
  //   if (!relatedVasWorksheet) {
  //     relatedVasWorksheet = await trxMgr.getRepository(Worksheet).save({
  //       domain,
  //       bizplace: customerBizplace,
  //       name: WorksheetNoGenerator.vas(),
  //       arrivalNotice,
  //       statedAt: new Date(),
  //       endedAt: new Date(),
  //       type: WORKSHEET_TYPE.VAS,
  //       status: WORKSHEET_STATUS.DONE,
  //       creator: user,
  //       updater: user
  //     })
  //   }

  //   const palletizingWSDs: WorksheetDetail[] | any[] = unloadingWorksheetDetails.filter(
  //     (worksheetDetail: any) => worksheetDetail.palletQty && worksheetDetail.palletizingDescription
  //   )

  //   let palletizingOrderVass: OrderVas[] = []
  //   for (let palletizingWSD of palletizingWSDs) {
  //     const originWSD: WorksheetDetail = foundWSDs.find(
  //       (foundWSD: WorksheetDetail) => foundWSD.name === palletizingWSD.name
  //     )
  //     const originOP: OrderProduct = await trxMgr.getRepository(OrderProduct).findOne({
  //       where: { domain, id: originWSD.targetProduct.id },
  //       relations: ['product']
  //     })
  //     const targetBatchId: string = originOP.batchId
  //     const targetProduct: Product = originOP.product
  //     const packingType: string = originOP.packingType
  //     const vas: Vas = await trxMgr.getRepository(Vas).findOne({
  //       where: { domain, id: palletizingWSD.palletizingVasId }
  //     })

  //     palletizingOrderVass.push({
  //       domain,
  //       name: OrderNoGenerator.orderVas(),
  //       arrivalNotice,
  //       vas,
  //       targetType: VAS_TARGET_TYPES.BATCH_AND_PRODUCT_TYPE,
  //       targetBatchId,
  //       targetProduct,
  //       packingType,
  //       description: palletizingWSD.palletizingDescription,
  //       batchId: palletizingWSD.batchId,
  //       bizplace: customerBizplace,
  //       type: ORDER_TYPES.ARRIVAL_NOTICE,
  //       status: ORDER_VAS_STATUS.COMPLETED
  //     })
  //   }

  //   palletizingOrderVass = await trxMgr.getRepository(OrderVas).save(palletizingOrderVass)

  //   const palletizingWorksheetDetails = palletizingOrderVass.map((ov: OrderVas) => {
  //     return {
  //       domain,
  //       bizplace: customerBizplace,
  //       worksheet: relatedVasWorksheet,
  //       name: WorksheetNoGenerator.vasDetail(),
  //       targetVas: ov,
  //       description: ov.description,
  //       type: WORKSHEET_TYPE.VAS,
  //       status: WORKSHEET_STATUS.DONE,
  //       creator: user,
  //       updater: user
  //     }
  //   })

  //   await trxMgr.getRepository(WorksheetDetail).save(palletizingWorksheetDetails)
  // }

  /**
   * 6. Update Worksheet (status: DEACTIVATED => EXECUTING)
   */
  return await trxMgr.getRepository(Worksheet).save({
    ...foundWorksheet,
    status: WORKSHEET_STATUS.EXECUTING,
    startedAt: new Date(),
    updater: user
  })
}
