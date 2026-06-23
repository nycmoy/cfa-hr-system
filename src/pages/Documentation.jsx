import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getEmployees, getEmployee, createDocument, getDocuments, updateDocument, getAttendanceFlags, updateFlagStatus } from '../lib/db'
import { generateWrittenWarning, generateFinalWarning, generateCoachingNote, generateVerbalWarning, generateTerminationNotice } from '../lib/pdfGenerator'
import { DOC_TYPES, DOC_TYPE_META, DISCIPLINE_LABEL, nextDisciplineStep } from '../lib/disciplineLevels'
import { summarizeFlagHistory } from '../lib/attendanceEngine'

export default function Documentation() {
  const [searchParams] = useSearchParams()
  const preEmpId = searchParams.get('empId')
  const preFlagId = searchParams.get('flagId')
  const preFlagType = searchParams.get('type')

  const [employees, setEmployees] = useState([])
  const [allDocs, setAllDocs] = useState([])
  const [showForm, setShowForm] = useState(!!preEmpId)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sourceFlag, setSourceFlag] = useState(null)
  const [historySummary, setHistorySummary] = useState(null) // { absenceSummary, lateSummary, combinedSummary, ... }
  const [currentLevel, setCurrentLevel] = useState('good_standing')
  const [recommendedLevel, setRecommendedLevel] = useState('good_standing')

  // Form state
  const [empId, setEmpId] = useState(preEmpId || '')
  const [empName, setEmpName] = useState('')
  const [docType, setDocType] = useState(preFlagType === 'tier2' || preFlagType === 'tier1' || preFlagType === 'noshow' ? 'verbal_warning' : 'written_warning')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [signatureStatus, setSignatureStatus] = useState('pending')
  const [deviationReason, setDeviationReason] = useState('')

  // Attendance-specific fields (per your documentation format)
  const [incidentDate, setIncidentDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [actualTime, setActualTime] = useState('')
  const [minutesLate, setMinutesLate] = useState('')

  // Disciplinary notice form fields — match the exact paper form
  const [operatorName, setOperatorName] = useState('Nyc Moy')
  const [witnessNames, setWitnessNames] = useState('')
  const [priorWarnings, setPriorWarnings] = useState('no')
  const [priorWarningsDetail, setPriorWarningsDetail] = useState('')
  const [policyViolation, setPolicyViolation] = useState('yes')
  const [correctiveAction, setCorrectiveAction] = useState('')
  const [consequences, setConsequences] = useState('')
  const [teamMemberStatement, setTeamMemberStatement] = useState('')

  // Final warning extras
  const [hoursBefore, setHoursBefore] = useState('')
  const [hoursAfter, setHoursAfter] = useState('')
  const [hoursDuration, setHoursDuration] = useState('')
  const [reviewDate, setReviewDate] = useState('')

  const docTypeMeta = DOC_TYPE_META[docType] || {}

  useEffect(() => {
    Promise.all([getEmployees()]).then(async ([e]) => {
      setEmployees(e)
      if (preEmpId) {
        const found = e.find(x => x.id === preEmpId)
        if (found) setEmpName(found.name)
        await loadEmployeeContext(preEmpId, found)
      }
      // Pull the actual flag data so we can pre-fill date/scheduled/actual/late-minutes
      if (preEmpId && preFlagId) {
        const flags = await getAttendanceFlags(preEmpId)
        const flag = flags.find(f => f.id === preFlagId)
        if (flag) {
          setSourceFlag(flag)
          setIncidentDate(flag.date || '')
          setMinutesLate(flag.minutes ? String(flag.minutes) : '')
          setScheduledTime(flag.schedStart || '')
          setActualTime(flag.workStart || '')
          setNotes(flag.detail || '')
          setCorrectiveAction('Team member needs to clock in on time for all scheduled shifts.')
        }
      }
      setLoading(false)
    })
    loadAllDocs()
  }, [])

  // Fetches an employee's full flag history + current discipline level, then
  // computes everything the form auto-fills: absence/late counts + dates,
  // and the recommended next rung on the discipline ladder. Always editable
  // afterward — this only sets sensible defaults, never locks anything.
  async function loadEmployeeContext(targetEmpId, employeeRecord) {
    const [flags, empDetail] = await Promise.all([
      getAttendanceFlags(targetEmpId),
      employeeRecord ? Promise.resolve(employeeRecord) : getEmployee(targetEmpId),
    ])
    const summary = summarizeFlagHistory(flags)
    setHistorySummary(summary)

    const level = empDetail?.leadershipStatus || empDetail?.disciplineLevel || 'good_standing'
    setCurrentLevel(level)
    const suggested = nextDisciplineStep(level)
    setRecommendedLevel(suggested)

    // Pre-fill prior-warnings fields straight from the actual history —
    // editable afterward, never locked.
    if (level !== 'good_standing') {
      setPriorWarnings('yes')
      setPriorWarningsDetail(`${DISCIPLINE_LABEL[level]} on file. ${summary.combinedSummary}`.trim())
    } else if (summary.combinedSummary) {
      setPriorWarnings('yes')
      setPriorWarningsDetail(summary.combinedSummary)
    } else {
      setPriorWarnings('no')
      setPriorWarningsDetail('')
    }

    // Only auto-select the doc type when we didn't already arrive with one
    // implied by a specific flag (preserve existing flag-driven behavior).
    if (!preFlagId) {
      setDocType(suggested === 'good_standing' ? 'verbal_warning' : suggested)
    }

    // Suggest the consequence text for whichever level is being issued
    const consequenceFor = {
      verbal_warning: 'Next step would be a Written Warning.',
      written_warning: 'Next step would be a Final Written Warning with reduced hours.',
      final_warning: 'Next step would be termination.',
      termination: 'This is the final step in the progressive discipline process.',
    }
    setConsequences(consequenceFor[suggested] || '')
  }

  // If the manager manually changes the doc type after the auto-suggestion,
  // keep the consequence text reasonably in sync — but never overwrite text
  // they've already started editing themselves beyond the auto-fill.
  const [consequencesTouched, setConsequencesTouched] = useState(false)
  useEffect(() => {
    if (consequencesTouched) return
    const consequenceFor = {
      verbal_warning: 'Next step would be a Written Warning.',
      written_warning: 'Next step would be a Final Written Warning with reduced hours.',
      final_warning: 'Next step would be termination.',
      termination: 'This is the final step in the progressive discipline process.',
    }
    if (consequenceFor[docType]) setConsequences(consequenceFor[docType])
  }, [docType])

  async function loadAllDocs() {
    const emps = await getEmployees()
    const all = []
    for (const emp of emps) {
      const docs = await getDocuments(emp.id)
      docs.forEach(d => all.push({ ...d, employeeName: emp.name, employeeId: emp.id }))
    }
    all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    setAllDocs(all)
  }

  async function handleSave() {
    if (!empId || !docType) return
    setSaving(true)
    try {
      const docId = `DOC-${Date.now()}`
      const hoursData = docType === 'final_warning' && hoursBefore ? {
        before: hoursBefore, after: hoursAfter, duration: hoursDuration, reviewDate
      } : null

      const incidentDetail = {
        date: incidentDate || (sourceFlag?.date) || '',
        scheduledTime,
        actualTime,
        minutesLate,
      }
      const hasIncidentDetail = incidentDetail.date || incidentDetail.scheduledTime || incidentDetail.actualTime || incidentDetail.minutesLate

      // Generate PDF
      let pdf = null
      const resolvedEmpNameForPdf = empName || employees.find(e => e.id === empId)?.name || 'Unknown'
      const emp = { name: resolvedEmpNameForPdf }
      const noticeFields = {
        operatorName, witnessNames,
        incidentDetail,
        priorWarnings, priorWarningsDetail,
        policyViolation,
        correctiveAction, consequences, teamMemberStatement,
        notes, signatureStatus,
      }

      if (docType === 'verbal_warning') {
        pdf = generateVerbalWarning(emp, incidentDetail, notes, docId, noticeFields)
      } else if (docType === 'written_warning') {
        pdf = generateWrittenWarning(emp, incidentDetail, notes, docId, noticeFields)
      } else if (docType === 'final_warning') {
        pdf = generateFinalWarning(emp, incidentDetail, notes, hoursData, docId, noticeFields)
      } else if (docType === 'termination') {
        pdf = generateTerminationNotice(emp, notes, docId, noticeFields)
      } else if (docType === 'coaching' || docType === 'documentation_only' || docType === 'policy_reminder') {
        pdf = generateCoachingNote(emp, docTypeMeta?.label || 'Documentation', notes, docId)
      }

      if (pdf) pdf.save(`${docId}.pdf`)

      // Firestore rejects `undefined` field values — build the payload defensively
      const resolvedEmpName = empName || employees.find(e => e.id === empId)?.name || ''
      const payload = {
        docId,
        docType,
        date: new Date(date).toLocaleDateString('en-US'),
        notes: notes || '',
        signatureStatus,
        countsTowardDiscipline: docTypeMeta?.counts || false,
        disciplineLevel: docTypeMeta?.disciplineLevel || null,
        deviationReason: deviationReason || '',
        employeeName: resolvedEmpName,
        operatorName: operatorName || '',
        witnessNames: witnessNames || '',
        priorWarnings,
        priorWarningsDetail: priorWarningsDetail || '',
        policyViolation,
        correctiveAction: correctiveAction || '',
        consequences: consequences || '',
        teamMemberStatement: teamMemberStatement || '',
      }
      if (hoursData) payload.hoursData = hoursData
      if (hasIncidentDetail) payload.incidentDetail = incidentDetail
      if (preFlagId) { payload.relatedFlagId = preFlagId; payload.relatedFlagType = preFlagType }

      await createDocument(empId, payload)

      // If discipline level advances, reflect it on the employee record
      if (docTypeMeta?.disciplineLevel) {
        const { updateEmployee } = await import('../lib/db')
        const updates = {
          disciplineLevel: docTypeMeta.disciplineLevel,
          leadershipStatus: docTypeMeta.disciplineLevel,
        }
        if (docTypeMeta.disciplineLevel === 'final_warning' && reviewDate) {
          updates.finalWarningReviewDate = reviewDate
        }
        // Termination is a leadership decision already made by filing this
        // documentation — mark the employee inactive so they drop off the
        // active dashboard/discipline views rather than lingering there.
        if (docTypeMeta.disciplineLevel === 'termination') {
          updates.status = 'inactive'
        }
        await updateEmployee(empId, updates)
      }

      // Mark the originating flag as documented so it drops out of the pending queue
      if (preFlagId) {
        await updateFlagStatus(empId, preFlagId, 'documented', `Documented via ${docTypeMeta?.label || docType} (${docId})`)
      }

      await loadAllDocs()
      setShowForm(false)
      setNotes('')
      setDeviationReason('')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading...</div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Documentation</span>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <i className="ti ti-file-plus" aria-hidden="true" /> New documentation
        </button>
      </div>
      <div className="content">
        <div className="info-box">
          <i className="ti ti-info-circle" aria-hidden="true" />
          <div>Documentation serves three purposes: coaching, accountability, and protection. Not all documentation counts toward discipline. Use document type to distinguish.</div>
        </div>

        <div className="card" style={{padding:0}}>
          <div style={{padding:'10px 14px',borderBottom:'0.5px solid var(--border)',display:'flex',gap:8}}>
            {DOC_TYPES.map(t => (
              <span key={t.value} className={`badge ${t.badge}`} style={{cursor:'default'}}>{t.label}</span>
            ))}
          </div>
          {allDocs.length === 0 ? (
            <div className="empty-state"><i className="ti ti-file-text" /><div>No documentation yet. Create your first one.</div></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Doc ID</th><th>Employee</th><th>Type</th><th>Date</th><th>Counts</th><th>Signature</th><th></th></tr></thead>
              <tbody>
                {allDocs.map(d => {
                  const meta = DOC_TYPES.find(t => t.value === d.docType)
                  return (
                    <tr key={d.id}>
                      <td className="mono">{d.docId}</td>
                      <td><Link to={`/employees/${d.employeeId}`} style={{fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{d.employeeName}</Link></td>
                      <td><span className={`badge ${meta?.badge||'badge-gray'}`}>{meta?.label||d.docType}</span></td>
                      <td className="mono">{d.date}</td>
                      <td>{d.countsTowardDiscipline ? <span className="badge badge-warn">Yes</span> : <span className="badge badge-gray">No</span>}</td>
                      <td><span className={`badge ${d.signatureStatus==='signed'?'badge-ok':d.signatureStatus==='refused'?'badge-danger':'badge-gray'}`}>{d.signatureStatus||'pending'}</span></td>
                      <td><Link to={`/employees/${d.employeeId}`} className="btn btn-sm">View</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{width:600}}>
            <div className="modal-header">
              <div className="modal-header-title">New documentation</div>
              <button className="btn btn-sm" onClick={() => setShowForm(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Employee</label>
                  <select value={empId} onChange={async e => {
                    const newId = e.target.value
                    setEmpId(newId)
                    const found = employees.find(x => x.id === newId)
                    setEmpName(found?.name || '')
                    setConsequencesTouched(false)
                    if (newId) await loadEmployeeContext(newId, found)
                  }}>
                    <option value="">— select —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>

              {historySummary && (historySummary.absenceCount > 0 || historySummary.lateCount > 0 || currentLevel !== 'good_standing') && (
                <div style={{background:'var(--amber-lt)',border:'0.5px solid #FAC775',borderRadius:'var(--radius)',padding:12,marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:500,color:'var(--amber-txt)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6}}>
                    <i className="ti ti-history" aria-hidden="true" /> Attendance history on file
                  </div>
                  {historySummary.combinedSummary && (
                    <div style={{fontSize:13,color:'var(--amber-txt)',marginBottom:6}}>{historySummary.combinedSummary}</div>
                  )}
                  <div style={{fontSize:12,color:'var(--amber-txt)'}}>
                    Current level: <strong>{DISCIPLINE_LABEL[currentLevel]}</strong>
                    {' → '}Recommended next step: <strong>{DISCIPLINE_LABEL[recommendedLevel] || recommendedLevel}</strong>
                  </div>
                  <div style={{fontSize:11,color:'var(--amber-txt)',marginTop:6,fontStyle:'italic'}}>
                    Auto-filled below — all fields remain editable. Leadership makes the final call.
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Documentation type</label>
                <select value={docType} onChange={e => setDocType(e.target.value)}>
                  {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}{t.counts ? ' (counts toward discipline)' : ' (does NOT count toward discipline)'}</option>)}
                </select>
              </div>

              {docTypeMeta?.counts ? (
                <div className="danger-box"><i className="ti ti-alert-triangle" aria-hidden="true" /><div>This documentation <strong>will count toward discipline status</strong>. Leadership must approve before issuing.</div></div>
              ) : (
                <div className="info-box"><i className="ti ti-info-circle" aria-hidden="true" /><div>This documentation will <strong>NOT</strong> advance discipline status. It appears on the timeline as a coaching record only.</div></div>
              )}

              {['verbal_warning','written_warning','final_warning','termination'].includes(docType) && (
                <div style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:14,marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:10}}>Disciplinary notice details</div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Operator / Supervisor name</label>
                      <input type="text" value={operatorName} onChange={e=>setOperatorName(e.target.value)} />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Witness name(s) — if any</label>
                      <input type="text" value={witnessNames} onChange={e=>setWitnessNames(e.target.value)} placeholder="Optional" />
                    </div>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Prior warnings on this subject?</label>
                      <select value={priorWarnings} onChange={e=>setPriorWarnings(e.target.value)}>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {priorWarnings === 'yes' && (
                      <div className="form-group" style={{margin:0}}>
                        <label className="form-label">How many and what kind?</label>
                        <input type="text" value={priorWarningsDetail} onChange={e=>setPriorWarningsDetail(e.target.value)} placeholder="e.g. 1 Verbal Warning on 5/1/26" />
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Violation of written Unit policy?</label>
                    <select value={policyViolation} onChange={e=>setPolicyViolation(e.target.value)}>
                      <option value="yes">Yes — Punctuality and Attendance policy</option>
                      <option value="no">No</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Corrective action to be taken by team member</label>
                    <textarea value={correctiveAction} onChange={e=>setCorrectiveAction(e.target.value)} placeholder="e.g. Guillermo needs to clock in on time for his scheduled shifts" style={{minHeight:56}} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Consequences of failure to improve</label>
                    <textarea value={consequences} onChange={e=>{setConsequences(e.target.value); setConsequencesTouched(true)}} placeholder="e.g. Next step would be reduced hours" style={{minHeight:56}} />
                  </div>

                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Team member statement (optional)</label>
                    <textarea value={teamMemberStatement} onChange={e=>setTeamMemberStatement(e.target.value)} placeholder="Leave blank if completing in person — employee can write/sign on the printed copy" style={{minHeight:56}} />
                  </div>
                </div>
              )}

              {['verbal_warning','written_warning','final_warning'].includes(docType) && (
                <div style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:14,marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:10}}>Attendance incident detail</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Incident date</label>
                      <input type="text" value={incidentDate} onChange={e=>setIncidentDate(e.target.value)} placeholder="MM/DD/YYYY" />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Minutes late</label>
                      <input type="text" value={minutesLate} onChange={e=>setMinutesLate(e.target.value)} placeholder="14" />
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Scheduled time</label>
                      <input type="text" value={scheduledTime} onChange={e=>setScheduledTime(e.target.value)} placeholder="e.g. 7:00 AM" />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Actual arrival time</label>
                      <input type="text" value={actualTime} onChange={e=>setActualTime(e.target.value)} placeholder="e.g. 7:14 AM" />
                    </div>
                  </div>
                </div>
              )}

              {docType === 'final_warning' && (
                <div style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:14,marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:10}}>Hours reduction (optional)</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Hours before</label>
                      <input type="number" value={hoursBefore} onChange={e=>setHoursBefore(e.target.value)} placeholder="36" />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Hours after</label>
                      <input type="number" value={hoursAfter} onChange={e=>setHoursAfter(e.target.value)} placeholder="28" />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Duration</label>
                      <input type="text" value={hoursDuration} onChange={e=>setHoursDuration(e.target.value)} placeholder="30 days" />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Review date</label>
                      <input type="date" value={reviewDate} onChange={e=>setReviewDate(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Record the conversation, concern, or action taken…" style={{minHeight:90}} />
              </div>

              {docTypeMeta?.counts && (
                <div className="form-group">
                  <label className="form-label">If deviating from calculated level — reason</label>
                  <textarea value={deviationReason} onChange={e => setDeviationReason(e.target.value)} placeholder="Document reason for any leadership override of calculated discipline level…" style={{minHeight:60}} />
                </div>
              )}

              <div className="divider" />
              <div style={{fontSize:12,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:10}}>Signatures</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                {[['pending','Pending'],['signed','Signed'],['refused','Refused to sign']].map(([v,l]) => (
                  <div key={v} onClick={() => setSignatureStatus(v)} style={{
                    border:`0.5px solid ${signatureStatus===v?'var(--amber)':'var(--border)'}`,
                    borderRadius:'var(--radius)',padding:'10px 12px',cursor:'pointer',textAlign:'center',
                    background:signatureStatus===v?'var(--amber-lt)':'transparent',
                  }}>
                    <div style={{fontSize:12,fontWeight:500}}>{l}</div>
                  </div>
                ))}
              </div>
              {signatureStatus === 'refused' && (
                <div style={{fontSize:12,color:'var(--red-txt)',marginTop:8}}>
                  <i className="ti ti-info-circle" aria-hidden="true" /> Refusal to sign does not prevent this documentation from being completed. A witness signature is required.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !empId}>
                <i className="ti ti-device-floppy" aria-hidden="true" /> {saving ? 'Saving…' : 'Save & generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
