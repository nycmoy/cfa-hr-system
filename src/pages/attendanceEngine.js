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

export function formatDateMMDDYYYY(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

export function parseCSVRow(row) {
  const workday = new Date(row.WORKDAY)
  const startVar = parseInt(row.START_VARIANCE) || 0
  const endVar = parseInt(row.END_VARIANCE) || 0
  return {
    name: row.FULL_NAME?.trim().replace(/^"|"$/g, '') || '',
    workday,
    workdayStr: formatDateMMDDYYYY(workday),
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

export function parsePunchVariancePDFFromWords(pages) {
  const employees = {}
  let currentEmp = null

  for (const pageWords of pages) {
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
    }
  }

  return employees
}

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
  const tier1Lates = [] 
  const earlyFlags = []
  const overageFlags = []
  const noshowFlags = []
  const absenceDates = [] 

  // ── 1. GROUP BY DATE TO HANDLE SPLIT SHIFTS / BREAKS ──────────────────────
  const shiftsByDate = {}
  for (const s of shifts) {
    if (!shiftsByDate[s.workdayStr]) shiftsByDate[s.workdayStr] = []
    shiftsByDate[s.workdayStr].push(s)
  }

  for (const [dateStr, daySegments] of Object.entries(shiftsByDate)) {
    const representative = daySegments[0]; // Used for date/window metadata

    // Helper: Detects if a segment was completely missed. 
    // Looks for the PDF flag OR the "half from each side" payroll signature.
    const isMissedSegment = (s) => {
      return s.isNoShowFromPDF || (s.startVar < 0 && s.startVar === s.endVar && Math.abs(s.startVar) > 15);
    };

    // Check if EVERY scheduled segment for this calendar day was missed
    const isFullDayAbsence = daySegments.every(isMissedSegment);

    if (isFullDayAbsence) {
      // Add up total minutes missed across all parts of the day
      const totalMinutesMissed = daySegments.reduce((total, s) => {
         return total + (Math.abs(s.startVar) + Math.abs(s.endVar));
      }, 0);

      noshowFlags.push({
        type: 'noshow',
        date: dateStr,
        workday: representative.workday,
        minutes: totalMinutesMissed,
        detail: daySegments.length > 1
          ? `Full Day Absence — missed all ${daySegments.length} scheduled parts of a split shift`
          : `Full Day Absence — scheduled shift entirely missed`,
        schedStart: representative.schedStart,
        workStart: representative.workStart,
        severity: 'critical',
        status: 'pending',
        segmentCount: daySegments.length,
      })
      
      absenceDates.push({ date: dateStr, workday: representative.workday })
      continue; // Move to the next calendar day!
    }

    // ── 2. EVALUATE PARTIAL DAYS & CONSOLIDATE SPLIT SHIFT PENALTIES ──────────
    let maxLateMins = 0;
    let maxEarlyMins = 0;
    let maxOverageMins = 0;

    for (const s of daySegments) {
      if (isMissedSegment(s)) {
        noshowFlags.push({
          type: 'noshow', 
          date: dateStr,
          workday: s.workday,
          minutes: Math.abs(s.startVar) + Math.abs(s.endVar),
          detail: `Missed Segment — did not clock in for this part of their split shift.`,
          schedStart: s.schedStart,
          workStart: s.workStart,
          severity: 'high', 
          status: 'pending',
          segmentCount: 1,
        })
        continue; 
      }

      const lateMins = s.startVar < 0 ? Math.abs(s.startVar) : 0
      const earlyMins = s.endVar < 0 ? Math.abs(s.endVar) : 0
      const overMins = s.endVar > 0 ? s.endVar : 0

      if (lateMins > maxLateMins) maxLateMins = lateMins;
      if (earlyMins > maxEarlyMins) maxEarlyMins = earlyMins;
      if (overMins > maxOverageMins) maxOverageMins = overMins;
    }

    // ── 3. APPLY RULES TO THE DAILY MAXIMUMS ──────────────────────────────────
    if (maxLateMins >= TIER2_MIN) {
      tier2Flags.push({
        type: 'tier2',
        date: representative.workdayStr,
        workday: representative.workday,
        minutes: maxLateMins,
        detail: `${maxLateMins} min late`,
        windowIdx: representative.windowIdx,
        windowLabel: representative.windowLabel,
        severity: 'high',
        status: 'pending',
      })
    } else if (maxLateMins >= TIER1_MIN && maxLateMins <= TIER1_MAX) {
      tier1Lates.push({
        date: representative.workdayStr,
        workday: representative.workday,
        minutes: maxLateMins,
      })
    }

    if (maxEarlyMins > EARLY_DEP_MIN) {
      earlyFlags.push({
        type: 'early',
        date: representative.workdayStr,
        workday: representative.workday,
        minutes: maxEarlyMins,
        detail: `Left ${maxEarlyMins} min early`,
        severity: 'review',
        status: 'pending',
      })
    }

    if (maxOverageMins > OVERAGE_HRS * 60) {
      overageFlags.push({
        type: 'overage',
        date: representative.workdayStr,
        workday: representative.workday,
        minutes: maxOverageMins,
        detail: `${(maxOverageMins / 60).toFixed(1)} hrs over schedule — possible missed punch`,
        severity: 'review',
        status: 'pending',
      })
    }
  }

  // ── 4. TIER 1: fixed 2-week PAYROLL PERIODS, anchored to Jun 7, 2026 ─────────
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
      const parts = lates.map(l => `${l.minutes} ${l.minutes === 1 ? 'minute' : 'minutes'} late on ${l.date}`)
      const detailText = parts.length === 2
        ? parts.join(' and ')
        : parts.length > 2
          ? parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1]
          : parts[0]

      tier1Docs.push({
        type: 'tier1',
        windowIdx: idx,
        windowLabel: periodLabel,
        count: lates.length,
        lates,
        workday: lates[0].workday,
        date: lates[0].date,
        detail: detailText,
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
    tier1Info: tier1InfoOnly,  
    noshow: noshowFlags,
    early: earlyFlags,
    overage: overageFlags,
    excessiveAbsence: excessiveAbsenceFlags,
    docCount,
    flagsToSave: [...noshowFlags, ...tier2Flags, ...tier1Docs, ...earlyFlags, ...overageFlags, ...excessiveAbsenceFlags],
  }
}