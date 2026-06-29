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

// ─── DOCUMENTATION AUTO-FILL: summarize an employee's flag history ───────────
// Given the employee's full list of saved attendance flags (from Firestore),
// produces the counts + date lists needed to pre-fill a disciplinary notice:
// e.g. "3 Absences (03/22/26, 04/13/26, 05/06/26)  2 Lates (04/23/26, 06/06/26)"
//
// "Absence" = no-show flags. "Late" = every individual Tier 2 late, plus
// every individual date inside a Tier 1 pattern flag (since each Tier 1
// flag can bundle multiple actual late dates together).
export function summarizeFlagHistory(flags) {
  const absences = []
  const lates = []

  for (const f of flags) {
    if (f.type === 'noshow') {
      absences.push({ date: f.date, minutes: f.minutes })
    } else if (f.type === 'tier2') {
      lates.push({ date: f.date, minutes: f.minutes })
    } else if (f.type === 'tier1' && Array.isArray(f.lates)) {
      for (const l of f.lates) {
        lates.push({ date: l.date, minutes: l.minutes })
      }
    }
  }

  // De-dupe by date (a date should only ever count once toward "lates" even
  // if it somehow appears in more than one flag) and sort chronologically.
  const dedupeSort = (arr) => {
    const seen = new Map()
    for (const item of arr) {
      if (!seen.has(item.date)) seen.set(item.date, item)
    }
    return Array.from(seen.values()).sort((a, b) => new Date(a.date) - new Date(b.date))
  }

  const absenceList = dedupeSort(absences)
  const lateList = dedupeSort(lates)

  const fmtList = (arr) => arr.map(x => x.date).join(', ')

  return {
    absenceCount: absenceList.length,
    absenceDates: absenceList.map(x => x.date),
    absenceSummary: absenceList.length
      ? `${absenceList.length} Absence${absenceList.length > 1 ? 's' : ''} (${fmtList(absenceList)})`
      : '',
    lateCount: lateList.length,
    lateDates: lateList.map(x => x.date),
    lateSummary: lateList.length
      ? `${lateList.length} Late${lateList.length > 1 ? 's' : ''} (${fmtList(lateList)})`
      : '',
    combinedSummary: [
      absenceList.length ? `${absenceList.length} Absence${absenceList.length > 1 ? 's' : ''} (${fmtList(absenceList)})` : null,
      lateList.length ? `${lateList.length} Late${lateList.length > 1 ? 's' : ''} (${fmtList(lateList)})` : null,
    ].filter(Boolean).join('   '),
  }
}

// ─── PDF PARSING (Actual vs. Scheduled Punch Variance Report) ───────────────
// This report format preserves a no-show signature that the CSV export
// drops entirely: when an employee never clocks in for a scheduled shift,
// the line shows the SCHEDULED start/end times (not an actual punch) with
// the clock-in AND clock-out variance both equal to the same large negative
// value — the whole shift duration was missed on both ends.
//
// IMPORTANT: this report's columns are NOT reliably separable by token
// order in flattened text. A continuation line representing only a
// clock-out event can show its single variance value in either the first
// OR second token slot depending on spacing/whitespace collapsing — token
// order alone misreads a clock-out variance as a clock-in variance (and
// vice versa). The only reliable signal is each word's horizontal (x)
// position on the page, which maps to a fixed column regardless of how
// many other columns are blank ("--") on that line. These ranges were
// measured directly from the report's column headers and validated against
// real multi-segment-shift and no-show rows.
const COLUMNS = {
  date: [40, 190],
  actualTime: [190, 245],
  schedTime: [245, 312],
  ciVar: [312, 352],
  coVar: [352, 415],
  overage: [415, 470],
  shortage: [470, 600],
}

function classifyColumn(xMid) {
  for (const [name, [lo, hi]] of Object.entries(COLUMNS)) {
    if (xMid >= lo && xMid < hi) return name
  }
  return 'unknown'
}

