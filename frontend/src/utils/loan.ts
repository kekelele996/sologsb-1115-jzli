import type { Loan, Storage, StorageState } from '@/types'

/** 今天（本地日期，YYYY-MM-DD） */
export function todayText(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 日期加减天数，返回 YYYY-MM-DD */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/** 两个 YYYY-MM-DD 日期相差的天数（b - a） */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** 是否仍在借（未填写实际归还日期） */
export function isActiveLoan(loan: Loan): boolean {
  return !loan.returnDate
}

/** 在借且已超过预计归还日 */
export function isLoanOverdue(loan: Loan, today: string = todayText()): boolean {
  return isActiveLoan(loan) && loan.dueDate < today
}

/** 逾期天数（未逾期返回 0） */
export function overdueDays(loan: Loan, today: string = todayText()): number {
  return isLoanOverdue(loan, today) ? daysBetween(loan.dueDate, today) : 0
}

/** 标本当前的在借记录（同一标本同一时间只允许一条） */
export function activeLoanOf(loans: Loan[], specimenId: string): Loan | null {
  return loans.find((loan) => loan.specimenId === specimenId && isActiveLoan(loan)) ?? null
}

/** 标本的全部外借历史，最近的排前面 */
export function loansOf(loans: Loan[], specimenId: string): Loan[] {
  return loans
    .filter((loan) => loan.specimenId === specimenId)
    .sort((a, b) => (b.loanDate + b.id).localeCompare(a.loanDate + a.id))
}

export interface StorageStateEntry {
  state: StorageState
  storage: Storage | null
  /** 仅在借时有值 */
  loan: Loan | null
}

export interface StorageStateIndex {
  bySpecimen: Map<string, StorageStateEntry>
  inCabinet: number
  onLoan: number
  overdue: number
}

/** 汇总每份标本的保藏状态：有在借记录为「在借」，否则有入柜记录为「在柜」，其余「未入柜」 */
export function buildStorageStateIndex(
  storages: Storage[],
  loans: Loan[],
  today: string = todayText()
): StorageStateIndex {
  const storageBySpecimen = new Map<string, Storage>()
  storages.forEach((storage) => {
    if (!storageBySpecimen.has(storage.specimenId)) storageBySpecimen.set(storage.specimenId, storage)
  })
  const activeBySpecimen = new Map<string, Loan>()
  loans.forEach((loan) => {
    if (isActiveLoan(loan) && !activeBySpecimen.has(loan.specimenId)) activeBySpecimen.set(loan.specimenId, loan)
  })

  const bySpecimen = new Map<string, StorageStateEntry>()
  let inCabinet = 0
  let onLoan = 0
  let overdue = 0
  storageBySpecimen.forEach((storage, specimenId) => {
    const loan = activeBySpecimen.get(specimenId) ?? null
    if (loan) {
      onLoan += 1
      if (isLoanOverdue(loan, today)) overdue += 1
      bySpecimen.set(specimenId, { state: '在借', storage, loan })
    } else {
      inCabinet += 1
      bySpecimen.set(specimenId, { state: '在柜', storage, loan: null })
    }
  })
  return { bySpecimen, inCabinet, onLoan, overdue }
}

/** 单份标本的保藏状态（未入柜 / 在柜 / 在借） */
export function storageStateOf(index: StorageStateIndex | null, specimenId: string): StorageState {
  return index?.bySpecimen.get(specimenId)?.state ?? '未入柜'
}
