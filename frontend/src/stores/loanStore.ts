import { create } from 'zustand'
import type { Loan } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'

export interface LoanState {
  rows: Loan[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: Loan) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const loanStore = create<LoanState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<Loan>(db.loans)
    rows.sort((a, b) => (b.loanDate + b.id).localeCompare(a.loanDate + a.id))
    set({ rows, loaded: true })
  },
  save: async (row) => {
    await putRow<Loan>(db.loans, row)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<Loan>(db.loans, id)
    await get().hydrate()
  }
}))
