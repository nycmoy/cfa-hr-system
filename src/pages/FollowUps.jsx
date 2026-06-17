import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, createFollowUp, getAllOpenFollowUps, updateDocument } from '../lib/db'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export default function FollowUps() {
  const [followups, setFollowups] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [empId, setEmpId] = useState('')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getAllOpenFollowUps(), getEmployees()]).then(([f, e]) => {
      setFollowups(f); setEmployees(e); setLoading(false)
    })
  }, [])

  async function handleAdd() {
    if (!empId || !title || !dueDate) return
    setSaving(true)
    await createFollowUp(empId, { title, dueDate, notes })
    const updated = await getAllOpenFollowUps()
    setFollowups(updated)
    setShowForm(false)
    setEmpId(''); setTitle(''); setDueDate(''); setNotes('')
    setSaving(false)
  }

  async function completeFollowUp(fu) {
    await updateDoc(doc(db, 'employees', fu.employeeId, 'followups', fu.id), {
      status: 'completed',
      completedAt: serverTimestamp(),
    })
    setFollowups(prev => prev.filter(f => !(f.id === fu.id && f.employeeId === fu.employeeId)))
  }

  const today = new Date()
  const overdue = followups.filter(f => new Date(f.dueDate) < today)
  const dueThisWeek = followups.filter(f => {
    const d = new Date(f.dueDate)
    const diff = (d - today) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 7
  })
  const upcoming = followups.filter(f => (new Date(f.dueDate) - today) / (1000 * 60 * 60 * 24) > 7)

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading...</div>

  const Section = ({ title: t, items, color }) => items.length === 0 ? null : (
    <div className="card" style={{marginBottom:16}}>
      <div style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)'}}>
        <span className="card-title" style={{marginBottom:0,color}}>{t} ({items.length})</span>
      </div>
      {items.map(f => (
        <div key={`${f.employeeId}-${f.id}`} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:'0.5px solid var(--border)'}}>
          <i className="ti ti-clock" style={{color,fontSize:18,flexShrink:0}} aria-hidden="true" />
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500}}>{f.employeeName} — {f.title}</div>
            <div style={{fontSize:12,color:'var(--text-sec)'}}>Due {new Date(f.dueDate).toLocaleDateString()}{f.notes ? ` · ${f.notes}` : ''}</div>
          </div>
          <Link to={`/employees/${f.employeeId}`} className="btn btn-sm">View employee</Link>
          <button className="btn btn-sm" style={{background:'var(--green-lt)',color:'var(--green-txt)',borderColor:'var(--green)'}}
            onClick={() => completeFollowUp(f)}>
            <i className="ti ti-check" /> Complete
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Follow-ups</span>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <i className="ti ti-plus" aria-hidden="true" /> Add follow-up
        </button>
      </div>
      <div className="content">
        <div className="metric-grid metric-grid-3" style={{marginBottom:16}}>
          <div className="metric"><div className="metric-label">Total open</div><div className="metric-value">{followups.length}</div></div>
          <div className="metric"><div className="metric-label">Overdue</div><div className="metric-value" style={{color:overdue.length?'var(--red)':'inherit'}}>{overdue.length}</div></div>
          <div className="metric"><div className="metric-label">Due this week</div><div className="metric-value" style={{color:dueThisWeek.length?'var(--amber-txt)':'inherit'}}>{dueThisWeek.length}</div></div>
        </div>

        {followups.length === 0 ? (
          <div className="empty-state"><i className="ti ti-calendar-check" style={{color:'var(--green)'}} /><div>No open follow-ups. You're all caught up.</div></div>
        ) : (
          <>
            <Section title="Overdue" items={overdue} color="var(--red)" />
            <Section title="Due this week" items={dueThisWeek} color="var(--amber-txt)" />
            <Section title="Upcoming" items={upcoming} color="var(--text-sec)" />
          </>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-header-title">Add follow-up</div>
              <button className="btn btn-sm" onClick={() => setShowForm(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Employee</label>
                <select value={empId} onChange={e => setEmpId(e.target.value)}>
                  <option value="">— select —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 30-day improvement check, Hours reduction review…" />
              </div>
              <div className="form-group">
                <label className="form-label">Due date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Context for this follow-up…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !empId || !title || !dueDate}>
                <i className="ti ti-plus" /> {saving ? 'Saving…' : 'Add follow-up'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
