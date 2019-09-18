export const enum ORDER_STATUS {
  PENDING = 'PENDING',
  EDITING = 'EDITING',
  PENDING_RECEIVE = 'PENDING_RECEIVE',
  INTRANSIT = 'INTRANSIT',
  ARRIVED = 'ARRIVED',
  READY_TO_UNLOAD = 'READY_TO_UNLOAD',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE'
}

export const enum ORDER_PRODUCT_STATUS {
  PENDING = 'PENDING',
  INTRANSIT = 'INTRANSIT',
  ARRIVED = 'ARRIVED',
  READY_TO_UNLOAD = 'READY_TO_UNLOAD',
  UNLOADING = 'UNLOADING',
  UNLOADED = 'UNLOADED',
  PUTTING_AWAY = 'PUTTING_AWAY',
  STORED = 'STORED'
}

export const enum ORDER_VAS_STATUS {
  PENDING = 'PENDING',
  READY_TO_PROCESS = 'READY_TO_PROCESS',
  PROCESSING = 'PROCESSING'
}