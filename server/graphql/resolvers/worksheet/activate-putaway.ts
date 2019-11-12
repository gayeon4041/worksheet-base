import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderInventory, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const services = {
  activatePutaway: async (
    worksheetNo: string,
    putawayWorksheetDetails: WorksheetDetail[],
    context: any
  ): Promise<Worksheet> => {
    /**
     * 1. Validation for worksheet
     *    - data existing
     *    - status of worksheet
     */
    const foundWorksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        name: worksheetNo,
        status: WORKSHEET_STATUS.DEACTIVATED
      },
      relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetInventory']
    })

    if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
    const customerBizplace: Bizplace = foundWorksheet.bizplace
    const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
    let targetInventories: OrderInventory[] = foundWSDs.map((foundWSD: WorksheetDetail) => foundWSD.targetInventory)

    /**
     * 2. Update description of putaway worksheet details
     */
    await Promise.all(
      putawayWorksheetDetails.map(async (putawayWorksheetDetail: WorksheetDetail) => {
        await getRepository(WorksheetDetail).update(
          {
            domain: context.state.domain,
            bizplace: customerBizplace,
            name: putawayWorksheetDetail.name,
            status: WORKSHEET_STATUS.DEACTIVATED
          },
          {
            description: putawayWorksheetDetail.description,
            status: WORKSHEET_STATUS.EXECUTING,
            updater: context.state.user
          }
        )
      })
    )

    /**
     * 3. Update target inventories (status: READY_TO_PUTAWAY => PUTTING_AWAY)
     */
    targetInventories = targetInventories.map((targetInventory: OrderInventory) => {
      return {
        ...targetInventory,
        status: ORDER_PRODUCT_STATUS.PUTTING_AWAY,
        updater: context.state.user
      }
    })
    await getRepository(OrderInventory).save(targetInventories)

    /**
     * 4. Update putaway Worksheet (status: DEACTIVATED => EXECUTING)
     */
    const worksheet: Worksheet = await getRepository(Worksheet).save({
      ...foundWorksheet,
      status: WORKSHEET_STATUS.EXECUTING,
      startedAt: new Date(),
      updater: context.state.user
    })

    /**
     * 5. Update Arrival Notice (status: READY_TO_PUTAWAY => PUTTING_AWAY)
     */
    const arrivalNotice: ArrivalNotice = foundWorksheet.arrivalNotice
    await getRepository(ArrivalNotice).save({
      ...arrivalNotice,
      status: ORDER_STATUS.PUTTING_AWAY,
      updater: context.state.user
    })

    return worksheet
  }
}

export const activatePutaway = {
  async activatePutaway(_: any, { worksheetNo, putawayWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr =>
      services.activatePutaway(worksheetNo, putawayWorksheetDetails, context)
    )
  }
}
