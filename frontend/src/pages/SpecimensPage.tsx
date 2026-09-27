import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DetStatus, Loan, Specimen } from '@/types'
import { DET_STATUSES } from '@/types'
import SpecimenCard from '@/components/common/SpecimenCard'
import StatusTag from '@/components/common/StatusTag'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { useSpecimenFilter } from '@/hooks/useSpecimenFilter'
import { specimenStore } from '@/stores/specimenStore'
import { siteStore } from '@/stores/siteStore'
import { storageStore } from '@/stores/storageStore'
import { loanStore } from '@/stores/loanStore'
import { downloadCsv } from '@/utils/export'
import { specimenTaxon } from '@/utils/codec'
import { overdueDays } from '@/utils/loan'

/** 保藏状态筛选：在柜 = 已入柜且未借出，在借 = 有未归还外借，未入柜 = 尚无柜位 */
type StorageFilter = '' | '在柜' | '在借' | '未入柜'
const STORAGE_FILTERS: StorageFilter[] = ['', '在柜', '在借', '未入柜']

/** 标本清单：组合筛选 + 多选批量推进鉴定状态 */
export default function SpecimensPage(): JSX.Element {
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)
  const storages = usePersistentStore(storageStore, (state) => state.rows)
  const loans = usePersistentStore(loanStore, (state) => state.rows)
  const { filter, setFilter, reset, filtered, orders, families } = useSpecimenFilter(specimens)
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('')
  const [selected, setSelected] = useState<string[]>([])
  const [batchStatus, setBatchStatus] = useState<DetStatus>('初鉴')
  const [message, setMessage] = useState('')

  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const placedIds = useMemo(() => new Set(storages.map((item) => item.specimenId)), [storages])
  /** 在借（未归还）记录：specimenId → Loan */
  const activeLoanBySpecimen = useMemo(() => {
    const map = new Map<string, Loan>()
    loans.forEach((loan) => {
      if (!loan.returnDate) map.set(loan.specimenId, loan)
    })
    return map
  }, [loans])

  const storageStateOf = (specimenId: string): '在柜' | '在借' | '未入柜' => {
    if (activeLoanBySpecimen.has(specimenId)) return '在借'
    return placedIds.has(specimenId) ? '在柜' : '未入柜'
  }

  /** 在组合筛选结果上再按保藏状态过滤 */
  const view = storageFilter ? filtered.filter((item) => storageStateOf(item.id) === storageFilter) : filtered

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const toggleAll = (): void => {
    setSelected((prev) => (prev.length === view.length ? [] : view.map((item) => item.id)))
  }

  const applyBatch = async (): Promise<void> => {
    if (selected.length === 0) {
      setMessage('请先勾选要推进状态的标本')
      return
    }
    await specimenStore.getState().bulkSetStatus(selected, batchStatus)
    setMessage(`已把 ${selected.length} 份标本推进为「${batchStatus}」`)
    setSelected([])
  }

  const exportList = (): void => {
    const rows = view.map((item: Specimen) => ({
      code: item.code,
      taxon: specimenTaxon(item),
      site: siteMap.get(item.siteId)?.name ?? '',
      collectDate: item.collectDate,
      method: item.method,
      quantity: item.quantity,
      status: item.status,
      determiner: item.determiner,
      storageState: storageStateOf(item.id)
    }))
    downloadCsv('标本清单.csv', rows as unknown as Record<string, unknown>[], [
      { key: 'code', label: '标本编号' },
      { key: 'taxon', label: '分类阶元' },
      { key: 'site', label: '采集地' },
      { key: 'collectDate', label: '采集日期' },
      { key: 'method', label: '采集方式' },
      { key: 'quantity', label: '数量' },
      { key: 'status', label: '鉴定状态' },
      { key: 'determiner', label: '鉴定人' },
      { key: 'storageState', label: '保藏状态' }
    ])
  }

  const statusCount = (status: DetStatus): number => specimens.filter((item) => item.status === status).length

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">标本清单</h1>
          <p className="page-sub">
            按目/科、鉴定状态、保藏状态（在柜/在借）与采集日期区间筛选，多选后可批量推进鉴定状态；编号规则为「采集地代码-年份-流水号」。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" to="/collect">
            去采集登记
          </Link>
          <button className="btn-ghost" type="button" onClick={exportList}>
            导出命中清单
          </button>
        </div>
      </header>

      <section className="panel flex flex-wrap items-end gap-3">
        <div>
          <span className="field-label">目</span>
          <select className="field-input w-36" value={filter.order} onChange={(e) => setFilter({ order: e.target.value })}>
            <option value="">全部</option>
            {orders.map((order) => (
              <option key={order} value={order}>
                {order}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">科</span>
          <select
            className="field-input w-36"
            value={filter.family}
            onChange={(e) => setFilter({ family: e.target.value })}
          >
            <option value="">全部</option>
            {families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">鉴定状态</span>
          <select
            className="field-input w-32"
            value={filter.status}
            onChange={(e) => setFilter({ status: e.target.value as DetStatus | '' })}
          >
            <option value="">全部</option>
            {DET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">采集地</span>
          <select
            className="field-input w-48"
            value={filter.siteId}
            onChange={(e) => setFilter({ siteId: e.target.value })}
          >
            <option value="">全部</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">保藏状态</span>
          <select
            className="field-input w-32"
            value={storageFilter}
            onChange={(e) => setStorageFilter(e.target.value as StorageFilter)}
          >
            {STORAGE_FILTERS.map((item) => (
              <option key={item} value={item}>
                {item || '全部'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">采集日期起</span>
          <input
            type="date"
            className="field-input w-40"
            value={filter.dateFrom}
            onChange={(e) => setFilter({ dateFrom: e.target.value })}
          />
        </div>
        <div>
          <span className="field-label">采集日期止</span>
          <input
            type="date"
            className="field-input w-40"
            value={filter.dateTo}
            onChange={(e) => setFilter({ dateTo: e.target.value })}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <span className="field-label">关键字（编号/学名/暂定名/采集人）</span>
          <input
            className="field-input"
            placeholder="如 QLB-2026 / 步甲 / 陆昀"
            value={filter.keyword}
            onChange={(e) => setFilter({ keyword: e.target.value })}
          />
        </div>
        <button
          className="btn-ghost"
          type="button"
          onClick={() => {
            reset()
            setStorageFilter('')
          }}
        >
          重置
        </button>
      </section>

      <section className="panel flex flex-wrap items-center gap-3">
        <button className="btn-ghost" type="button" onClick={toggleAll}>
          {selected.length === view.length && view.length > 0 ? '取消全选' : '全选命中'}
        </button>
        <span className="text-sm text-slate-600">
          命中 <b data-testid="hit-count">{view.length}</b> / {specimens.length} 份{storageFilter ? `（${storageFilter}）` : ''}
          ，已选 {selected.length} 份
        </span>
        <select
          className="field-input w-32"
          value={batchStatus}
          onChange={(e) => setBatchStatus(e.target.value as DetStatus)}
        >
          {DET_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <button className="btn-primary" type="button" onClick={() => void applyBatch()}>
          批量推进状态
        </button>
        <div className="ml-auto flex flex-wrap gap-2 text-xs text-slate-500">
          {DET_STATUSES.map((status) => (
            <span key={status} className="inline-flex items-center gap-1">
              <StatusTag status={status} /> {statusCount(status)}
            </span>
          ))}
        </div>
        {message ? <p className="w-full text-sm text-field-700">{message}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {view.map((specimen) => {
          const loan = activeLoanBySpecimen.get(specimen.id)
          const overdue = loan ? overdueDays(loan.dueDate) : 0
          return (
            <SpecimenCard
              key={specimen.id}
              specimen={specimen}
              site={siteMap.get(specimen.siteId)}
              selectable
              selected={selectedSet.has(specimen.id)}
              onToggle={toggle}
              footer={
                <>
                  {loan ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs leading-5 ${
                        overdue > 0
                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                          : 'border-amber-300 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {overdue > 0
                        ? `在借 · 应还 ${loan.dueDate} · 已逾期 ${overdue} 天`
                        : `在借 · 应还 ${loan.dueDate}`}
                    </span>
                  ) : null}
                  <Link className="btn-ghost" to="/determination">
                    去鉴定
                  </Link>
                  <Link className="btn-ghost" to="/storage">
                    去入柜
                  </Link>
                </>
              }
            />
          )
        })}
        {view.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            没有命中的标本，调整筛选条件或去「采集登记」新增
          </p>
        ) : null}
      </section>
    </div>
  )
}
