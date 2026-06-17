// ─── Attendance Rule Engine ───────────────────────────────────────────────────
// Anchor date for 2-week windows
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

export function parseCSVRow(row) {
  // CSV columns: FULL_NAME, LOCATION_NUM, WORKDAY, WORKWEEK,
  // SCHED_START, SCHED_END, WORK_START, WORK_END,
  // START_VARIANCE, END_VARIANCE, TOTAL_VARIANCE
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
  const tier1ByWindow = {}
  const earlyFlags = []
  const overageFlags = []
  const noshowFlags = []

  for (const s of shifts) {
    const lateMins = s.startVar < 0 ? Math.abs(s.startVar) : 0
    const earlyMins = s.endVar < 0 ? Math.abs(s.endVar) : 0
    const overMins = s.endVar > 0 ? s.endVar : 0

    // No-show: arrived 120+ min late
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
    } else if (lateMins >= TIER1_MIN) {
      if (!tier1ByWindow[s.windowIdx]) tier1ByWindow[s.windowIdx] = []
      tier1ByWindow[s.windowIdx].push({
        date: s.workdayStr,
        workday: s.workday,
        minutes: lateMins,
        windowLabel: s.windowLabel,
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

  const tier1Docs = []
  const tier1Info = []

  for (const [widx, lates] of Object.entries(tier1ByWindow)) {
    const entry = {
      type: lates.length >= TIER1_THRESHOLD ? 'tier1' : 'tier1-info',
      windowIdx: parseInt(widx),
      windowLabel: lates[0].windowLabel,
      count: lates.length,
      lates,
      severity: lates.length >= TIER1_THRESHOLD ? 'medium' : 'info',
      status: 'pending',
    }
    if (lates.length >= TIER1_THRESHOLD) tier1Docs.push(entry)
    else tier1Info.push(entry)
  }

  const docCount = noshowFlags.length + tier2Flags.length + tier1Docs.length

  return {
    tier2: tier2Flags,
    tier1Docs: tier1Docs.sort((a, b) => a.windowIdx - b.windowIdx),
    tier1Info: tier1Info.sort((a, b) => a.windowIdx - b.windowIdx),
    noshow: noshowFlags,
    early: earlyFlags,
    overage: overageFlags,
    docCount,
    allFlags: [...noshowFlags, ...tier2Flags, ...tier1Docs],
  }
}
