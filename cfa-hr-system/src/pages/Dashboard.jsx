import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, getAllOpenFollowUps, getUploads } from '../lib/db'

export default function Dashboard() {
  const [employees, setEmployees] = useState([])
  const [followups, setFollowups] = useState([])
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getEmployees(), getAllOpenFollowUps(), getUploads()])
      .then(([e, f, u]) => { setEmployees(e); setFollowups(f); setUploads(u) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading...</div>

  const active = employees.filter(e => e.status === 'active')
  const withDiscipline = employees.filter(e => e.disciplineLevel && e.disciplineLevel !== 'good_standing')
  const dueThisWeek = followups.filter(f => {
    if (!f.dueDate) return false
    const due = new Date(f.dueDate)
    const now = new Date()
    const diff = (due - now) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 7
  })

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Dashboard</span>
        <span style={{fontSize:12,color:'var(--text-sec)',fontFamily:'var(--mono)'}}>
          {new Date().toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric',year:'numeric'})}
        </span>
      </div>
      <div className="content">
        {/* Summary metrics */}
        <div className="metric-grid metric-grid-4" style={{marginBottom:16}}>
          <div className="metric">
            <div className="metric-label">Active employees</div>
            <div className="metric-value">{active.length}</div>
          </div>
          <div className="metric">
            <div className="metric-label">In discipline process</div>
            <div className="metric-value" style={{color: withDiscipline.length ? 'var(--red)' : 'inherit'}}>
              {withDiscipline.length}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Open follow-ups</div>
            <div className="metric-value" style={{color: followups.length ? 'var(--amber-txt)' : 'inherit'}}>
              {followups.length}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Reports uploaded</div>
            <div className="metric-value">{uploads.length}</div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          {/* Follow-ups due */}
          <div className="card">
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span className="card-title" style={{marginBottom:0}}><i className="ti ti-calendar-due" aria-hidden="true" /> Follow-ups due</span>
              <Link to="/followups" style={{fontSize:12,color:'var(--blue)',textDecoration:'none'}}>View all</Link>
            </div>
            {dueThisWeek.length === 0 ? (
              <div className="empty-state"><i className="ti ti-check" /><div>No follow-ups due this week</div></div>
            ) : (
              dueThisWeek.map(f => (
                <div key={f.id} style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                  <i className="ti ti-clock" style={{color:'var(--amber)',fontSize:18}} aria-hidden="true" />
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500}}>{f.employeeName}</div>
                    <div style={{fontSize:12,color:'var(--text-sec)'}}>{f.title} · Due {new Date(f.dueDate).toLocaleDateString()}</div>
                  </div>
                  <Link to={`/employees/${f.employeeId}`} className="btn btn-sm">View</Link>
                </div>
              ))
            )}
          </div>

          {/* Discipline status */}
          <div className="card">
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span className="card-title" style={{marginBottom:0}}><i className="ti ti-scale" aria-hidden="true" /> Active discipline</span>
              <Link to="/employees" style={{fontSize:12,color:'var(--blue)',textDecoration:'none'}}>All employees</Link>
            </div>
            {withDiscipline.length === 0 ? (
              <div className="empty-state"><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>No active discipline cases</div></div>
            ) : (
              withDiscipline.slice(0, 6).map(e => {
                const level = e.leadershipStatus || e.disciplineLevel
                const levelLabel = {
                  written_warning: 'Written warning',
                  final_warning: 'Final warning',
                  coaching: 'Coaching',
                }[level] || level
                const cls = level === 'final_warning' ? 'badge-danger' : 'badge-warn'
                return (
                  <div key={e.id} style={{padding:'9px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      <Link to={`/employees/${e.id}`} style={{fontSize:13,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.name}</Link>
                    </div>
                    <span className={`badge ${cls}`}>{levelLabel}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card" style={{marginTop:16}}>
          <div className="card-body">
            <div className="card-title"><i className="ti ti-bolt" aria-hidden="true" /> Quick actions</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <Link to="/upload" className="btn"><i className="ti ti-upload" aria-hidden="true" /> Upload time report</Link>
              <Link to="/flags" className="btn"><i className="ti ti-alert-circle" aria-hidden="true" /> Review flags</Link>
              <Link to="/documentation" className="btn"><i className="ti ti-file-plus" aria-hidden="true" /> New documentation</Link>
              <Link to="/training" className="btn"><i className="ti ti-school" aria-hidden="true" /> Update training</Link>
              <Link to="/ratings" className="btn"><i className="ti ti-star" aria-hidden="true" /> Rate employee</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
