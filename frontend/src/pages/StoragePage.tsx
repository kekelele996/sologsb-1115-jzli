import { useMemo, useState } from 'react'
import type { Loan, Storage, StorageMethod } from '@/types'
import { STORAGE_METHODS } from '@/types'
import CabinetGrid from '@/components/common/CabinetGrid'
import StatusTag from '@/components/common/StatusTag'
import StorageStateTag from '@/components/common/StorageStateTag'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { specimenStore } from '@/stores/specimenStore'
import { storageStore } from '@/stores/storageStore'
import { loanStore } from '@/stores/loanStore'
import { siteStore } from '@/stores/siteStore'
import { encodeSlot, findSlotConflicts, specimenTaxon, storageSlotText } from '@/utils/codec'
import {
  activeLoanOf,
  buildStorageStateIndex,
  daysBetween,
  isLoanOverdue,
  loansOf,
  overdueDays,
  todayText
} from '@/utils/loan'
import { uid } from '@/utils/id'

/** 出借登记表单（按 specimenId 挂载，切换标本时整体重置） */
function LendForm({ storage, onLent }: { storage: Storage; onLent: (message: string) => void }): JSX.Element {
  const [borrower, setBorrower] = useState('')
  const [purpose, setPurpose] = useState('')
  const [loanDate, setLoanDate] = useState(todayText())
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')

  const submit = async (): Promise<void> => {
    if (!borrower.trim()) {
      setError('请登记借用人')
      return
    }
    if (!purpose.trim()) {
      setError('请填写借用用途')
      return
    }
    if (!dueDate) {
      setError('请选择预计归还日')
      return
    }
    if (dueDate < loanDate) {
      setError('预计归还日不能早于出借日期')
      return
    }
    const record: Loan = {
      id: uid('loan'),
      specimenId: storage.specimenId,
      borrower: borrower.trim(),
      purpose: purpose.trim(),
      loanDate,
      dueDate,
      returnDate: '',
      returnHandler: ''
    }
    await loanStore.getState().save(record)
    onLent(`已办理出借：借用人 ${record.borrower}，预计归还日 ${record.dueDate}；柜位保留并锁定`)
  }

  return (
    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <h3 className="text-xs font-semibold text-sky-800">办理出借</h3>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div>
          <span className="field-label">借用人</span>
          <input className="field-input" value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="如 蓝澈" />
        </div>
        <div>
          <span className="field-label">借用用途</span>
          <input className="field-input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="如 形态比对 / 拍照" />
        </div>
        <div>
          <span className="field-label">出借日期</span>
          <input type="date" className="field-input" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} />
        </div>
        <div>
          <span className="field-label">预计归还日</span>
          <input type="date" className="field-input" value={dueDate} min={loanDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button className="btn-primary mt-3" type="button" onClick={() => void submit()}>
        确认出借
      </button>
    </div>
  )
}

