import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, getAllOpenFollowUps, getUploads, getTeams, getTeamMembers } from '../lib/db'
import { DISCIPLINE_LABEL, DISCIPLINE_BADGE } from '../lib/disciplineLevels'

export default function Dashboard() {
  const [employees, setEmployees] = useState([])
  const [followups, setFollowups] = useState([])
  const [uploads, setUploads] = useState([])
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null) // { id, name }
  const [teamMembers, setTeamMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getEmployees(), getAllOpenFollowUps(), getUploads(), getTeams()])
      .then(([e, f, u, t]) => { setEmployees(e); setFollowups(f); setUploads(u); setTeams(t) })
      .finally(() => setLoading(false))
  }, [])

  async function handleTeamClick(team) {
    if (selectedTeam?.id === team.id) { setSelectedTeam(null); setTeamMembers([]); return }
    setSelectedTeam(team)
    setLoadingMembers(true)
    const members = await getTeamMembers(team.id)
    setTeamMembers(members)
    setLoadingMembers(false)
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading...</div>

  function getAge(birthdate) {
    if (!birthdate) return null
    const today = new Date()
    const birth = new Date(birthdate)
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age
  }

  const active = employees.filter(e => e.status === 'active')
  const minors15Under = active.filter(e => { const a = getAge(e.birthdate); return a !== null && a <= 15 })
  const minors1617 = active.filter(e => { const a = getAge(e.birthdate); return a !== null && a >= 16 && a < 18 })
  const levelOf = e => e.leadershipStatus || e.disciplineLevel || 'good_standing'
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
          <div className="metric"><div className="metric-label">Active employees</div><div className="metric-value">{active.length}</div></div>
          <div className="metric"><div className="metric-label">In discipline process</div><div className="metric-value" style={{color:withDiscipline.length?'var(--red)':'inherit'}}>{withDiscipline.length}</div></div>
          <div className="metric"><div className="metric-label">Open follow-ups</div><div className="metric-value" style={{color:followups.length?'var(--amber-txt)':'inherit'}}>{followups.length}</div></div>
          <div className="metric"><div className="metric-label">Reports uploaded</div><div className="metric-value">{uploads.length}</div></div>
        </div>

        {/* Teams */}
        <div className="card" style={{marginBottom:16}}>
          <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span className="card-title" style={{marginBottom:0}}><i className="ti ti-users-group" aria-hidden="true" /> Teams</span>
            <span style={{fontSize:12,color:'var(--text-sec)'}}>Click a team to see its members</span>
          </div>
          <div style={{padding:'12px 16px',display:'flex',gap:8,flexWrap:'wrap'}}>
            {teams.length === 0 ? (
              <span style={{fontSize:12,color:'var(--text-ter)'}}>No teams yet — create them from an employee profile.</span>
            ) : teams.map(team => (
              <button
                key={team.id}
                onClick={() => handleTeamClick(team)}
                className="btn btn-sm"
                style={selectedTeam?.id === team.id ? {background:'var(--amber)',borderColor:'var(--amber)',color:'#fff'} : {}}
              >
                <i className="ti ti-users" /> {team.name}
              </button>
            ))}
          </div>

          {selectedTeam && (
            <div style={{borderTop:'0.5px solid var(--border)'}}>
              <div style={{padding:'10px 16px',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:13,fontWeight:500}}>{selectedTeam.name}</span>
                <button className="btn btn-sm" onClick={() => { setSelectedTeam(null); setTeamMembers([]) }}><i className="ti ti-x" /></button>
              </div>
              {loadingMembers ? (
                <div style={{padding:'20px 16px',textAlign:'center',color:'var(--text-sec)',fontSize:13}}>Loading members…</div>
              ) : teamMembers.length === 0 ? (
                <div style={{padding:'20px 16px',textAlign:'center',color:'var(--text-sec)',fontSize:13}}>No active employees on this team yet. Add them from their employee profile.</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Position</th><th>Discipline status</th><th></th></tr></thead>
                  <tbody>
                    {teamMembers.map(m => {
                      const lvl = m.leadershipStatus || m.disciplineLevel || 'good_standing'
                      return (
                        <tr key={m.id}>
                          <td style={{fontWeight:500}}>{m.name}</td>
                          <td style={{color:'var(--text-sec)',fontSize:12}}>{m.currentPosition || m.position || 'Team Member'}</td>
                          <td><span className={`badge ${DISCIPLINE_BADGE[lvl]||'badge-gray'}`}>{DISCIPLINE_LABEL[lvl]||lvl}</span></td>
                          <td><Link to={`/employees/${m.id}`} className="btn btn-sm">View</Link></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Minors section */}
        {(minors15Under.length > 0 || minors1617.length > 0) && (
          <div style={{display:'grid',gridTemplateColumns:minors15Under.length && minors1617.length?'1fr 1fr':'1fr',gap:16,marginBottom:16}}>
            {minors15Under.length > 0 && (
              <div className="card" style={{borderLeft:'3px solid var(--red)',marginBottom:0}}>
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0,color:'var(--red-txt)'}}>
                    <i className="ti ti-alert-triangle" /> Age 15 & under ({minors15Under.length})
                  </span>
                  <div style={{fontSize:11,color:'var(--text-sec)',marginTop:2}}>Most restricted — verify scheduling compliance</div>
                </div>
                {minors15Under.map(e => (
                  <div key={e.id} style={{padding:'9px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      <Link to={`/employees/${e.id}`} style={{fontSize:13,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.name}</Link>
                      <div style={{fontSize:11,color:'var(--text-sec)'}}>{e.currentPosition||e.position||'Team Member'} · Age {getAge(e.birthdate)}</div>
                    </div>
                    <Link to={`/employees/${e.id}`} className="btn btn-sm">View</Link>
                  </div>
                ))}
              </div>
            )}
            {minors1617.length > 0 && (
              <div className="card" style={{borderLeft:'3px solid var(--amber)',marginBottom:0}}>
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0,color:'var(--amber-txt)'}}>
                    <i className="ti ti-alert-circle" /> Ages 16–17 ({minors1617.length})
                  </span>
                  <div style={{fontSize:11,color:'var(--text-sec)',marginTop:2}}>Minor — standard minor labor rules apply</div>
                </div>
                {minors1617.map(e => (
                  <div key={e.id} style={{padding:'9px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      <Link to={`/employees/${e.id}`} style={{fontSize:13,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.name}</Link>
                      <div style={{fontSize:11,color:'var(--text-sec)'}}>{e.currentPosition||e.position||'Team Member'} · Age {getAge(e.birthdate)}</div>
                    </div>
                    <Link to={`/employees/${e.id}`} className="btn btn-sm">View</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Final Warning / Termination callouts */}
        {(finalWarningHours.length > 0 || terminated.length > 0) && (
          <div style={{display:'grid',gridTemplateColumns:finalWarningHours.length && terminated.length ? '1fr 1fr' : '1fr',gap:16,marginBottom:16}}>
            {finalWarningHours.length > 0 && (
              <div className="card" style={{borderLeft:'3px solid var(--red)',marginBottom:0}}>
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0,color:'var(--red-txt)'}}><i className="ti ti-clock-exclamation" /> Final Warning + Reduced Hours ({finalWarningHours.length})</span>
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
              <div className="card" style={{borderLeft:'3px solid #5F5E5A',marginBottom:0}}>
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0,color:'#5F5E5A'}}><i className="ti ti-user-x" /> Termination ({terminated.length})</span>
                </div>
                {terminated.map(e => (
                  <div key={e.id} style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}><Link to={`/employees/${e.id}`} style={{fontSize:13,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.name}</Link></div>
                    <Link to={`/employees/${e.id}`} className="btn btn-sm">View record</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          {/* Follow-ups */}
          <div className="card">
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span className="card-title" style={{marginBottom:0}}><i className="ti ti-calendar-due" aria-hidden="true" /> Follow-ups due</span>
              <Link to="/followups" style={{fontSize:12,color:'var(--blue)',textDecoration:'none'}}>View all</Link>
            </div>
            {dueThisWeek.length === 0 ? (
              <div className="empty-state"><i className="ti ti-check" /><div>No follow-ups due this week</div></div>
            ) : dueThisWeek.map(f => (
              <div key={f.id} style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                <i className="ti ti-clock" style={{color:'var(--amber)',fontSize:18}} aria-hidden="true" />
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{f.employeeName}</div>
                  <div style={{fontSize:12,color:'var(--text-sec)'}}>{f.title} · Due {new Date(f.dueDate).toLocaleDateString()}</div>
                </div>
                <Link to={`/employees/${f.employeeId}`} className="btn btn-sm">View</Link>
              </div>
            ))}
          </div>

          {/* Active discipline */}
          <div className="card">
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span className="card-title" style={{marginBottom:0}}><i className="ti ti-scale" aria-hidden="true" /> Active discipline</span>
              <Link to="/employees" style={{fontSize:12,color:'var(--blue)',textDecoration:'none'}}>All employees</Link>
            </div>
            {withDiscipline.length === 0 ? (
              <div className="empty-state"><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>No active discipline cases</div></div>
            ) : withDiscipline.slice(0, 6).map(e => {
              const lvl = levelOf(e)
              return (
                <div key={e.id} style={{padding:'9px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}>
                    <Link to={`/employees/${e.id}`} style={{fontSize:13,fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.name}</Link>
                  </div>
                  <span className={`badge ${DISCIPLINE_BADGE[lvl]||'badge-gray'}`}>{DISCIPLINE_LABEL[lvl]||lvl}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card" style={{marginTop:16}}>
          <div className="card-body">
            <div className="card-title"><i className="ti ti-bolt" aria-hidden="true" /> Quick actions</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <Link to="/upload" className="btn"><i className="ti ti-upload" aria-hidden="true" /> Upload report</Link>
              <Link to="/verify-upload" className="btn"><i className="ti ti-file-search" aria-hidden="true" /> Verify upload</Link>
              <Link to="/flags" className="btn"><i className="ti ti-alert-circle" aria-hidden="true" /> Review flags</Link>
              <Link to="/documentation" className="btn"><i className="ti ti-file-plus" aria-hidden="true" /> New documentation</Link>
              <Link to="/training" className="btn"><i className="ti ti-school" aria-hidden="true" /> Position training</Link>
              <Link to="/positions" className="btn"><i className="ti ti-list-details" aria-hidden="true" /> Manage positions</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
