import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getEmployees, getAttendanceFlags, updateFlagStatus, createDocument, updateEmployee, getDocuments } from '../lib/db'
import { summarizeFlagHistory } from '../lib/attendanceEngine'
import { DISCIPLINE_LABEL, DISCIPLINE_BADGE, DOC_TYPE_META, nextDisciplineStep, computeEffectiveDisciplineLevel } from '../lib/disciplineLevels'

const TYPE_LABELS = {
  noshow: 'No-show', tier2: '10+ min late', tier1: 'Tier 1 pattern',
  early: 'Early departure', overage: 'Overage', excessive_absence: 'Excessive absences',
}

export default function FlagReview() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState([]) // [{flag, employee}] sorted by employee name then date
  const [idx, setIdx] = useState(0)
  const [action, setAction] = useState(null) // 'excuse' | 'override' | 'document' | null
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [docSummary, setDocSummary] = useState(null) // computed before showing document action

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const employees = await getEmployees()
    const active = employees.filter(e => (e.status || 'active') === 'active')
    const allPairs = []
    for (const emp of active) {
      const flags = await getAttendanceFlags(emp.id)
      const pending = flags.filter(f => !f.status || f.status === 'pending')
      for (const flag of pending) allPairs.push({ flag, employee: emp })
    }
    // Sort: by employee name first, then by date ascending within each employee
    allPairs.sort((a, b) => {
      const nameCmp = a.employee.name.localeCompare(b.employee.name)
      if (nameCmp !== 0) return nameCmp
      return new Date(a.flag.date) - new Date(b.flag.date)
    })
    setQueue(allPairs)
    setIdx(0)
    setDone(allPairs.length === 0)
    setLoading(false)
  }

  const current = queue[idx]

  // When the current item changes, pre-compute the history summary for
  // the "Create documentation" action so it's ready without an async wait.
  useEffect(() => {
    if (!current) return
    setAction(null)
    setNote('')
    setDocSummary(null)
    ;(async () => {
      const [allFlags, empDocs] = await Promise.all([
        getAttendanceFlags(current.employee.id),
        getDocuments(current.employee.id),
      ])
      const summary = summarizeFlagHistory(allFlags, current.flag.date)
      // Compute effective level from recent docs (auto-rolls off with the 4-month window)
      const computedLevel = computeEffectiveDisciplineLevel(empDocs, current.flag.date)
      const storedLevel = current.employee.leadershipStatus || current.employee.disciplineLevel || 'good_standing'
      const hasRecentActivity = summary.absenceCount > 0 || summary.lateCount > 0
      const effectiveLevel = hasRecentActivity ? computedLevel : 'good_standing'
      const suggested = nextDisciplineStep(effectiveLevel)
      setDocSummary({ summary, level: storedLevel, effectiveLevel, suggested, allFlags })
    })()
  }, [idx])

  async function handleExcuse() {
    setSaving(true)
    await updateFlagStatus(current.employee.id, current.flag.id, 'excused', note)
    advance()
  }

  async function handleOverride() {
    if (!note.trim()) return
    setSaving(true)
    await updateFlagStatus(current.employee.id, current.flag.id, 'overridden', note)
    advance()
  }

  async function handleCreateDoc() {
    if (!docSummary) return
    setSaving(true)
    const { summary, level, suggested } = docSummary
    const docMeta = DOC_TYPE_META[suggested] || DOC_TYPE_META['verbal_warning']

    const priorText = [
      level !== 'good_standing' ? `${DISCIPLINE_LABEL[level]} on file.` : '',
      summary.combinedSummary,
    ].filter(Boolean).join(' ')

    const docId = `DOC-${Date.now()}`
    await createDocument(current.employee.id, {
      docId,
      empId: current.employee.id,
      empName: current.employee.name,
      docType: suggested,
      date: current.flag.date,
      incidentDate: current.flag.date,
      flagType: current.flag.type,
      minutes: current.flag.minutes,
      notes: current.flag.detail || '',
      priorWarnings: priorText ? 'yes' : 'no',
      priorWarningsDetail: priorText,
      correctiveAction: 'Team member needs to report to all scheduled shifts on time.',
      consequences: docMeta?.nextStepText || '',
      countsTowardDiscipline: true,
      autoCreated: true,
    })

    // Advance employee discipline level
    if (docMeta?.disciplineLevel) {
      await updateEmployee(current.employee.id, {
        disciplineLevel: docMeta.disciplineLevel,
        leadershipStatus: docMeta.disciplineLevel,
      })
    }

    await updateFlagStatus(current.employee.id, current.flag.id, 'documented', `Auto-documented as ${docMeta?.label || suggested}`)
    advance()
  }

  function advance() {
    setSaving(false)
    setAction(null)
    setNote('')
    const next = idx + 1
    if (next >= queue.length) {
      setDone(true)
    } else {
      setIdx(next)
    }
  }

  function skip() {
    setAction(null)
    setNote('')
    const next = idx + 1
    if (next >= queue.length) setDone(true)
    else setIdx(next)
  }

  if (loading) return (
    <><div className="topbar"><span className="topbar-title">Flag review</span></div>
    <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading flags…</div></>
  )

  if (done) return (
    <><div className="topbar"><span className="topbar-title">Flag review</span></div>
    <div className="content">
      <div className="card" style={{textAlign:'center',padding:48}}>
        <i className="ti ti-circle-check" style={{fontSize:48,color:'var(--green)',display:'block',marginBottom:16}} />
        <div style={{fontSize:18,fontWeight:500,marginBottom:8}}>All flags reviewed</div>
        <div style={{fontSize:14,color:'var(--text-sec)',marginBottom:24}}>No more pending flags in the queue.</div>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button className="btn" onClick={() => { setDone(false); load() }}>Refresh queue</button>
          <Link to="/flags" className="btn btn-primary">Back to flags</Link>
        </div>
      </div>
    </div></>
  )

  const f = current.flag
  const emp = current.employee
  const displayDate = f.type === 'tier1' ? f.windowLabel : f.date
  const storedLevel = emp.leadershipStatus || emp.disciplineLevel || 'good_standing'
  const level = docSummary?.level || storedLevel
  const suggested = docSummary?.suggested || nextDisciplineStep(docSummary?.effectiveLevel || storedLevel)
  const suggestedMeta = DOC_TYPE_META[suggested]
  const rolledOff = storedLevel !== 'good_standing' && docSummary && !docSummary.summary?.combinedSummary

  return (
    <>
      <div className="topbar">
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <Link to="/flags" className="btn btn-sm"><i className="ti ti-arrow-left" /></Link>
          <span className="topbar-title">Flag review</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:13,color:'var(--text-sec)'}}>
            {idx + 1} of {queue.length} pending
          </span>
          <button className="btn btn-sm" onClick={skip} disabled={saving}>Skip →</button>
        </div>
      </div>

      <div className="content" style={{maxWidth:640,margin:'0 auto'}}>
        {/* Progress bar */}
        <div style={{background:'var(--border)',borderRadius:4,height:4,marginBottom:20,overflow:'hidden'}}>
          <div style={{height:'100%',background:'var(--amber)',borderRadius:4,width:`${((idx)/queue.length)*100}%`,transition:'width .3s'}} />
        </div>

        {/* Flag card */}
        <div className="card" style={{marginBottom:16}}>
          <div style={{padding:'14px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <Link to={`/employees/${emp.id}`} style={{fontSize:16,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{emp.name}</Link>
              <div style={{fontSize:12,color:'var(--text-sec)',marginTop:2}}>
                {emp.currentPosition || emp.position || 'Team Member'}
                {' · '}Current status: <span className={`badge ${DISCIPLINE_BADGE[level]||'badge-gray'}`} style={{fontSize:11}}>{DISCIPLINE_LABEL[level]}</span>
              </div>
            </div>
            <span className={`badge ${['noshow','tier2','tier1'].includes(f.type)?'badge-danger':f.type==='early'?'badge-info':'badge-gray'}`} style={{fontSize:13}}>
              {TYPE_LABELS[f.type]||f.type}
            </span>
          </div>
          <div style={{padding:'16px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div><div style={{fontSize:11,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>Date</div>
                <div style={{fontSize:14,fontFamily:'var(--mono)'}}>{displayDate}</div>
              </div>
              <div><div style={{fontSize:11,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>Minutes</div>
                <div style={{fontSize:14}}>{f.minutes || '—'}</div>
              </div>
            </div>
            <div><div style={{fontSize:11,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>Detail</div>
              <div style={{fontSize:13,color:'var(--text)'}}>{f.detail || '—'}</div>
            </div>
            {docSummary?.summary?.combinedSummary && (
              <div style={{marginTop:12,background:'var(--amber-lt)',border:'0.5px solid #FAC775',borderRadius:'var(--radius)',padding:10}}>
                <div style={{fontSize:11,fontWeight:500,color:'var(--amber-txt)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4}}>Prior history (within 4-month window)</div>
                <div style={{fontSize:12,color:'var(--amber-txt)'}}>{docSummary.summary.combinedSummary}</div>
              </div>
            )}
            {rolledOff && (
              <div style={{marginTop:12,background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius)',padding:10}}>
                <div style={{fontSize:11,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4}}>
                  <i className="ti ti-clock-off" /> Prior offenses rolled off
                </div>
                <div style={{fontSize:12,color:'var(--text-sec)'}}>
                  {DISCIPLINE_LABEL[level]} is on record but all prior incidents are outside the 4-month window. Escalation resets — this incident will be treated as a first offense.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action selector */}
        {!action && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
            <button
              onClick={() => setAction('excuse')}
              className="btn"
              style={{padding:'14px 8px',flexDirection:'column',display:'flex',alignItems:'center',gap:6,height:'auto'}}
            >
              <i className="ti ti-check" style={{fontSize:20,color:'var(--green)'}} />
              <span style={{fontSize:13}}>Excuse</span>
            </button>
            <button
              onClick={() => setAction('override')}
              className="btn"
              style={{padding:'14px 8px',flexDirection:'column',display:'flex',alignItems:'center',gap:6,height:'auto'}}
            >
              <i className="ti ti-shield-off" style={{fontSize:20,color:'var(--amber)'}} />
              <span style={{fontSize:13}}>Override</span>
            </button>
            <button
              onClick={() => setAction('document')}
              className="btn btn-primary"
              style={{padding:'14px 8px',flexDirection:'column',display:'flex',alignItems:'center',gap:6,height:'auto'}}
            >
              <i className="ti ti-file-plus" style={{fontSize:20}} />
              <span style={{fontSize:13}}>Create documentation</span>
            </button>
          </div>
        )}

        {/* Excuse flow */}
        {action === 'excuse' && (
          <div className="card" style={{padding:16,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>Excuse this flag</div>
            <div className="form-group">
              <label className="form-label">Reason (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Doctor's note provided, family emergency…" style={{minHeight:72}} />
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn" onClick={() => setAction(null)}>Back</button>
              <button className="btn btn-primary" onClick={handleExcuse} disabled={saving}>
                <i className="ti ti-check" /> {saving ? 'Saving…' : 'Confirm excuse'}
              </button>
            </div>
          </div>
        )}

        {/* Override flow */}
        {action === 'override' && (
          <div className="card" style={{padding:16,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>Override this flag</div>
            <div className="warn-box" style={{marginBottom:12}}>
              <i className="ti ti-info-circle" />
              <div>A comment is required to override — this removes the flag from consideration permanently.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Override reason (required)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Explain why this flag is being removed…" style={{minHeight:72}} />
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn" onClick={() => setAction(null)}>Back</button>
              <button className="btn btn-primary" onClick={handleOverride} disabled={saving || !note.trim()}>
                <i className="ti ti-shield-off" /> {saving ? 'Saving…' : 'Confirm override'}
              </button>
            </div>
          </div>
        )}

        {/* Document flow */}
        {action === 'document' && (
          <div className="card" style={{padding:16,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>Auto-create documentation</div>
            <div style={{fontSize:12,color:'var(--text-sec)',marginBottom:14}}>
              Based on current discipline level, the recommended next step is:
            </div>
            <div style={{background:'var(--surface)',border:'0.5px solid var(--border)',borderLeft:`3px solid var(--amber)`,borderRadius:'var(--radius)',padding:12,marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:500}}>{suggestedMeta?.label || suggested}</div>
              <div style={{fontSize:12,color:'var(--text-sec)',marginTop:3}}>{suggestedMeta?.counts ? 'Counts toward discipline record.' : 'Does not count toward discipline.'}</div>
              {docSummary?.summary?.combinedSummary && (
                <div style={{fontSize:12,color:'var(--text-sec)',marginTop:6}}>
                  Prior history included: {docSummary.summary.combinedSummary}
                </div>
              )}
            </div>
            <div className="info-box" style={{marginBottom:14}}>
              <i className="ti ti-info-circle" />
              <div>
                This creates the documentation record and marks the flag as documented. For a full form with all fields editable, use{' '}
                <Link to={`/documentation?empId=${emp.id}&flagId=${f.id}&type=${f.type}`} style={{color:'var(--blue)'}}>
                  the full documentation page
                </Link>.
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn" onClick={() => setAction(null)}>Back</button>
              <button className="btn btn-primary" onClick={handleCreateDoc} disabled={saving || !docSummary}>
                <i className="ti ti-file-plus" /> {saving ? 'Creating…' : `Create ${suggestedMeta?.label || 'documentation'}`}
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
          <button className="btn btn-sm" onClick={() => setIdx(Math.max(0, idx-1))} disabled={idx === 0}>← Previous</button>
          <span style={{fontSize:12,color:'var(--text-ter)'}}>
            {queue.slice(idx+1, idx+4).map(x => x.employee.name.split(',')[0]).join(', ')}
            {queue.length - idx - 1 > 3 ? ` +${queue.length - idx - 1 - 3} more` : ''}
          </span>
          <button className="btn btn-sm" onClick={skip} disabled={idx >= queue.length - 1}>Next →</button>
        </div>
      </div>
    </>
  )
}