/** 归还登记表单（按在借记录挂载） */
function ReturnForm({ loan, onReturned }: { loan: Loan; onReturned: (message: string) => void }): JSX.Element {
  const [returnDate, setReturnDate] = useState(todayText())
  const [returnHandler, setReturnHandler] = useState('')
  const [error, setError] = useState('')

  const submit = async (): Promise<void> => {
    if (!returnDate) {
      setError('请填写实际归还日期')
      return
    }
    if (returnDate < loan.loanDate) {
      setError('归还日期不能早于出借日期')
      return
    }
    if (!returnHandler.trim()) {
      setError('请填写归还经手人')
      return
    }
    await loanStore.getState().save({ ...loan, returnDate, returnHandler: returnHandler.trim() })
    const overdue = daysBetween(loan.dueDate, returnDate)
    onReturned(
      overdue > 0
        ? `已登记归还（${returnDate}，经手人 ${returnHandler.trim()}），逾期 ${overdue} 天，标本回到在柜状态`
        : `已登记归还（${returnDate}，经手人 ${returnHandler.trim()}），标本回到在柜状态`
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-field-200 bg-field-50/70 p-3">
      <h3 className="text-xs font-semibold text-field-700">登记归还</h3>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div>
          <span className="field-label">实际归还日期</span>
          <input
            type="date"
            className="field-input"
            value={returnDate}
            min={loan.loanDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </div>
        <div>
          <span className="field-label">经手人</span>
          <input
            className="field-input"
            value={returnHandler}
            onChange={(e) => setReturnHandler(e.target.value)}
            placeholder="如 覃羽"
          />
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button className="btn-primary mt-3" type="button" onClick={() => void submit()}>
        确认归还
      </button>
    </div>
  )
}

/** 保藏柜位图：柜-抽屉-盒-位三级展开，拖拽调整插位；在借标本柜位保留但锁定，可办理出借/归还 */
export default function StoragePage(): JSX.Element {
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const storages = usePersistentStore(storageStore, (state) => state.rows)
  const loans = usePersistentStore(loanStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)

  const [cabinet, setCabinet] = useState('C01')
  const [drawers, setDrawers] = useState(2)
  const [boxes, setBoxes] = useState(3)
  const [slots, setSlots] = useState(8)
  const [method, setMethod] = useState<StorageMethod>('针插')
  const [handler, setHandler] = useState('')
  const [picked, setPicked] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [warning, setWarning] = useState('')
  const [detail, setDetail] = useState<Storage | null>(null)

  const today = todayText()
  const codeOf = (specimenId: string): string => specimens.find((item) => item.id === specimenId)?.code ?? '未知'
  const siteName = (siteId: string): string => sites.find((site) => site.id === siteId)?.name ?? '未关联采集地'
  const index = useMemo(() => buildStorageStateIndex(storages, loans, today), [storages, loans, today])

  const onLoanIds = useMemo(
    () => new Set([...index.bySpecimen].filter(([, entry]) => entry.state === '在借').map(([id]) => id)),
    [index]
  )
  const overdueIds = useMemo(
    () =>
      new Set(
        [...index.bySpecimen]
          .filter(([, entry]) => entry.loan !== null && isLoanOverdue(entry.loan, today))
          .map(([id]) => id)
      ),
    [index, today]
  )

  const placedIds = useMemo(() => new Set(storages.map((item) => item.specimenId)), [storages])
  const unplaced = specimens.filter((item) => !placedIds.has(item.id))

  const activeLoan = (specimenId: string): Loan | null => activeLoanOf(loans, specimenId)
  const historyOf = (specimenId: string): Loan[] => loansOf(loans, specimenId)

  const place = async (position: { cabinet: string; drawer: number; box: number; slot: number }): Promise<void> => {
    const specimenId = dragging ?? picked
    if (!specimenId) {
      setWarning('请先在右侧选择或拖动一份未入柜标本')
      return
    }
    // 在借标本柜位锁定：不能改柜（也不能重复入柜）
    if (activeLoan(specimenId)) {
      const current = storages.find((item) => item.specimenId === specimenId)
      setWarning(
        `${codeOf(specimenId)} 正在外借中，柜位${
          current ? ` ${storageSlotText(current)} ` : ''
        }保留并锁定，不能改柜或重复入柜；归还后自动恢复`
      )
      return
    }
    const candidate: Storage = {
      id: storages.find((item) => item.specimenId === specimenId)?.id ?? uid('stg'),
      specimenId,
      method,
      cabinet: position.cabinet,
      drawer: position.drawer,
      box: position.box,
      slot: position.slot,
      storedDate: today,
      handler: handler.trim()
    }
    const conflicts = findSlotConflicts(storages, candidate)
    if (conflicts.length > 0) {
      setWarning(
        `柜位 ${encodeSlot(position.cabinet, position.drawer, position.box, position.slot)} 已被占用：` +
          conflicts
            .map((item) => {
              const loan = activeLoan(item.specimenId)
              return `${codeOf(item.specimenId)}（${item.method}${loan ? `·在借·${loan.borrower}` : ''}）`
            })
            .join('、') +
          '，请换一个插位' +
          (conflicts.some((item) => activeLoan(item.specimenId)) ? '；在借标本须先归还才能出柜腾位' : '或先出柜')
      )
      return
    }
    setWarning('')
    await storageStore.getState().save(candidate)
    setMessage(`${codeOf(specimenId)} 已入柜 ${storageSlotText(candidate)}`)
    setPicked('')
    setDragging(null)
  }

  const takeOut = async (storage: Storage): Promise<void> => {
    const loan = activeLoan(storage.specimenId)
    if (loan) {
      setWarning(`${codeOf(storage.specimenId)} 正在外借（借用人 ${loan.borrower}），归还前不能出柜`)
      return
    }
    await storageStore.getState().remove(storage.id)
    setMessage(`${codeOf(storage.specimenId)} 已从 ${storageSlotText(storage)} 出柜`)
    setDetail(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="page-title">保藏柜位图</h1>
        <p className="page-sub">
          拖动未入柜标本到插位即可入柜；已入柜标本可办理出借，出借期间柜位保留并锁定（不能改柜、出柜或重复出借），归还后恢复在柜。
        </p>
      </header>

      <section className="panel flex flex-wrap items-end gap-3">
        <div>
          <span className="field-label">标本柜编号</span>
          <input className="field-input w-28" value={cabinet} onChange={(e) => setCabinet(e.target.value.toUpperCase())} />
        </div>
        <div>
          <span className="field-label">抽屉数</span>
          <input type="number" min={1} max={8} className="field-input w-20" value={drawers} onChange={(e) => setDrawers(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <span className="field-label">每屉盒数</span>
          <input type="number" min={1} max={8} className="field-input w-20" value={boxes} onChange={(e) => setBoxes(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <span className="field-label">每盒插位</span>
          <input type="number" min={1} max={20} className="field-input w-20" value={slots} onChange={(e) => setSlots(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <span className="field-label">保藏方式</span>
          <select className="field-input w-28" value={method} onChange={(e) => setMethod(e.target.value as StorageMethod)}>
            {STORAGE_METHODS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">经手人</span>
          <input className="field-input w-32" value={handler} onChange={(e) => setHandler(e.target.value)} placeholder="如 覃羽" />
        </div>
        <div className="text-xs text-slate-500">
          已入柜 {storages.length} 份（在柜 {index.inCabinet} · 在借 {index.onLoan}
          {index.overdue > 0 ? <span className="text-amber-600"> · 逾期 {index.overdue}</span> : null}）· 未入柜{' '}
          {unplaced.length} 份
          {picked ? ` · 当前选中 ${codeOf(picked)}` : ''}
        </div>
      </section>

      {warning ? <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p> : null}
      {message ? <p className="rounded-lg border border-field-100 bg-field-50 px-3 py-2 text-sm text-field-700">{message}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <CabinetGrid
          cabinet={cabinet}
          drawers={drawers}
          boxes={boxes}
          slots={slots}
          storages={storages}
          codeOf={codeOf}
          draggingCode={dragging ? codeOf(dragging) : picked ? codeOf(picked) : null}
          onLoanIds={onLoanIds}
          overdueIds={overdueIds}
          onDropSlot={(position) => void place(position)}
          onPickStorage={(storage) => {
            setDetail(storage)
            setWarning('')
            setMessage('')
          }}
        />

        <div className="flex flex-col gap-4">
          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">未入柜标本（拖到插位）</h2>
            <div className="mt-2 max-h-60 space-y-2 overflow-auto">
              {unplaced.map((specimen) => (
                <div
                  key={specimen.id}
                  draggable
                  onDragStart={() => setDragging(specimen.id)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => setPicked(specimen.id)}
                  className={`cursor-grab rounded-lg border px-3 py-2 text-xs transition ${
                    picked === specimen.id ? 'border-field-500 bg-field-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-mono text-field-700">{specimen.code}</p>
                  <p className="text-slate-600">{specimenTaxon(specimen)}</p>
                  <p className="text-slate-400">
                    {siteName(specimen.siteId)} · <StatusTag status={specimen.status} />
                  </p>
                </div>
              ))}
              {unplaced.length === 0 ? <p className="text-xs text-slate-400">所有标本都已入柜</p> : null}
            </div>
          </div>

          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">已入柜明细</h2>
            <ul className="mt-2 space-y-1.5 text-xs">
              {storages.map((storage) => {
                const entry = index.bySpecimen.get(storage.specimenId)
                const state = entry?.state ?? '在柜'
                const loan = entry?.loan ?? null
                const late = loan ? overdueDays(loan, today) : 0
                return (
                  <li key={storage.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-field-700">{storageSlotText(storage)}</span>
                        <span className="text-slate-600">{codeOf(storage.specimenId)}</span>
                        <StorageStateTag state={state} overdueDays={late} />
                      </span>
                      <span className="mt-0.5 block text-slate-400">
                        {storage.method}
                        {loan ? ` · ${loan.borrower} · 应还 ${loan.dueDate}` : ` · 入柜 ${storage.storedDate}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button className="btn-ghost px-2 py-1 text-xs" type="button" onClick={() => setDetail(storage)}>
                        明细
                      </button>
                      <button
                        className="btn-danger px-2 py-1 text-xs"
                        type="button"
                        disabled={state === '在借'}
                        title={state === '在借' ? '在借标本归还前不能出柜' : undefined}
                        onClick={() => void takeOut(storage)}
                      >
                        出柜
                      </button>
                    </span>
                  </li>
                )
              })}
              {storages.length === 0 ? <li className="text-slate-400">暂无入柜记录</li> : null}
            </ul>
          </div>

          {detail ? (
            <div className="panel">
              <h2 className="text-sm font-semibold text-slate-700">插位明细</h2>
              {(() => {
                const entry = index.bySpecimen.get(detail.specimenId)
                const loan = entry?.loan ?? null
                const specimen = specimens.find((item) => item.id === detail.specimenId)
                const late = loan ? overdueDays(loan, today) : 0
                const history = historyOf(detail.specimenId)
                return (
                  <div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <StorageStateTag state={entry?.state ?? '在柜'} overdueDays={late} />
                      <span>
                        柜位 {storageSlotText(detail)} · {detail.method} · 入柜日期 {detail.storedDate} · 经手人{' '}
                        {detail.handler || '—'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      标本：{codeOf(detail.specimenId)}
                      {specimen ? ` · ${specimenTaxon(specimen)} · ${siteName(specimen.siteId)}` : ''}
                    </p>

                    {loan ? (
                      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs text-slate-700">
                        <p className="font-semibold text-sky-800">当前外借</p>
                        <p className="mt-1">
                          借用人 {loan.borrower} · 用途 {loan.purpose}
                        </p>
                        <p className="mt-0.5">
                          出借日 {loan.loanDate} · 预计归还 {loan.dueDate}
                          {late > 0 ? <span className="font-semibold text-amber-600"> · 已逾期 {late} 天</span> : null}
                        </p>
                        <p className="mt-0.5 text-slate-500">柜位保留并锁定，不能改柜、出柜或重复出借</p>
                        <ReturnForm
                          key={loan.id}
                          loan={loan}
                          onReturned={(msg) => {
                            setMessage(msg)
                            setWarning('')
                          }}
                        />
                      </div>
                    ) : (
                      <LendForm
                        key={detail.id}
                        storage={detail}
                        onLent={(msg) => {
                          setMessage(msg)
                          setWarning('')
                        }}
                      />
                    )}

                    {!loan ? (
                      <button className="btn-danger mt-3" type="button" onClick={() => void takeOut(detail)}>
                        出柜
                      </button>
                    ) : null}

                    <div className="mt-3">
                      <h3 className="text-xs font-semibold text-slate-700">出借/归还历史（{history.length}）</h3>
                      <ul className="mt-1.5 space-y-1.5">
                        {history.map((record) => {
                          const returned = record.returnDate !== ''
                          const lateRecord = overdueDays(record, today)
                          return (
                            <li key={record.id} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600">
                              <p>
                                {record.borrower} · {record.purpose}
                              </p>
                              <p className="mt-0.5 text-slate-400">
                                出借 {record.loanDate} · 应还 {record.dueDate} ·{' '}
                                {returned ? (
                                  <>
                                    归还 {record.returnDate} · 经手人 {record.returnHandler || '—'}
                                    {daysBetween(record.dueDate, record.returnDate) > 0
                                      ? `（逾期 ${daysBetween(record.dueDate, record.returnDate)} 天）`
                                      : ''}
                                  </>
                                ) : (
                                  <span className={lateRecord > 0 ? 'font-semibold text-amber-600' : 'text-sky-600'}>
                                    {lateRecord > 0 ? `未归还 · 逾期 ${lateRecord} 天` : '未归还'}
                                  </span>
                                )}
                              </p>
                            </li>
                          )
                        })}
                        {history.length === 0 ? <li className="text-xs text-slate-400">暂无出借记录</li> : null}
                      </ul>
                    </div>

                    <button className="btn-ghost mt-3" type="button" onClick={() => setDetail(null)}>
                      关闭
                    </button>
                  </div>
                )
              })()}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
