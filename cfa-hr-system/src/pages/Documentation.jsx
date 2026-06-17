import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getEmployees, getEmployee, createDocument, getDocuments, updateDocument } from '../lib/db'
import { generateWrittenWarning, generateFinalWarning, generateCoachingNote } from '../lib/pdfGenerator'

const DOC_TYPES = [
  { value: 'coaching', label: 'Coaching note', counts: false, badge: 'badge-info' },
  { value: 'attendance_concern', label: 'Attendance concern', counts: false, badge: 'badge-info' },
  { value: 'written_warning', label: 'Written warning', counts: true, badge: 'badge-warn' },
  { value: 'final_warning', label: 'Final warning', counts: true, badge: 'badge-danger' },
  { value: 'policy_reminder', label: 'Policy reminder', counts: false, badge: 'badge-gray' },
]

export default function Documentation() {
  const [searchParams] = useSearchParams()
  const preEmpId = searchParams.get('empId')

  const [employees, setEmployees] = useState([])
  const [allDocs, setAllDocs] = useState([])
  const [showForm, setShowForm] = useState(!!preEmpId)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [empId, setEmpId] = useState(preEmpId || '')
  const [empName, setEmpName] = useState('')
  const [docType, setDocType] = useState('written_warning')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [signatureStatus, setSignatureStatus] = useState('pending')
  const [deviationReason, setDeviationReason] = useState('')

  // Final warning extras
  const [hoursBefore, setHoursBefore] = useState('')
  const [hoursAfter, setHoursAfter] = useState('')
  const [hoursDuration, setHoursDuration] = useState('')
  const [reviewDate, setReviewDate] = useState('')

  const docTypeMeta = DOC_TYPES.find(d => d.value === docType)

  useEffect(() => {
    Promise.all([getEmployees()]).then(([e]) => {
      setEmployees(e)
      if (preEmpId) {
        const found = e.find(x => x.id === preEmpId)
        if (found) setEmpName(found.name)
      }
      setLoading(false)
    })
    loadAllDocs()
  }, [])

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

      // Generate PDF
      let pdf = null
      const emp = { name: empName }
      if (docType === 'written_warning') {
        pdf = generateWrittenWarning(emp, [], notes, docId)
      } else if (docType === 'final_warning') {
        pdf = generateFinalWarning(emp, [], notes, hoursData, docId)
      } else if (docType === 'coaching' || docType === 'attendance_concern') {
        pdf = generateCoachingNote(emp, docType === 'coaching' ? 'General coaching' : 'Attendance concern', notes, docId)
      }

      if (pdf) pdf.save(`${docId}.pdf`)

      await createDocument(empId, {
        docId,
        docType,
        date: new Date(date).toLocaleDateString('en-US'),
        notes,
        signatureStatus,
        countsTowardDiscipline: docTypeMeta?.counts || false,
        deviationReason,
        hoursData,
        employeeName: empName,
      })

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
          <i className="ti ti-file-plus" aria-hidden="true" /> New document
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
            <div className="empty-state"><i className="ti ti-file-text" /><div>No documents yet. Create your first one.</div></div>
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
                  <select value={empId} onChange={e => {
                    setEmpId(e.target.value)
                    const found = employees.find(x => x.id === e.target.value)
                    setEmpName(found?.name || '')
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

              <div className="form-group">
                <label className="form-label">Document type</label>
                <select value={docType} onChange={e => setDocType(e.target.value)}>
                  {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}{t.counts ? ' (counts toward discipline)' : ' (does NOT count toward discipline)'}</option>)}
                </select>
              </div>

              {docTypeMeta?.counts ? (
                <div className="danger-box"><i className="ti ti-alert-triangle" aria-hidden="true" /><div>This document <strong>will count toward discipline status</strong>. Leadership must approve before issuing.</div></div>
              ) : (
                <div className="info-box"><i className="ti ti-info-circle" aria-hidden="true" /><div>This document will <strong>NOT</strong> advance discipline status. It appears on the timeline as a coaching record only.</div></div>
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
                  <i className="ti ti-info-circle" aria-hidden="true" /> Refusal to sign does not prevent this document from being completed. A witness signature is required.
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
