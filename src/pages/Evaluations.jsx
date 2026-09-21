import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, getEvaluations, createEvaluation, updateEvaluation } from '../lib/db'

const TYPE_LABELS = {
  onboarding_30: '30-Day Evaluation',
  onboarding_60: '60-Day Evaluation',
  onboarding_90: '90-Day Evaluation',
  triannual: 'Triannual Evaluation',
}

const TYPE_BADGE = {
  onboarding_30: 'badge-info',
  onboarding_60: 'badge-info',
  onboarding_90: 'badge-info',
  triannual: 'badge-warn',
}

const STATUS_BADGE = {
  upcoming: 'badge-warn',
  completed: 'badge-ok',
  overdue: 'badge-danger',
  skipped: 'badge-gray',
}

export default function Evaluations() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [upcomingAlerts, setUpcomingAlerts] = useState([])
  const [allEvals, setAllEvals] = useState([])
  const [tab, setTab] = useState('upcoming')
  const [showModal, setShowModal] = useState(false)
  const [modalEmp, setModalEmp] = useState(null)
  const [modalType, setModalType] = useState('')
  const [modalPeriodKey, setModalPeriodKey] = useState('')
  const [completedDate, setCompletedDate] = useState(new Date().toISOString().slice(0,10))
  const [evalNotes, setEvalNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const emps = await getEmployees()
    const active = emps.filter(e => (e.status || 'active') === 'active')
    setEmployees(active)

    const today = new Date(); today.setHours(0,0,0,0)
    const windowEnd = new Date(today); windowEnd.setDate(windowEnd.getDate() + 8)

    const alerts = [], all = []

    for (const emp of active) {
      const hireDate = emp.initialStartDate ? new Date(emp.initialStartDate) : null
      if (!hireDate || isNaN(hireDate)) continue
      const evals = await getEvaluations(emp.id)
      evals.forEach(e => all.push({ ...e, employeeId: emp.id, employeeName: emp.name }))
      const completedTypes = new Set(evals.filter(e => e.status === 'completed').map(e => e.type))

      for (const days of [30, 60, 90]) {
        const type = `onboarding_${days}`
        const dueDate = new Date(hireDate); dueDate.setDate(dueDate.getDate() + days); dueDate.setHours(0,0,0,0)
        const daysUntil = Math.round((dueDate - today) / 86400000)
        const isOverdue = dueDate < today && !completedTypes.has(type)
        const isUpcoming = dueDate >= today && dueDate <= windowEnd && !completedTypes.has(type)
        if (isUpcoming || isOverdue) alerts.push({ employee: emp, type, dueDate, daysUntil, overdue: isOverdue })
      }

      let triDate = new Date(hireDate)
      while (triDate <= today) { triDate = new Date(triDate); triDate.setMonth(triDate.getMonth() + 4) }
      triDate.setHours(0,0,0,0)
      const periodKey = `triannual_${triDate.toISOString().slice(0,7)}`
      const doneThisPeriod = evals.some(e => e.type === 'triannual' && e.periodKey === periodKey && e.status === 'completed')
      const triDaysUntil = Math.round((triDate - today) / 86400000)
      if (!doneThisPeriod && triDate >= today && triDate <= windowEnd) {
        alerts.push({ employee: emp, type: 'triannual', dueDate: triDate, daysUntil: triDaysUntil, periodKey, overdue: false })
      }
    }

    setUpcomingAlerts(alerts.sort((a, b) => a.daysUntil - b.daysUntil))
    setAllEvals(all.sort((a,b) => (b.date||'').localeCompare(a.date||'')))
    setLoading(false)
  }

  function openComplete(emp, type, periodKey = '') {
    setModalEmp(emp)
    setModalType(type)
    setModalPeriodKey(periodKey)
    setCompletedDate(new Date().toISOString().slice(0,10))
    setEvalNotes('')
    setShowModal(true)
  }

  async function handleComplete() {
    setSaving(true)
    await createEvaluation(modalEmp.id, {
      type: modalType,
      periodKey: modalPeriodKey || '',
      scheduledDate: completedDate,
      completedDate,
      notes: evalNotes,
      status: 'completed',
    })
    setShowModal(false)
    await load()
    setSaving(false)
  }

  if (loading) return <><div className="topbar"><span className="topbar-title">Evaluations</span></div><div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading…</div></>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Evaluations</span>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {upcomingAlerts.length > 0 && <span className="badge badge-danger">{upcomingAlerts.length} due soon</span>}
        </div>
      </div>
      <div className="content">
        <div className="tab-row">
          {[['upcoming','Upcoming & Overdue'],['history','History']].map(([v,l]) => (
            <div key={v} className={`tab${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</div>
          ))}
        </div>

        {tab === 'upcoming' && (
          upcomingAlerts.length === 0 ? (
            <div className="empty-state"><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>No evaluations due in the next 8 days.</div></div>
          ) : (
            <div className="card" style={{padding:0}}>
              {upcomingAlerts.map((alert, i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <div style={{width:48,height:48,borderRadius:'var(--radius)',background:alert.overdue?'var(--red-lt)':'var(--amber-lt)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <div style={{fontSize:18,fontWeight:700,color:alert.overdue?'var(--red-txt)':'var(--amber-txt)',lineHeight:1}}>{alert.overdue?'!':alert.daysUntil}</div>
                    <div style={{fontSize:9,color:alert.overdue?'var(--red-txt)':'var(--amber-txt)',textTransform:'uppercase'}}>{alert.overdue?'overdue':'days'}</div>
                  </div>
                  <div style={{flex:1}}>
                    <Link to={`/employees/${alert.employee.id}`} style={{fontSize:14,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{alert.employee.name}</Link>
                    <div style={{display:'flex',gap:8,marginTop:3,flexWrap:'wrap'}}>
                      <span className={`badge ${TYPE_BADGE[alert.type]||'badge-gray'}`}>{TYPE_LABELS[alert.type]||alert.type}</span>
                      <span style={{fontSize:12,color:'var(--text-sec)'}}>Due {alert.dueDate.toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => openComplete(alert.employee, alert.type, alert.periodKey)}>
                    <i className="ti ti-clipboard-check" /> Complete
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'history' && (
          allEvals.length === 0 ? (
            <div className="empty-state"><i className="ti ti-clipboard" /><div>No completed evaluations yet.</div></div>
          ) : (
            <div className="card" style={{padding:0}}>
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Type</th><th>Date</th><th>Status</th><th>Notes</th></tr></thead>
                <tbody>
                  {allEvals.map(e => (
                    <tr key={e.id}>
                      <td><Link to={`/employees/${e.employeeId}`} style={{fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.employeeName}</Link></td>
                      <td><span className={`badge ${TYPE_BADGE[e.type]||'badge-gray'}`}>{TYPE_LABELS[e.type]||e.type}</span></td>
                      <td className="mono" style={{fontSize:11}}>{e.completedDate||e.scheduledDate||'—'}</td>
                      <td><span className={`badge ${STATUS_BADGE[e.status]||'badge-gray'}`}>{e.status}</span></td>
                      <td style={{fontSize:12,color:'var(--text-sec)',maxWidth:200}}>{e.notes||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal" style={{width:440}}>
            <div className="modal-header">
              <div>
                <div className="modal-header-title">Complete evaluation</div>
                <div style={{fontSize:12,color:'var(--text-sec)'}}>{modalEmp?.name} · {TYPE_LABELS[modalType]||modalType}</div>
              </div>
              <button className="btn btn-sm" onClick={()=>setShowModal(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="info-box" style={{marginBottom:14}}>
                <i className="ti ti-info-circle" />
                <div>You're recording this evaluation as complete. You can add detailed evaluation content once the form template is set up.</div>
              </div>
              <div className="form-group"><label className="form-label">Date completed</label><input type="date" value={completedDate} onChange={e=>setCompletedDate(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Notes (optional)</label><textarea value={evalNotes} onChange={e=>setEvalNotes(e.target.value)} placeholder="Overall notes, key topics discussed…" style={{minHeight:80}} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleComplete} disabled={saving}><i className="ti ti-clipboard-check" /> {saving?'Saving…':'Mark complete'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
