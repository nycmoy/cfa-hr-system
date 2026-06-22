// ─── Attendance Rule Engine ───────────────────────────────────────────────────
export const ANCHOR = new Date('2026-06-07')
export const WINDOW_DAYS = 14
export const TIER1_MIN = 5
export const TIER1_MAX = 9
export const TIER2_MIN = 10
export const EARLY_DEP_MIN = 30
export const OVERAGE_HRS = 5
export const TIER1_THRESHOLD = 2

export function getWindowIndex(date) {
  const d = new Date(date)
  const ms = d - ANCHOR
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  return Math.floor(days / WINDOW_DAYS)
}

export function windowLabel(idx) {
  const start = new Date(ANCHOR.getTime() + idx * WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + (WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000)
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(start)}–${fmt(end)}/${end.getFullYear()}`
}

export function windowStartDate(idx) {
  return new Date(ANCHOR.getTime() + idx * WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

export function parseCSVRow(row) {
  const workday = new Date(row.WORKDAY)
  const startVar = parseInt(row.START_VARIANCE) || 0
  const endVar = parseInt(row.END_VARIANCE) || 0
  return {
    name: row.FULL_NAME?.trim().replace(/^"|"$/g, '') || '',
    workday,
    workdayStr: workday.toLocaleDateString('en-US'),
    schedStart: row.SCHED_START,
    schedEnd: row.SCHED_END,
    workStart: row.WORK_START,
    workEnd: row.WORK_END,
    startVar,
    endVar,
    totalVar: parseInt(row.TOTAL_VARIANCE) || 0,
    windowIdx: getWindowIndex(workday),
    windowLabel: windowLabel(getWindowIndex(workday)),
  }
}

export function analyzeEmployee(shifts) {
  const tier2Flags = []
  const tier1Lates = [] // flat list — grouped into rolling windows after the main loop
  const earlyFlags = []
  const overageFlags = []
  const noshowFlags = []
  const absenceDates = [] // for excessive-absence (3+ in rolling 3mo) evaluation

  for (const s of shifts) {
    const lateMins = s.startVar < 0 ? Math.abs(s.startVar) : 0
    const earlyMins = s.endVar < 0 ? Math.abs(s.endVar) : 0
    const overMins = s.endVar > 0 ? s.endVar : 0

    if (lateMins >= 120) {
      noshowFlags.push({
        type: 'noshow',
        date: s.workdayStr,
        workday: s.workday,
        minutes: lateMins,
        detail: `Arrived ${lateMins} min late — possible no-show or missed punch`,
        schedStart: s.schedStart,
        workStart: s.workStart,
        severity: 'critical',
        status: 'pending',
      })
      // Treat as an absence for the excessive-absence evaluation, regardless
      // of whether it's later excused — the flag exists to prompt review.
      absenceDates.push({ date: s.workdayStr, workday: s.workday })
    } else if (lateMins >= TIER2_MIN) {
      tier2Flags.push({
        type: 'tier2',
        date: s.workdayStr,
        workday: s.workday,
        minutes: lateMins,
        detail: `${lateMins} min late`,
        windowIdx: s.windowIdx,
        windowLabel: s.windowLabel,
        severity: 'high',
        status: 'pending',
      })
    } else if (lateMins >= TIER1_MIN && lateMins <= TIER1_MAX) {
      // Collect every 5-9.9 min late individually; rolling-window grouping happens after the loop
      tier1Lates.push({
        date: s.workdayStr,
        workday: s.workday,
        minutes: lateMins,
      })
    }

    if (earlyMins >= EARLY_DEP_MIN) {
      earlyFlags.push({
        type: 'early',
        date: s.workdayStr,
        workday: s.workday,
        minutes: earlyMins,
        detail: `Left ${earlyMins} min early`,
        severity: 'review',
        status: 'pending',
      })
    }

    if (overMins >= OVERAGE_HRS * 60) {
      overageFlags.push({
        type: 'overage',
        date: s.workdayStr,
        workday: s.workday,
        minutes: overMins,
        detail: `${(overMins / 60).toFixed(1)} hrs over schedule — possible missed punch`,
        severity: 'review',
        status: 'pending',
      })
    }
  }

  // ── TIER 1: fixed 2-week PAYROLL PERIODS, anchored to Jun 7, 2026 ─────────
  // Per the handbook, this is a window-based system tied to fixed payroll
  // periods (Jun 7-20, Jun 21-Jul 4, ...) — NOT a true rolling 14-day window.
  // A late on the last day of one period and the first day of the next are
  // in DIFFERENT periods and do not combine, even though they're adjacent.
  const tier1ByPeriod = {}
  for (const l of tier1Lates) {
    const idx = getWindowIndex(l.workday)
    if (!tier1ByPeriod[idx]) tier1ByPeriod[idx] = []
    tier1ByPeriod[idx].push(l)
  }

  const tier1Docs = []
  const tier1InfoOnly = []

  for (const [idxStr, lates] of Object.entries(tier1ByPeriod)) {
    const idx = parseInt(idxStr)
    const periodLabel = windowLabel(idx)
    lates.sort((a, b) => a.workday - b.workday)

    if (lates.length >= TIER1_THRESHOLD) {
      tier1Docs.push({
        type: 'tier1',
        windowIdx: idx,
        windowLabel: periodLabel,
        count: lates.length,
        lates,
        workday: lates[0].workday,
        date: lates[0].date,
        detail: `${lates.length} minor lates (5–9.9 min) within payroll period ${periodLabel} — triggers documentation`,
        severity: 'medium',
        status: 'pending',
      })
    } else {
      tier1InfoOnly.push({
        type: 'tier1-info',
        windowIdx: idx,
        windowLabel: periodLabel,
        count: lates.length,
        lates,
        workday: lates[0].workday,
        date: lates[0].date,
        detail: `${lates.length} minor late in payroll period ${periodLabel} — below threshold, needs ${TIER1_THRESHOLD - lates.length} more in this period to trigger documentation`,
        severity: 'info',
        status: 'pending',
      })
    }
  }

  // ── EXCESSIVE ABSENCES: 3+ absences (excused or not) in a TRUE rolling 3 months ──
  // Unlike Tier 1 lates, this is not tied to fixed payroll periods — it's a
  // genuine rolling 90-day lookback from each absence.
  const ABSENCE_WINDOW_DAYS = 90
  const ABSENCE_THRESHOLD = 3
  const excessiveAbsenceFlags = []
  const sortedAbsences = [...absenceDates].sort((a, b) => a.workday - b.workday)
  const absenceFlagged = new Set()

  for (let i = 0; i < sortedAbsences.length; i++) {
    if (absenceFlagged.has(sortedAbsences[i].date)) continue
    const anchor = sortedAbsences[i]
    const windowEnd = new Date(anchor.workday.getTime() + (ABSENCE_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000)
    const group = sortedAbsences.filter(a =>
      a.workday >= anchor.workday && a.workday <= windowEnd && !absenceFlagged.has(a.date)
    )
    if (group.length >= ABSENCE_THRESHOLD) {
      group.forEach(a => absenceFlagged.add(a.date))
      const fmt = d => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
      excessiveAbsenceFlags.push({
        type: 'excessive_absence',
        workday: anchor.workday,
        date: anchor.date,
        count: group.length,
        absences: group,
        detail: `${group.length} absences within a rolling 3-month period (${fmt(anchor.workday)}–${fmt(windowEnd)}) — flagged for evaluation regardless of excused status`,
        severity: 'medium',
        status: 'pending',
      })
    }
  }

  const docCount = noshowFlags.length + tier2Flags.length + tier1Docs.length

  return {
    tier2: tier2Flags,
    tier1Docs,
    tier1Info: tier1InfoOnly,  // not saved — display only in baseline view
    noshow: noshowFlags,
    early: earlyFlags,
    overage: overageFlags,
    excessiveAbsence: excessiveAbsenceFlags,
    docCount,
    // Only flags that get saved to Firestore:
    flagsToSave: [...noshowFlags, ...tier2Flags, ...tier1Docs, ...earlyFlags, ...overageFlags, ...excessiveAbsenceFlags],
  }
}
