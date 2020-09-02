import { Role, User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  InventoryCheck,
  OrderInventory,
  OrderProduct,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_PRODUCT_STATUS,
  ORDER_VAS_STATUS,
  ReleaseGood,
  VasOrder
} from '@things-factory/sales-base'
import { Domain, sendNotification } from '@things-factory/shell'
import { EntityManager, EntitySchema, FindOneOptions } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import { WorksheetNoGenerator } from '../utils'

export type ReferenceOrderType = ArrivalNotice | ReleaseGood | VasOrder | InventoryCheck
export type OrderTargetTypes = OrderProduct | OrderInventory | OrderVas

export interface BasicInterface {
  domain: Domain
  user: User
}

export interface NotificationMsgInterface {
  title: string
  message: string
  url: string
}

export class WorksheetController {
  protected trxMgr: EntityManager

  public readonly ERROR_MSG: Record<string, any> = {
    FIND: {
      NO_RESULT: (condition: any) => `There's no results matched with condition ${condition}`
    },
    CREATE: {
      ID_EXISTS: 'Target has ID already',
      EMPTY_CREATOR: 'Cannot create without creator',
      EMPTY_UPDATER: 'Cannot create without updater'
    },
    UPDATE: {
      ID_NOT_EXISTS: `Target doesn't have ID`,
      EMPTY_UPDATER: 'Cannot update without updater'
    },
    VALIDITY: {
      UNEXPECTED_FIELD_VALUE: (field: string, expectedValue: any, actualValue: any) => `
        Expected ${field} value is ${expectedValue} but got ${actualValue}
      `
    }
  }

  public readonly ROLE_NAMES: Record<string, string> = {
    OFFICE_ADMIN: 'Office Admin'
  }

  constructor(trxMgr: EntityManager) {
    this.trxMgr = trxMgr
  }

  /**
   * @summary Insert worksheet into worksheet table
   * @description
   * Insert an worksheet into worksheets table
   * Because it's creating function passed worksheet shouldn't have id
   * and should have creator & updater
   * If passed param doesn't fit up those conditions it will throw an error
   *
   * @param {Partial<Worksheet>} worksheet
   * @returns {Promise<Worksheet>}
   */
  async createWorksheet(
    domain: Domain,
    bizplace: Bizplace,
    refOrder: ReferenceOrderType,
    type: string,
    user: User,
    additionalProps: Partial<Worksheet> = {}
  ): Promise<Worksheet> {
    let refOrderType: string = this.getRefOrderField(refOrder)

    const worksheet: Partial<Worksheet> = {
      domain,
      bizplace,
      name: WorksheetNoGenerator.generate(type),
      type,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: user,
      updater: user,
      [refOrderType]: refOrder,
      ...additionalProps
    }

    if (worksheet.id) throw new Error(this.ERROR_MSG.CREATE.ID_EXISTS)
    if (!worksheet.creator) throw new Error(this.ERROR_MSG.CREATE.EMPTY_CREATOR)
    if (!worksheet.updater) throw new Error(this.ERROR_MSG.CREATE.EMPTY_UPDATER)

    return await this.trxMgr.getRepository(Worksheet).save(worksheet)
  }

