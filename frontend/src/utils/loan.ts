import type { Loan } from '@/types'

/** 今天的日期串（YYYY-MM-DD），与各处入柜/采集日期口径一致 */
export function todayText(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 逾期天数：今天超过预计归还日的天数，未逾期为 0 */
export function overdueDays(dueDate: string, today: string = todayText()): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(due) || !Number.isFinite(now)) return 0
  return Math.max(0, Math.round((now - due) / 86400000))
}

/** 标本当前的在借记录（未归还），没有则为 undefined */
export function activeLoanOf(loans: Loan[], specimenId: string): Loan | undefined {
  return loans.find((loan) => loan.specimenId === specimenId && !loan.returnDate)
}

/** 标本的全部外借历史，新的在前 */
export function loansOfSpecimen(loans: Loan[], specimenId: string): Loan[] {
  return loans
    .filter((loan) => loan.specimenId === specimenId)
    .sort((a, b) => (b.loanDate + b.id).localeCompare(a.loanDate + a.id))
}
