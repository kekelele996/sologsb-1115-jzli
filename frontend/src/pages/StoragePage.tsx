import { useMemo, useState } from 'react'
import type { Loan, Storage, StorageMethod } from '@/types'
import { STORAGE_METHODS } from '@/types'
import CabinetGrid from '@/components/common/CabinetGrid'
import StatusTag from '@/components/common/StatusTag'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { specimenStore } from '@/stores/specimenStore'
import { storageStore } from '@/stores/storageStore'
import { siteStore } from '@/stores/siteStore'
import { loanStore } from '@/stores/loanStore'
import { encodeSlot, findSlotConflicts, specimenTaxon, storageSlotText } from '@/utils/codec'
import { loansOfSpecimen, overdueDays, todayText } from '@/utils/loan'
import { uid } from '@/utils/id'

/** 默认预计归还日：出借后 30 天 */
function defaultDueDate(): string {
  return new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
}

/** 保藏柜位图：柜-抽屉-盒-位三级展开，拖拽入柜；已入柜标本可办理出借/归还，外借历史保留 */
export default function StoragePage(): JSX.Element {
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const storages = usePersistentStore(storageStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)
  const loans = usePersistentStore(loanStore, (state) => state.rows)

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
  const [lending, setLending] = useState<Storage | null>(null)
  const [borrower, setBorrower] = useState('')
  const [purpose, setPurpose] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate())
  const [returning, setReturning] = useState<Storage | null>(null)
  const [returnDate, setReturnDate] = useState(todayText())
  const [returnHandler, setReturnHandler] = useState('')

  const codeOf = (specimenId: string): string => specimens.find((item) => item.id === specimenId)?.code ?? '未知'
  const siteName = (siteId: string): string => sites.find((site) => site.id === siteId)?.name ?? '未关联采集地'
  const placedIds = useMemo(() => new Set(storages.map((item) => item.specimenId)), [storages])
  const unplaced = specimens.filter((item) => !placedIds.has(item.id))
  /** 在借（未归还）记录：specimenId → Loan */
  const activeLoanBySpecimen = useMemo(() => {
    const map = new Map<string, Loan>()
    loans.forEach((loan) => {
      if (!loan.returnDate) map.set(loan.specimenId, loan)
    })
    return map
  }, [loans])

  const place = async (position: { cabinet: string; drawer: number; box: number; slot: number }): Promise<void> => {
    const specimenId = dragging ?? picked
    if (!specimenId) {
      setWarning('请先在右侧选择或拖动一份未入柜标本')
      return
    }
    const existing = storages.find((item) => item.specimenId === specimenId)
    if (existing && activeLoanBySpecimen.has(specimenId)) {
      setWarning(`${codeOf(specimenId)} 正在外借中，归还前不能改柜`)
      return
    }
    const candidate: Storage = {
      id: existing?.id ?? uid('stg'),
      specimenId,
      method,
      cabinet: position.cabinet,
      drawer: position.drawer,
      box: position.box,
      slot: position.slot,
      storedDate: new Date().toISOString().slice(0, 10),
      handler: handler.trim()
    }
    const conflicts = findSlotConflicts(storages, candidate)
    if (conflicts.length > 0) {
      setWarning(
        `柜位 ${encodeSlot(position.cabinet, position.drawer, position.box, position.slot)} 已被占用：` +
          conflicts.map((item) => `${codeOf(item.specimenId)}（${item.method}）`).join('、') +
          '，请换一个插位或先出柜'
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
    if (activeLoanBySpecimen.has(storage.specimenId)) {
      setWarning(`${codeOf(storage.specimenId)} 正在外借中，归还前不能出柜`)
      return
    }
    setWarning('')
    await storageStore.getState().remove(storage.id)
    setMessage(`${codeOf(storage.specimenId)} 已从 ${storageSlotText(storage)} 出柜`)
    setDetail(null)
  }

  const openLend = (storage: Storage): void => {
    setLending(storage)
    setReturning(null)
    setBorrower('')
    setPurpose('')
    setDueDate(defaultDueDate())
    setWarning('')
  }

  const openReturn = (storage: Storage): void => {
    setReturning(storage)
    setLending(null)
    setReturnDate(todayText())
    setReturnHandler(handler)
    setWarning('')
  }

  const lend = async (): Promise<void> => {
    if (!lending) return
    if (activeLoanBySpecimen.has(lending.specimenId)) {
      setWarning(`${codeOf(lending.specimenId)} 已有未归还的外借记录，不能重复出借`)
      return
    }
    if (!borrower.trim() || !purpose.trim() || !dueDate) {
      setWarning('请完整填写借用人、用途和预计归还日')
      return
    }
    setWarning('')
    await loanStore.getState().save({
      id: uid('loan'),
      specimenId: lending.specimenId,
      borrower: borrower.trim(),
      purpose: purpose.trim(),
      loanDate: todayText(),
      dueDate,
      returnDate: null,
      returnHandler: ''
    })
    setMessage(`${codeOf(lending.specimenId)} 已出借给 ${borrower.trim()}，柜位 ${storageSlotText(lending)} 保留`)
    setLending(null)
  }

  const takeBack = async (): Promise<void> => {
    if (!returning) return
    const loan = activeLoanBySpecimen.get(returning.specimenId)
    if (!loan) {
      setWarning(`${codeOf(returning.specimenId)} 没有在借记录`)
      return
    }
    if (!returnDate || !returnHandler.trim()) {
      setWarning('请填写实际归还日期和经手人')
      return
    }
    setWarning('')
    await loanStore.getState().save({ ...loan, returnDate, returnHandler: returnHandler.trim() })
    setMessage(`${codeOf(returning.specimenId)} 已归还（经手 ${returnHandler.trim()}），回到在柜状态`)
    setReturning(null)
  }

  const detailLoan = detail ? activeLoanBySpecimen.get(detail.specimenId) : undefined
  const detailHistory = detail ? loansOfSpecimen(loans, detail.specimenId) : []

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="page-title">保藏柜位图</h1>
        <p className="page-sub">
          按柜—抽屉—盒三级展开插位，空位虚线显示；拖动标本到插位即可入柜，重复占用会列出已有标本。已入柜标本可办理出借，在借期间柜位保留，但不能改柜、出柜或重复出借。
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
          已入柜 {storages.length} 份（在借 {activeLoanBySpecimen.size} 份）· 未入柜 {unplaced.length} 份
          {picked ? ` · 当前选中 ${codeOf(picked)}` : ''}
        </div>
      </section>

      {warning ? <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p> : null}
      {message ? <p className="rounded-lg border border-field-100 bg-field-50 px-3 py-2 text-sm text-field-700">{message}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <CabinetGrid
          cabinet={cabinet}
          drawers={drawers}
          boxes={boxes}
          slots={slots}
          storages={storages}
          codeOf={codeOf}
          draggingCode={dragging ? codeOf(dragging) : picked ? codeOf(picked) : null}
          isLoaned={(specimenId) => activeLoanBySpecimen.has(specimenId)}
          onDropSlot={(position) => void place(position)}
          onPickStorage={(storage) => setDetail(storage)}
        />

        <div className="flex flex-col gap-4">
          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">未入柜标本（拖到插位）</h2>
            <div className="mt-2 max-h-72 space-y-2 overflow-auto">
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
                const loan = activeLoanBySpecimen.get(storage.specimenId)
                const overdue = loan ? overdueDays(loan.dueDate) : 0
                return (
                  <li key={storage.id} className="rounded-lg border border-slate-200 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-mono text-field-700">{storageSlotText(storage)}</span>
                        <span className="ml-2 text-slate-600">{codeOf(storage.specimenId)}</span>
                        <span className="ml-1 text-slate-400">{storage.method}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {loan ? (
                          <button className="btn-primary" type="button" onClick={() => openReturn(storage)}>
                            归还
                          </button>
                        ) : (
                          <>
                            <button className="btn-ghost" type="button" onClick={() => openLend(storage)}>
                              出借
                            </button>
                            <button className="btn-danger" type="button" onClick={() => void takeOut(storage)}>
                              出柜
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    {loan ? (
                      <p className="mt-1 text-[11px]">
                        <span
                          className={`mr-1 inline-flex rounded-full border px-1.5 py-px ${
                            overdue > 0
                              ? 'border-rose-300 bg-rose-50 text-rose-600'
                              : 'border-amber-300 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {overdue > 0 ? `在借 · 已逾期 ${overdue} 天` : '在借'}
                        </span>
                        <span className="text-slate-500">
                          借用人 {loan.borrower} · 应还 {loan.dueDate}
                        </span>
                      </p>
                    ) : null}
                  </li>
                )
              })}
              {storages.length === 0 ? <li className="text-slate-400">暂无入柜记录</li> : null}
            </ul>
          </div>

          {lending ? (
            <div className="panel">
              <h2 className="text-sm font-semibold text-slate-700">办理出借 · {codeOf(lending.specimenId)}</h2>
              <p className="mt-1 text-xs text-slate-500">
                柜位 {storageSlotText(lending)} 保留；出借期间不能改柜、出柜或重复出借。
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <div>
                  <span className="field-label">借用人</span>
                  <input
                    className="field-input"
                    value={borrower}
                    onChange={(e) => setBorrower(e.target.value)}
                    placeholder="如 陈默"
                  />
                </div>
                <div>
                  <span className="field-label">用途</span>
                  <input
                    className="field-input"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="如 形态比对 / 拍照 / 展览"
                  />
                </div>
                <div>
                  <span className="field-label">预计归还日</span>
                  <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary" type="button" onClick={() => void lend()}>
                    确认出借
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => setLending(null)}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {returning ? (
            <div className="panel">
              <h2 className="text-sm font-semibold text-slate-700">办理归还 · {codeOf(returning.specimenId)}</h2>
              {activeLoanBySpecimen.get(returning.specimenId) ? (
                <p className="mt-1 text-xs text-slate-500">
                  借用人 {activeLoanBySpecimen.get(returning.specimenId)?.borrower} · 应还{' '}
                  {activeLoanBySpecimen.get(returning.specimenId)?.dueDate}
                  {overdueDays(activeLoanBySpecimen.get(returning.specimenId)?.dueDate ?? '') > 0
                    ? ` · 已逾期 ${overdueDays(activeLoanBySpecimen.get(returning.specimenId)?.dueDate ?? '')} 天`
                    : ''}
                </p>
              ) : null}
              <div className="mt-2 flex flex-col gap-2">
                <div>
                  <span className="field-label">实际归还日期</span>
                  <input
                    type="date"
                    className="field-input"
                    value={returnDate}
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
                <div className="flex gap-2">
                  <button className="btn-primary" type="button" onClick={() => void takeBack()}>
                    确认归还
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => setReturning(null)}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {detail ? (
            <div className="panel">
              <h2 className="text-sm font-semibold text-slate-700">插位明细</h2>
              <p className="mt-1 text-xs text-slate-600">
                柜位 {storageSlotText(detail)} · {detail.method} · 入柜日期 {detail.storedDate} · 经手人{' '}
                {detail.handler || '—'}
              </p>
              <p className="text-xs text-slate-600">
                标本：{codeOf(detail.specimenId)} ·{' '}
                {detailLoan ? (
                  <span className="text-amber-700">在借（应还 {detailLoan.dueDate}）</span>
                ) : (
                  <span className="text-field-700">在柜</span>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {detailLoan ? (
                  <button className="btn-primary" type="button" onClick={() => openReturn(detail)}>
                    办理归还
                  </button>
                ) : (
                  <button className="btn-ghost" type="button" onClick={() => openLend(detail)}>
                    办理出借
                  </button>
                )}
                <button className="btn-ghost" type="button" onClick={() => setDetail(null)}>
                  关闭
                </button>
              </div>
              <h3 className="mt-3 text-xs font-semibold text-slate-600">外借历史（{detailHistory.length} 条）</h3>
              <ul className="mt-1 space-y-1.5 text-[11px] text-slate-500">
                {detailHistory.map((loan) => {
                  const overdue = loan.returnDate ? 0 : overdueDays(loan.dueDate)
                  return (
                    <li key={loan.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                      <p className="text-slate-600">
                        {loan.borrower} · {loan.purpose}
                      </p>
                      <p>
                        出借 {loan.loanDate} · 应还 {loan.dueDate} ·{' '}
                        {loan.returnDate ? (
                          <span className="text-field-700">
                            实还 {loan.returnDate}（经手 {loan.returnHandler || '—'}）
                          </span>
                        ) : overdue > 0 ? (
                          <span className="text-rose-600">未归还 · 已逾期 {overdue} 天</span>
                        ) : (
                          <span className="text-amber-700">未归还</span>
                        )}
                      </p>
                    </li>
                  )
                })}
                {detailHistory.length === 0 ? <li className="text-slate-400">暂无外借记录</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