  /**
   * @summary Insert worksheet details into worksheet details table
   * @description
   * Insert worksheetDetails into worksheet_details table
   * Because it's creating function every passed worksheetDetails shouldn't have id
   * and should have creator & updater
   * If passed param doesn't fit up those conditions it will throw an error
   *
   * @param {Partial<WorksheetDetail>[]} worksheetDetails
   * @returns {Promise<WorksheetDetail[]>}
   */
  async createWorksheetDetails(
    domain: Domain,
    worksheet: Worksheet,
    type: string,
    orderTargets: OrderTargetTypes[],
    user: User,
    additionalProps: Partial<WorksheetDetail> = {}
  ): Promise<WorksheetDetail[]> {
    if (!worksheet.bizplace?.id) await this.findWorksheetById(worksheet.id, ['bizplace'])
    const bizplace: Bizplace = worksheet.bizplace

    const worksheetDetails: Partial<WorksheetDetail>[] = orderTargets.map((orderTarget: OrderTargetTypes) => {
      const orderTargetField: string = this.getOrderTargetField(orderTarget)
      return {
        domain,
        bizplace,
        worksheet,
        name: WorksheetNoGenerator.generate(type, true),
        status: WORKSHEET_STATUS.DEACTIVATED,
        [orderTargetField]: orderTarget,
        creator: user,
        updater: user,
        ...additionalProps
      }
    })

    if (worksheetDetails.some((wsd: Partial<WorksheetDetail>) => wsd.id))
      throw new Error(this.ERROR_MSG.CREATE.ID_EXISTS)
    if (worksheetDetails.some((wsd: Partial<WorksheetDetail>) => !wsd.creator))
      throw new Error(this.ERROR_MSG.CREATE.EMPTY_CREATOR)
    if (worksheetDetails.some((wsd: Partial<WorksheetDetail>) => !wsd.updater))
      throw new Error(this.ERROR_MSG.CREATE.EMPTY_UPDATER)

    return await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)
  }

  /**
   * @summary Find reference order (ArrivalNotice, ReleaseGood, VasOrder)
   * @description
   * Find and return reference order with its relations by passed condition & reltaions
   * If there's no found result it will throw an error
   *
   * @param {EntitySchema} entitySchema
   * @param {Partial<ReferenceOrderType>} condition
   * @param {string[]} [relations]
   * @returns {Promise<ReferenceOrderType>}
   */
  async findRefOrder(
    entitySchema: EntitySchema,
    condition: Partial<ReferenceOrderType>,
    relations?: string[]
  ): Promise<ReferenceOrderType> {
    let findOption: FindOneOptions = { where: condition }
    if (relations?.length > 0) findOption.relations = relations

    const refOrder: ReferenceOrderType = await this.trxMgr.getRepository(entitySchema).findOne(findOption)
    if (!refOrder) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(findOption))

    return refOrder
  }

  /**
   * @summary Update order targets (OrderProduct, OrderInventory, OrderVas)
   * @description
   * Update order targets like (OrderProduct, OrderInventory, OrderVas)
   * Because it's updating function every passed worksheetDetails should have id and updater
   * If passed param is not fitted up with above condition it will throw an error
   *
   * @param {EntitySchema} entitySchema
   * @param {any[]} orderTargets
   * @returns {Promise<any>}
   */
  async updateOrderTargets(orderTargets: OrderTargetTypes[], entitySchema?: EntitySchema): Promise<any> {
    if (!entitySchema) {
      if (orderTargets[0] instanceof OrderProduct) {
        entitySchema = OrderProduct
      } else if (orderTargets[0] instanceof OrderInventory) {
        entitySchema = OrderInventory
      } else if (orderTargets[0] instanceof OrderVas) {
        entitySchema = OrderVas
      }
    }

    if (orderTargets.some((orderTarget: any) => !orderTarget.id)) throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    if (orderTargets.some((orderTarget: any) => !orderTarget.updater?.id))
      throw new Error(this.ERROR_MSG.UPDATE.EMPTY_UPDATER)

    return await this.trxMgr.getRepository(entitySchema).save(orderTargets)
  }

  /**
   * @summary Update reference order (ArrivalNotice, ReleaseGood, VasOrder)
   * @description
   * Update reference order like (ArrivalNotice, ReleaseGood, VasOrder)
   * Because it's updating function passed refOrder should have id and updater
   * If passed param is not fitted up with above conditions it will throw an error
   *
   * @param {EntitySchema} entitySchema
   * @param {ReferenceOrderType} refOrder
   * @returns {Promise<any>}
   */
  async updateRefOrder(refOrder: ReferenceOrderType, entitySchema?: EntitySchema): Promise<any> {
    if (!entitySchema) {
      if (refOrder instanceof ArrivalNotice) {
        entitySchema = ArrivalNotice
      } else if (refOrder instanceof ReleaseGood) {
        entitySchema = ReleaseGood
      } else if (refOrder instanceof VasOrder) {
        entitySchema = VasOrder
      } else if (refOrder instanceof InventoryCheck) {
        entitySchema = InventoryCheck
      }
    }

    if (!refOrder.id) throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    if (!refOrder.updater?.id) throw new Error(this.ERROR_MSG.UPDATE.EMPTY_UPDATER)

    return await this.trxMgr.getRepository(entitySchema).save(refOrder)
  }

  async findWorksheetById(id: string, relations: string[] = ['worksheetDetails']): Promise<Worksheet> {
    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne(id, { relations })

    if (!worksheet) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(id))

    return worksheet
  }

  async findWorksheetByNo(
    domain: Domain,
    worksheetNo: string,
    relations: string[] = ['worksheetDetails']
  ): Promise<Worksheet> {
    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      where: { domain, name: worksheetNo },
      relations
    })

    if (!worksheet) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(worksheetNo))

    return worksheet
  }

  async findWorksheetByRefOrder(
    domain: Domain,
    refOrder: ReferenceOrderType,
    type: string,
    relations: string[] = ['worksheetDetails']
  ): Promise<Worksheet> {
    let condition: FindOneOptions = { where: { domain, type }, relations }
    if (refOrder instanceof ArrivalNotice) {
      condition.where['arrivalNotice'] = refOrder
    } else if (refOrder instanceof ReleaseGood) {
      condition.where['releaseGood'] = refOrder
    } else if (refOrder instanceof InventoryCheck) {
      condition.where['inventoryCheck'] = refOrder
    } else {
      condition.where['vasOrder'] = refOrder
    }

    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne(condition)
    if (!worksheet) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(type))

    return worksheet
  }

  async findActivatableWorksheet(
    domain: Domain,
    worksheetNo: string,
    type: string,
    relations: string[]
  ): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findWorksheetByNo(domain, worksheetNo, relations)
    this.checkWorksheetValidity(worksheet, { type, status: WORKSHEET_STATUS.DEACTIVATED })

    return worksheet
  }

  async generateWorksheet(
    domain: Domain,
    user: User,
    worksheetType: string,
    refOrder: ReferenceOrderType,
    orderTargets: OrderTargetTypes[],
    refOrderStatus: string,
    orderTargetStatus: string,
    additionalProps: Partial<Worksheet> = {}
  ): Promise<Worksheet> {
    if (refOrder instanceof ArrivalNotice) {
      refOrder = await this.findRefOrder(ArrivalNotice, refOrder, ['bizplace'])
    } else if (refOrder instanceof ReleaseGood) {
      refOrder = await this.findRefOrder(ReleaseGood, refOrder, ['bizplace'])
    } else if (refOrder instanceof VasOrder) {
      refOrder = await this.findRefOrder(VasOrder, refOrder, ['bizplace'])
    } else if (refOrder instanceof InventoryCheck) {
      refOrder = await this.findRefOrder(InventoryCheck, refOrder, ['bizplace'])
    }

    const bizplace: Bizplace = refOrder.bizplace
    const worksheet: Worksheet = await this.createWorksheet(
      domain,
      bizplace,
      refOrder,
      worksheetType,
      user,
      additionalProps
    )
    orderTargets.forEach((orderTarget: OrderTargetTypes) => {
      orderTarget.status = orderTargetStatus
      orderTarget.updater = user
    })
    orderTargets = await this.updateOrderTargets(orderTargets)
    worksheet.worksheetDetails = await this.createWorksheetDetails(domain, worksheet, worksheetType, orderTargets, user)

    refOrder.status = refOrderStatus
    await this.updateRefOrder(refOrder)

    return worksheet
  }

  async activateWorksheet(
    worksheet: Worksheet,
    worksheetDetails: WorksheetDetail[],
    changedWorksheetDetails: Partial<WorksheetDetail>[],
    user: User
  ): Promise<Worksheet> {
    if (!worksheet.id || worksheetDetails.some((wsd: WorksheetDetail) => !wsd.id)) {
      throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    }

    worksheet.status = WORKSHEET_STATUS.EXECUTING
    worksheet.startedAt = new Date()
    worksheet.updater = user
    worksheet = await this.trxMgr.getRepository(Worksheet).save(worksheet)

    worksheetDetails = this.renewWorksheetDetails(worksheetDetails, changedWorksheetDetails, {
      status: WORKSHEET_STATUS.EXECUTING,
      updater: user
    })
    worksheet.worksheetDetails = await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

    return worksheet
  }

  async completWorksheet(worksheet: Worksheet, user: User, updatedRefOrderStatus?: string): Promise<Worksheet> {
    worksheet.status = WORKSHEET_STATUS.DONE
    worksheet.endedAt = new Date()
    worksheet.updater = user
    worksheet = await this.trxMgr.getRepository(Worksheet).save(worksheet)

    const worksheetType: string = worksheet.type
    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails

    worksheetDetails.forEach((wsd: WorksheetDetail) => {
      wsd.status = WORKSHEET_STATUS.DONE
      wsd.updater = user
    })
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

    if (worksheetType === WORKSHEET_TYPE.UNLOADING) {
      if (!worksheetDetails?.length || worksheetDetails.some((wsd: WorksheetDetail) => !wsd.targetProduct?.id)) {
        worksheet = await this.findWorksheetById(worksheet.id, ['worksheetDetails', 'worksheetDetails.targetProduct'])
      }

      const targetProducts: OrderProduct[] = worksheet.worksheetDetails.map((wsd: WorksheetDetail) => {
        let targetProduct: OrderProduct = wsd.targetProduct
        targetProduct.status = ORDER_PRODUCT_STATUS.TERMINATED
        targetProduct.updater = user
        return targetProduct
      })
      await this.updateOrderTargets(targetProducts)
    } else if (worksheetType === WORKSHEET_TYPE.VAS) {
      if (!worksheetDetails?.length || worksheetDetails.some((wsd: WorksheetDetail) => !wsd.targetVas?.id)) {
        worksheet = await this.findWorksheetById(worksheet.id, ['worksheetDetails', 'worksheetDetails.targetVas'])
      }

      const targetVASs: OrderVas[] = worksheet.worksheetDetails.map((wsd: WorksheetDetail) => {
        let targetVAS: OrderVas = wsd.targetVas
        targetVAS.status = ORDER_VAS_STATUS.TERMINATED
        targetVAS.updater = user
        return targetVAS
      })

      await this.updateOrderTargets(targetVASs)
    } else {
      if (!worksheetDetails?.length || worksheetDetails.some((wsd: WorksheetDetail) => !wsd.targetInventory?.id)) {
        worksheet = await this.findWorksheetById(worksheet.id, ['worksheetDetails', 'worksheetDetails.targetInventory'])
      }

      const targetInventories: OrderInventory[] = worksheet.worksheetDetails.map((wsd: WorksheetDetail) => {
        let targetInventory: OrderInventory = wsd.targetInventory
        targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
        targetInventory.updater = user
        return targetInventory
      })

      await this.updateOrderTargets(targetInventories)
    }

    if (updatedRefOrderStatus) {
      const refOrder: ReferenceOrderType = await this.extractRefOrder(worksheet)
      refOrder.status = updatedRefOrderStatus
      refOrder.updater = user
      await this.updateRefOrder(refOrder)
    }

    return worksheet
  }

  renewWorksheetDetails(
    originWSDs: WorksheetDetail[],
    changedWSDs: Partial<WorksheetDetail>[],
    additionalProps: Partial<WorksheetDetail> = {}
  ): WorksheetDetail[] {
    return originWSDs.map((originWSD: WorksheetDetail) => {
      const changedWSD: Partial<WorksheetDetail> = this.findMatchedWSD(originWSD.name, changedWSDs)

      return {
        ...originWSD,
        ...changedWSD,
        ...additionalProps
      }
    })
  }

  findMatchedWSD(originWSDName: string, changedWSDs: any[]): any {
    return changedWSDs.find((changedWSD: Partial<WorksheetDetail>) => changedWSD.name === originWSDName)
  }

  checkWorksheetValidity(worksheet: Worksheet, conditions: Record<string, any>): void {
    for (let field in conditions) {
      let isValid: boolean = false
      if (typeof conditions[field] === 'function') {
        isValid = conditions[field](worksheet[field])
      } else {
        isValid = conditions[field] === worksheet[field]
      }

      if (!isValid)
        throw new Error(this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE(field, conditions[field], worksheet[field]))
    }
  }

  async notifiyToOfficeAdmin(domain: Domain, message: NotificationMsgInterface): Promise<void> {
    const users: User[] = await this.trxMgr
      .getRepository('users_roles')
      .createQueryBuilder('ur')
      .select('ur.users_id', 'id')
      .where(qb => {
        const subQuery = qb
          .subQuery()
          .select('role.id')
          .from(Role, 'role')
          .where('role.name = :roleName', { roleName: this.ROLE_NAMES.OFFICE_ADMIN })
          .andWhere('role.domain_id = :domainId', { domainId: domain.id })
          .getQuery()
        return 'ur.roles_id IN ' + subQuery
      })
      .getRawMany()

    this.notifyToUsers(users, message)
  }

  async notifyToCustomer(domain: Domain, bizplace: Bizplace, message: NotificationMsgInterface): Promise<void> {
    const users: any[] = await this.trxMgr
      .getRepository('bizplaces_users')
      .createQueryBuilder('bu')
      .select('bu.user_id', 'id')
      .where(qb => {
        const subQuery = qb
          .subQuery()
          .select('bizplace.id')
          .from(Bizplace, 'bizplace')
          .where('bizplace.name = :bizplaceName', { bizplaceName: bizplace.name })
          .getQuery()
        return 'bu.bizplace_id IN ' + subQuery
      })
      .getRawMany()

    this.notifyToUsers(users, message)
  }

  notifyToUsers(users: User[], message: NotificationMsgInterface): void {
    users.forEach((user: User) => {
      sendNotification({
        receiver: user.id,
        message: JSON.stringify(message)
      })
    })
  }

  getRefOrderField(refOrder: ReferenceOrderType): string {
    if (refOrder instanceof ArrivalNotice) {
      return 'arrivalNotice'
    } else if (refOrder instanceof ReleaseGood) {
      return 'releaseGood'
    } else if (refOrder instanceof VasOrder) {
      return 'vasOrder'
    } else {
      throw new Error(
        this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE('refOrder', 'One of referece order type', refOrder)
      )
    }
  }

  getOrderTargetField(orderTarget: OrderTargetTypes) {
    if (orderTarget instanceof OrderProduct) {
      return 'orderProduct'
    } else if (orderTarget instanceof OrderInventory) {
      return 'orderInventory'
    } else if (orderTarget instanceof OrderVas) {
      return 'orderVas'
    } else {
      this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE('orderTarget', 'One of order target type', orderTarget)
    }
  }

  async extractRefOrder(worksheet: Worksheet): Promise<ReferenceOrderType> {
    let refOrder: ReferenceOrderType =
      worksheet.arrivalNotice || worksheet.releaseGood || worksheet.vasOrder || worksheet.inventoryCheck || null
    if (!refOrder) {
      const wsWithRefOrd: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne(worksheet.id, {
        relations: ['arrivalNotice', 'releaseGood', 'vasOrder', 'inventoryCheck']
      })

      refOrder =
        wsWithRefOrd.arrivalNotice ||
        wsWithRefOrd.releaseGood ||
        wsWithRefOrd.vasOrder ||
        wsWithRefOrd.inventoryCheck ||
        null
      if (!refOrder) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(worksheet.id))
    }

    return refOrder
  }
}
