// ─── Discipline Ladder — single source of truth ──────────────────────────────
// Verbal Warning → Written Warning → Final Written Warning + Reduced Hours → Termination

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
