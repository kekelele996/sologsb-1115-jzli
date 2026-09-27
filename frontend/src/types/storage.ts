/** 保藏方式 */
export const STORAGE_METHODS = ['针插', '浸液', '玻片', '干燥'] as const
export type StorageMethod = (typeof STORAGE_METHODS)[number]

/** Storage 保藏位置 */
export interface Storage {
  id: string
  specimenId: string
  method: StorageMethod
  /** 标本柜编号 */
  cabinet: string
  /** 抽屉号 */
  drawer: number
  /** 标本盒号 */
  box: number
  /** 插位序号 */
  slot: number
  storedDate: string
  handler: string
}

/** Loan 外借记录（归还后保留为历史，returnDate 为空表示仍在借） */
export interface Loan {
  id: string
  specimenId: string
  /** 借用人 */
  borrower: string
  /** 借用用途 */
  purpose: string
  /** 出借日期 */
  loanDate: string
  /** 预计归还日期 */
  dueDate: string
  /** 实际归还日期，空串表示尚未归还 */
  returnDate: string
  /** 归还经手人 */
  returnHandler: string
}

/** 保藏状态（由入柜记录 + 在借记录推导） */
export const STORAGE_STATES = ['未入柜', '在柜', '在借'] as const
export type StorageState = (typeof STORAGE_STATES)[number]
