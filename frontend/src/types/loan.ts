/** Loan 外借记录：历史记录永久保留，returnDate 为空表示仍在借 */
export interface Loan {
  id: string
  specimenId: string
  /** 借用人 */
  borrower: string
  /** 用途 */
  purpose: string
  /** 出借日期 */
  loanDate: string
  /** 预计归还日 */
  dueDate: string
  /** 实际归还日期，未归还为 null */
  returnDate: string | null
  /** 归还经手人 */
  returnHandler: string
}
