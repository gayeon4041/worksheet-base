import { Attachment } from '@things-factory/attachment-base'
import { Partner, Bizplace, ContactPoint } from '@things-factory/biz-base'
import { DeliveryOrder, OrderInventory } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { Equal, getRepository, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const deliveryOrderByWorksheetResolver = {
  async deliveryOrderByWorksheet(_: any, { name }, context: any) {
    const foundDO: DeliveryOrder = await getRepository(DeliveryOrder).findOne({
      where: {
        domain: context.state.domain,
        name
      },
      relations: ['domain', 'bizplace', 'transportDriver', 'transportVehicle', 'releaseGood', 'creator', 'updater']
    })

    const partnerBiz: Bizplace = await getRepository(Bizplace).findOne({
      where: { id: foundDO.bizplace.id }
    })

    const partnerContactPoint: ContactPoint[] = await getRepository(ContactPoint).find({
      where: { domain: context.state.domain, bizplace: partnerBiz }
    })

    const foundDomainBizId: Partner = await getRepository(Partner).findOne({
      where: { partnerBizplace: partnerBiz.id },
      relations: ['domainBizplace']
    })

    const foundDomainBiz: Bizplace = await getRepository(Bizplace).findOne({
      where: { id: foundDomainBizId.domainBizplace.id }
    })

    let foundAttachments = []
    if (!foundDO) {
      throw new Error(`Delivery order doesn't exists.`)
    } else {
      foundAttachments = await getRepository(Attachment).find({
        where: {
          domain: context.state.domain,
          refBy: foundDO.id
        }
      })
    }

    const targetInventories: OrderInventory[] = await getRepository(OrderInventory).find({
      where: { domain: context.state.domain, deliveryOrder: foundDO },
      relations: ['inventory']
    })
    const orderInvIds: string[] = targetInventories.map((oi: any) => oi.id)

    const foundWSD: WorksheetDetail[] = await getRepository(WorksheetDetail).find({
      where: {
        domain: context.state.domain,
        targetInventory: In(orderInvIds),
        type: WORKSHEET_TYPE.LOADING,
        status: Equal(WORKSHEET_STATUS.DONE)
      },
      relations: [
        'targetInventory',
        'targetInventory.inventory',
        'targetInventory.inventory.location',
        'targetInventory.inventory.product',
        'updater'
      ]
    })

    return {
      deliveryOrderInfo: {
        partnerBizplace: partnerBiz.name,
        domainBizplace: foundDomainBiz.name,
        attachments: foundAttachments,
        ownCollection: foundDO.ownCollection,
        to: foundDO.to || '',
        deliveryDate: foundDO.deliveryDate || '',
        releaseGoodNo: foundDO.releaseGood.name,
        truckNo: foundDO.truckNo || '',
        // vehicleName: foundDO.transportVehicle || '',
        doStatus: foundDO.status
      },
      loadedInventoryInfo: foundWSD.map(async (wsd: WorksheetDetail) => {
        const targetInventory: OrderInventory = wsd.targetInventory
        const inventory: Inventory = targetInventory.inventory
        return {
          palletId: inventory.palletId,
          batchId: inventory.batchId,
          product: inventory.product,
          packingType: inventory.packingType,
          releaseQty: targetInventory.releaseQty,
          releaseWeight: targetInventory.releaseWeight,
          status: wsd.status,
          productDescription: inventory.product.description,
          inventory: targetInventory.inventory,
          updaterName: wsd.updater.name,
          remark: targetInventory.remark
        }
      }),
      contactPointInfo: partnerContactPoint.map(async (cp: ContactPoint) => {
        return {
          address: cp.address || '',
          email: cp.email || '',
          fax: cp.fax || '',
          phone: cp.phone || '',
          contactName: cp.name || ''
        }
      })
    }
  }
}