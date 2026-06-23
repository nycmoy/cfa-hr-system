import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, getAllOpenFollowUps, getUploads } from '../lib/db'
import { DISCIPLINE_LABEL, DISCIPLINE_BADGE } from '../lib/disciplineLevels'

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
  const levelOf = e => e.leadershipStatus || e.disciplineLevel || 'good_standing'
  // Inactive employees should never surface in dashboard discipline call-outs
  const withDiscipline = active.filter(e => levelOf(e) !== 'good_standing')
  const finalWarningHours = active.filter(e => levelOf(e) === 'final_warning')
  const terminated = active.filter(e => levelOf(e) === 'termination')

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

        {/* Final Warning + Reduced Hours / Termination callouts */}
        {(finalWarningHours.length > 0 || terminated.length > 0) && (
          <div style={{display:'grid',gridTemplateColumns: finalWarningHours.length && terminated.length ? '1fr 1fr' : '1fr',gap:16,marginBottom:16}}>
            {finalWarningHours.length > 0 && (
              <div className="card" style={{borderLeft:'3px solid var(--red)',borderRadius:'0 var(--radius-lg) var(--radius-lg) 0',marginBottom:0}}>
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0,color:'var(--red-txt)'}}>
                    <i className="ti ti-clock-exclamation" aria-hidden="true" /> Final Warning + Reduced Hours ({finalWarningHours.length})
                  </span>
                </div>
                {finalWarningHours.map(e => (
                  <div key={e.id} style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      <Link to={`/employees/${e.id}`} style={{fontSize:13,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.name}</Link>
                      <div style={{fontSize:11,color:'var(--text-sec)'}}>Review date: {e.finalWarningReviewDate || '—'}</div>
                    </div>
                    <Link to={`/employees/${e.id}`} className="btn btn-sm">Review</Link>
                  </div>
                ))}
              </div>
            )}

            {terminated.length > 0 && (
              <div className="card" style={{borderLeft:'3px solid #5F5E5A',borderRadius:'0 var(--radius-lg) var(--radius-lg) 0',marginBottom:0}}>
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0,color:'#5F5E5A'}}>
                    <i className="ti ti-user-x" aria-hidden="true" /> Termination ({terminated.length})
                  </span>
                </div>
                {terminated.map(e => (
                  <div key={e.id} style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      <Link to={`/employees/${e.id}`} style={{fontSize:13,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.name}</Link>
                    </div>
                    <Link to={`/employees/${e.id}`} className="btn btn-sm">View record</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                const level = levelOf(e)
                return (
                  <div key={e.id} style={{padding:'9px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      <Link to={`/employees/${e.id}`} style={{fontSize:13,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.name}</Link>
                    </div>
                    <span className={`badge ${DISCIPLINE_BADGE[level]||'badge-gray'}`}>{DISCIPLINE_LABEL[level]||level}</span>
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
              <Link to="/training" className="btn"><i className="ti ti-school" aria-hidden="true" /> Position training</Link>
              <Link to="/ratings" className="btn"><i className="ti ti-star" aria-hidden="true" /> Ratings</Link>
              <Link to="/positions" className="btn"><i className="ti ti-list-details" aria-hidden="true" /> Manage positions</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
