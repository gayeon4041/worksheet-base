import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { ArrivalNotice, InventoryCheck, ReleaseGood } from '@things-factory/sales-base'
import { buildQuery, convertListParams, ListParam } from '@things-factory/shell'
import { getRepository, SelectQueryBuilder } from 'typeorm'
import { Worksheet } from '../../../entities'

export const worksheetsResolver = {
  async worksheets(_: any, params: ListParam, context: any) {
    try {
      ////For inbound worksheet filter
      const arrivalNoticeParam: any = params.filters.find((param: any) => param.name === 'arrivalNoticeNo')
      const arrivalNoticeRefNoParam = params.filters.find(param => param.name === 'arrivalNoticeRefNo')

      if (arrivalNoticeParam || arrivalNoticeRefNoParam) {
        let arrFilters = []
        if (arrivalNoticeParam) {
          params.filters.splice(
            params.filters.findIndex(item => item.name == 'arrivalNoticeNo'),
            1
          )
          arrFilters.push({ ...arrivalNoticeParam, name: 'name' })
        }
        if (arrivalNoticeRefNoParam) {
          params.filters.splice(
            params.filters.findIndex(item => item.name == 'arrivalNoticeRefNo'),
            1
          )
          arrFilters.push({ ...arrivalNoticeRefNoParam, name: 'refNo' })
        }
        const foundArrivalNotices: ArrivalNotice[] = await getRepository(ArrivalNotice).find({
          ...convertListParams({ filters: arrFilters })
        })

        if (foundArrivalNotices && foundArrivalNotices.length) {
          params.filters.push({
            name: 'arrivalNoticeId',
            operator: 'in',
            value: foundArrivalNotices.map((foundAN: ArrivalNotice) => foundAN.id),
            relation: false
          })
        } else {
          params.filters.push({
            name: 'arrivalNoticeId',
            operator: 'is_null',
            relation: false
          })
        }
      }

      ////For outbound worksheet filter
      const releaseGoodParam = params.filters.find(param => param.name === 'releaseGoodNo')
      const releaseGoodRefNoParam = params.filters.find(param => param.name === 'releaseGoodRefNo')
      if (releaseGoodParam || releaseGoodRefNoParam) {
        let arrFilters = []
        if (releaseGoodParam) {
          params.filters.splice(
            params.filters.findIndex(item => item.name == 'releaseGoodNo'),
            1
          )
          arrFilters.push({ ...releaseGoodParam, name: 'name' })
        }
        if (releaseGoodRefNoParam) {
          params.filters.splice(
            params.filters.findIndex(item => item.name == 'releaseGoodRefNo'),
            1
          )
          arrFilters.push({ ...releaseGoodRefNoParam, name: 'refNo' })
        }
        const foundReleaseGoods: ReleaseGood[] = await getRepository(ReleaseGood).find({
          ...convertListParams({ filters: arrFilters })
        })

        if (foundReleaseGoods && foundReleaseGoods.length) {
          params.filters.push({
            name: 'releaseGoodId',
            operator: 'in',
            value: foundReleaseGoods.map((foundRG: ReleaseGood) => foundRG.id),
            relation: false
          })
        } else {
          params.filters.push({
            name: 'releaseGoodId',
            operator: 'is_null',
            relation: false
          })
        }
      }

      ////For inventory check worksheet filter
      const inventoryCheckParam = params.filters.find(param => param.name === 'inventoryCheckNo')
      const executionDateParam = params.filters.find(param => param.name === 'executionDate')
      if (inventoryCheckParam || executionDateParam) {
        let arrFilters = []
        if (inventoryCheckParam) {
          params.filters.splice(
            params.filters.findIndex(item => item.name == 'inventoryCheckNo'),
            1
          )
          arrFilters.push({ ...inventoryCheckParam, name: 'name' })
        }
        if (executionDateParam) {
          params.filters.splice(
            params.filters.findIndex(item => item.name == 'executionDate'),
            1
          )
          arrFilters.push({ ...releaseGoodRefNoParam, name: 'refNo' })
        }
        const foundInventoryCheck: InventoryCheck[] = await getRepository(InventoryCheck).find({
          ...convertListParams({ filters: arrFilters })
        })

        if (foundInventoryCheck && foundInventoryCheck.length) {
          params.filters.push({
            name: 'inventoryCheckId',
            operator: 'in',
            value: foundInventoryCheck.map((foundIC: InventoryCheck) => foundIC.id),
            relation: false
          })
        } else {
          params.filters.push({
            name: 'inventoryCheckId',
            operator: 'is_null',
            relation: false
          })
        }
      }

      ////Set default bizplace filter
      const bizplaceFilter = params.filters.find(param => param.name === 'bizplaceId')
      if (!bizplaceFilter) {
        params.filters.push({
          name: 'bizplaceId',
          operator: 'in',
          value: await getPermittedBizplaceIds(context.state.domain, context.state.user),
          relation: false
        })
      }

      ////Build and run Query
      const qb: SelectQueryBuilder<Worksheet> = getRepository(Worksheet).createQueryBuilder('ws')
      buildQuery(qb, params, context)
      qb.addSelect(subQuery => {
        return subQuery
          .select('COALESCE("ccd".rank, 99999)', 'rank')
          .from('common_code_details', 'ccd')
          .innerJoin('ccd.commonCode', 'cc')
          .where('"ccd"."name" = "ws"."status"')
          .andWhere('"ccd"."domain_id" = "ws"."domain_id"')
          .andWhere('"cc"."name" = \'WORKSHEET_STATUS\'')
      }, 'rank')
      qb.leftJoinAndSelect('ws.domain', 'domain')
      qb.leftJoinAndSelect('ws.bizplace', 'bizplace')
      qb.leftJoinAndSelect('ws.arrivalNotice', 'arrivalNotice')
      qb.leftJoinAndSelect('ws.releaseGood', 'releaseGood')
      qb.leftJoinAndSelect('ws.inventoryCheck', 'inventoryCheck')
      qb.leftJoinAndSelect('ws.vasOrder', 'vasOrder')
      qb.leftJoinAndSelect('ws.creator', 'creator')
      qb.leftJoinAndSelect('ws.updater', 'updater')

      ////Add sorting conditions
      const arrChildSortData = ['bizplace', 'arrivalNotice', 'releaseGood', 'inventoryCheck']
      let sort = (params.sortings || []).reduce(
        (acc, sort) => {
          if (sort.name != 'arrivalRefNo' && sort.name != 'releaseRefNo') {
            return {
              ...acc,
              [arrChildSortData.indexOf(sort.name) >= 0 ? sort.name + '.name' : 'ws.' + sort.name]: sort.desc
                ? 'DESC'
                : 'ASC'
            }
          } else {
            return { ...acc }
          }
        },
        !params.sortings.some(e => e.name === 'status') ? { rank: 'ASC' } : {}
      )

      if (params.sortings.some(e => e.name === 'arrivalRefNo')) {
        sort = {
          ...sort,
          'arrivalNotice.refNo': params.sortings[params.sortings.findIndex(item => item.name == 'arrivalRefNo')].desc
            ? 'DESC'
            : 'ASC'
        }
      }

      if (params.sortings.some(e => e.name === 'releaseRefNo')) {
        sort = {
          ...sort,
          'releaseGood.refNo': params.sortings[params.sortings.findIndex(item => item.name == 'releaseRefNo')].desc
            ? 'DESC'
            : 'ASC'
        }
      }

      qb.orderBy(sort)

      const [items, total] = await qb.getManyAndCount()

      return { items, total }
    } catch (error) {
      throw error
    }
  }
}
