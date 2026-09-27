import type { StorageState } from '@/types'

const STYLES: Record<StorageState, string> = {
  未入柜: 'bg-slate-100 text-slate-600 border-slate-300',
  在柜: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  在借: 'bg-sky-50 text-sky-700 border-sky-300'
}

const DOTS: Record<StorageState, string> = {
  未入柜: 'bg-slate-400',
  在柜: 'bg-emerald-500',
  在借: 'bg-sky-500'
}

export interface StorageStateTagProps {
  state: StorageState
  /** 在借且已逾期时的逾期天数，大于 0 时追加显示 */
  overdueDays?: number
  className?: string
}

/** 保藏状态标签：未入柜 / 在柜 / 在借（逾期追加天数并转橙色） */
export default function StorageStateTag({ state, overdueDays = 0, className = '' }: StorageStateTagProps): JSX.Element {
  const overdue = state === '在借' && overdueDays > 0
  const style = overdue ? 'bg-amber-50 text-amber-700 border-amber-300' : STYLES[state]
  const dot = overdue ? 'bg-amber-500' : DOTS[state]
  return (
    <span
      data-testid="storage-state-tag"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs leading-5 ${style} ${className}`}
    >
      <i className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {state}
      {overdue ? ` · 逾期 ${overdueDays} 天` : ''}
    </span>
  )
}
