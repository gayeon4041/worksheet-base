import { gql } from 'apollo-server-koa'

export const WorksheetDetailPatch = gql`
  input WorksheetDetailPatch {
    name: String
    description: String
    type: String
    worksheet: ObjectRef
    worker: ObjectRef
    targetProduct: OrderProductPatch
    targetVas: OrderVasPatch
    targetInventory: OrderInventoryPatch
    fromLocation: ObjectRef
    toLocation: ObjectRef
    status: String
    operationGuide: String
    remark: String
    issue: String
    cuFlag: String
  }
`
