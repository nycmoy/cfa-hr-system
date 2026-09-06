// ─── Discipline Ladder — single source of truth ──────────────────────────────
// Verbal Warning → Written Warning → Final Written Warning + Reduced Hours → Termination

export const LEVEL_ORDER = {
  good_standing: 0,
  verbal_warning: 1,
  written_warning: 2,
  final_warning: 3,
  termination: 4,
}

// Computes an employee's current effective discipline level by looking at
// which documentation records fall within the rolling 4-month window.
// When a prior offense rolls off, this function returns a lower level —
// potentially good_standing — so the displayed status drops automatically.
// Called on profile load and silently stored back to Firestore so every
// page that reads disciplineLevel stays current without a separate job.
export function computeEffectiveDisciplineLevel(docs, asOfDate = new Date(), rolloffMonths = 4) {
  const cutoff = asOfDate instanceof Date ? asOfDate : new Date(asOfDate)
  const rolloffStart = new Date(cutoff)
  rolloffStart.setMonth(rolloffStart.getMonth() - rolloffMonths)

  let highest = 'good_standing'

  for (const d of docs) {
    if (!d.countsTowardDiscipline) continue
    // Use createdAt timestamp if available, fall back to the doc date field
    const docDate = d.createdAt?.seconds
      ? new Date(d.createdAt.seconds * 1000)
      : d.date ? new Date(d.date) : null
    if (!docDate || isNaN(docDate)) continue
    if (docDate < rolloffStart || docDate > cutoff) continue

    const level = d.docType // verbal_warning, written_warning, etc.
    if ((LEVEL_ORDER[level] || 0) > (LEVEL_ORDER[highest] || 0)) {
      highest = level
    }
  }

  return highest
}

export const DISCIPLINE_LEVELS = [
  { value: 'good_standing',  label: 'Good standing',                 badge: 'badge-ok',     counts: false },
  { value: 'verbal_warning', label: 'Verbal Warning',                badge: 'badge-info',   counts: true  },
  { value: 'written_warning', label: 'Written Warning',              badge: 'badge-warn',   counts: true  },
  { value: 'final_warning',  label: 'Final Written Warning + Reduced Hours', badge: 'badge-danger', counts: true },
  { value: 'termination',    label: 'Termination',                  badge: 'badge-danger', counts: true  },
]

export const DISCIPLINE_LABEL = Object.fromEntries(DISCIPLINE_LEVELS.map(l => [l.value, l.label]))
export const DISCIPLINE_BADGE = Object.fromEntries(DISCIPLINE_LEVELS.map(l => [l.value, l.badge]))

// Documentation types — what a manager files. Distinct from discipline LEVEL,
// since not every documentation type advances discipline (e.g. coaching notes).
export const DOC_TYPES = [
  { value: 'coaching',            label: 'Coaching note',                          counts: false, badge: 'badge-info', disciplineLevel: null },
  { value: 'documentation_only',  label: 'Documentation only (record, no advance)', counts: false, badge: 'badge-info', disciplineLevel: null },
  { value: 'policy_reminder',     label: 'Policy reminder',                        counts: false, badge: 'badge-gray', disciplineLevel: null },
  { value: 'verbal_warning',      label: 'Verbal Warning',                         counts: true,  badge: 'badge-info', disciplineLevel: 'verbal_warning' },
  { value: 'written_warning',     label: 'Written Warning',                        counts: true,  badge: 'badge-warn', disciplineLevel: 'written_warning' },
  { value: 'final_warning',       label: 'Final Written Warning + Reduced Hours',  counts: true,  badge: 'badge-danger', disciplineLevel: 'final_warning' },
  { value: 'termination',         label: 'Termination',                           counts: true,  badge: 'badge-danger', disciplineLevel: 'termination' },
]

export const DOC_TYPE_META = Object.fromEntries(DOC_TYPES.map(t => [t.value, t]))

// The next step up the ladder from a given current level — used to suggest
// (never auto-apply) the calculated/recommended discipline level.
export function nextDisciplineStep(currentLevel) {
  const idx = DISCIPLINE_LEVELS.findIndex(l => l.value === currentLevel)
  if (idx === -1 || idx === DISCIPLINE_LEVELS.length - 1) return currentLevel
  return DISCIPLINE_LEVELS[idx + 1].value
}