const HEADER_WORDS = new Set([
  'Actual', 'Vs.', 'Scheduled', 'Punch', 'Variance', 'Report', 'Jacksonville',
  '[TX]', 'FSU', 'Overage', 'Shortage', 'Clock-In', 'Clock-Out', 'Employee',
  'Name', 'Date', 'Time', 'Clock-In/Out',
])
const EMP_NAME_RE = /^[A-Z][a-zA-Z'-]+,\s*[A-Z]/
const DATE_TOKEN_RE = /^\d{2}\/\d{2}\/\d{4}$/
const PAGE_FOOTER_RE = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+[AP]M.*Page/
const DATE_RANGE_RE = /^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/

function toSignedMinutes(tok) {
  if (!tok || tok === '--') return null
  const neg = tok.startsWith('(')
  const clean = tok.replace(/[()$,]/g, '')
  if (!/^\d+:\d+$/.test(clean)) return null
  const [h, m] = clean.split(':').map(Number)
  const val = h * 60 + m
  return neg ? -val : val
}

function parseDateMMDDYYYY(str) {
  const [mm, dd, yyyy] = str.split('/').map(Number)
  return new Date(yyyy, mm - 1, dd)
}

/**
 * Parses positioned word data (from extractPdfWords) into
 * { employeeName: [ { date, ciVar, coVar, isNoShow } ] } by classifying
 * every word into its report column by x-coordinate, then grouping words
 * into physical rows by y-coordinate. This is the reliable replacement for
 * token-order-based text parsing — see the column-position note above.
 *
 * `pages` is an array of pages, each an array of { text, x0, x1, top }.
 */
export function parsePunchVariancePDFFromWords(pages) {
  const employees = {}
  let currentEmp = null

  for (const pageWords of pages) {
    // Group into physical rows by top-coordinate, tolerant of small jitter
    const rowBuckets = new Map()
    for (const w of pageWords) {
      const key = Math.round(w.top / 3) * 3
      if (!rowBuckets.has(key)) rowBuckets.set(key, [])
      rowBuckets.get(key).push(w)
    }
    const sortedTops = Array.from(rowBuckets.keys()).sort((a, b) => a - b)

    for (const top of sortedTops) {
      const rowWords = rowBuckets.get(top).sort((a, b) => a.x0 - b.x0)
      const texts = rowWords.map(w => w.text)
      const fullLine = texts.join(' ')

      // Skip rows that are entirely repeated column headers (these can
      // appear mid-document at every page break, not just at position 0)
      if (texts.every(t => HEADER_WORDS.has(t) || t === '|' || t === '-')) continue
      if (PAGE_FOOTER_RE.test(fullLine)) continue
      if (DATE_RANGE_RE.test(fullLine.trim())) continue

      if (EMP_NAME_RE.test(fullLine) && !fullLine.includes('Working Time')) {
        currentEmp = fullLine.trim()
        if (!employees[currentEmp]) employees[currentEmp] = []
        continue
      }
      if (fullLine.includes('Overage Total') || fullLine.includes('Shortage Total') || fullLine.includes('Total Time')) continue

      const dataWords = rowWords.filter(w => w.text !== 'Working' && w.text !== 'Time')
      if (dataWords.length === 0) continue

      const byCol = {}
      for (const w of dataWords) {
        const col = classifyColumn((w.x0 + w.x1) / 2)
        if (!byCol[col]) byCol[col] = []
        byCol[col].push(w.text)
      }

      const dateText = (byCol.date || []).join(' ').trim()
      if (DATE_TOKEN_RE.test(dateText) && currentEmp) {
        const ciToken = (byCol.ciVar || []).join(' ').trim() || null
        const coToken = (byCol.coVar || []).join(' ').trim() || null
        const ciVar = toSignedMinutes(ciToken)
        const coVar = toSignedMinutes(coToken)
        const isNoShow = ciVar !== null && coVar !== null && ciVar === coVar && ciVar <= -60

        employees[currentEmp].push({
          date: dateText,
          workday: parseDateMMDDYYYY(dateText),
          ciVar, coVar, isNoShow,
        })
      }
      // Rows with a recognizable date in another column position, or pure
      // continuation rows showing only additional time tokens with no new
      // variance data, contribute nothing further — each (date, ciVar,
      // coVar) triple is captured fully on its own row in this column
      // layout, unlike the old multi-line "combine with next line" model.
    }
  }

  return employees
}

// Converts the PDF parser's output into the same shape analyzeEmployee()
// expects from CSV rows, so both upload paths can share the same rule
// engine. PDF-sourced no-shows skip straight to a noshow flag; everything
// else maps onto the equivalent startVar/endVar fields.
export function pdfSegmentsToShifts(segments) {
  return segments.map(s => ({
    workday: s.workday,
    workdayStr: s.date,
    startVar: s.ciVar ?? 0,
    endVar: s.coVar ?? 0,
    schedStart: '', schedEnd: '', workStart: '', workEnd: '',
    totalVar: 0,
    windowIdx: getWindowIndex(s.workday),
    windowLabel: windowLabel(getWindowIndex(s.workday)),
    isNoShowFromPDF: s.isNoShow,
  }))
}

export function analyzeEmployee(shifts) {
  const tier2Flags = []
  const tier1Lates = [] // flat list — grouped into rolling windows after the main loop
  const earlyFlags = []
  const overageFlags = []
  const noshowFlags = []
  const absenceDates = [] // for excessive-absence (3+ in rolling 3mo) evaluation

  // Collect raw no-show segments first; consolidate to one-per-day after the
  // main loop (an employee can have multiple scheduled segments in a single
  // day, e.g. split shift, and each missed segment would otherwise count as
  // a separate absence — they should count as ONE absence for that day).
  const rawNoShowSegments = []

  for (const s of shifts) {
    const lateMins = s.startVar < 0 ? Math.abs(s.startVar) : 0
    const earlyMins = s.endVar < 0 ? Math.abs(s.endVar) : 0
    const overMins = s.endVar > 0 ? s.endVar : 0

    // PDF-sourced reports carry an explicit no-show signal (equal negative
    // clock-in/clock-out variance — the whole shift was missed). Trust that
    // directly rather than re-deriving it from "minutes late," since for a
    // genuine no-show there often isn't a real "late arrival" at all.
    if (s.isNoShowFromPDF) {
      rawNoShowSegments.push({
        date: s.workdayStr,
        workday: s.workday,
        minutes: Math.abs(s.startVar),
        source: 'pdf',
      })
      continue // don't also evaluate this shift for late/early/overage
    }

    if (lateMins >= 120) {
      rawNoShowSegments.push({
        date: s.workdayStr,
        workday: s.workday,
        minutes: lateMins,
        schedStart: s.schedStart,
        workStart: s.workStart,
        source: 'csv-late-proxy',
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

  // ── CONSOLIDATE SAME-DAY NO-SHOWS INTO ONE ABSENCE PER DAY ────────────────
  // An employee with a split shift (e.g. lunch + dinner segments) who misses
  // both segments on the same calendar day should count as ONE absence that
  // day, not two. Group raw no-show segments by date, keep the segment with
  // the largest minutes-missed as representative, and note the segment count.
  const noShowByDate = {}
  for (const seg of rawNoShowSegments) {
    if (!noShowByDate[seg.date]) noShowByDate[seg.date] = []
    noShowByDate[seg.date].push(seg)
  }

  for (const [dateStr, segs] of Object.entries(noShowByDate)) {
    const representative = segs.reduce((max, s) => s.minutes > max.minutes ? s : max, segs[0])
    const multiSegment = segs.length > 1
    noshowFlags.push({
      type: 'noshow',
      date: dateStr,
      workday: representative.workday,
      minutes: representative.minutes,
      detail: multiSegment
        ? `No-show — ${segs.length} scheduled segments missed this day (counted as 1 absence)`
        : representative.source === 'pdf'
          ? 'No-show — scheduled shift entirely missed (detected from punch report)'
          : `Arrived ${representative.minutes} min late — possible no-show or missed punch`,
      schedStart: representative.schedStart,
      workStart: representative.workStart,
      severity: 'critical',
      status: 'pending',
      segmentCount: segs.length,
    })
    // One absence per day toward the excessive-absence evaluation, regardless
    // of how many scheduled segments were missed that day or whether it's
    // later excused — the flag exists to prompt review.
    absenceDates.push({ date: dateStr, workday: representative.workday })
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
