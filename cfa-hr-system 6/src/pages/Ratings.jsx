import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getEmployees, getPositions, getAllRatings } from '../lib/db'
import { applicablePositions, missingForEmployee } from '../lib/positionRules'

export default function Ratings() {
  const [searchParams] = useSearchParams()
  const preEmpId = searchParams.get('empId')

  const [employees, setEmployees] = useState([])
  const [positions, setPositions] = useState([])
  const [allRatings, setAllRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('team') // team | individual | incomplete

  useEffect(() => {
    Promise.all([getEmployees(), getPositions(), getAllRatings()]).then(([e, p, r]) => {
      setEmployees(e); setPositions(p); setAllRatings(r)
      setLoading(false)
      if (preEmpId) setView('individual')
    })
  }, [])

  const ratingColor = v => v >= 8 ? 'var(--green)' : v >= 5 ? 'var(--amber)' : 'var(--red)'
  const scoreStyle = v => v >= 8
    ? {background:'var(--green-lt)',color:'var(--green-txt)'}
    : v >= 5 ? {background:'var(--amber-lt)',color:'var(--amber-txt)'}
    : {background:'var(--red-lt)',color:'var(--red-txt)'}

  // Team averages by position
  const teamByPos = {}
  for (const r of allRatings) {
    if (!teamByPos[r.positionId]) teamByPos[r.positionId] = []
    teamByPos[r.positionId].push(r)
  }

  // Individual: latest rating per employee per position
  const byEmp = {}
  for (const r of allRatings) {
    if (!byEmp[r.employeeId]) byEmp[r.employeeId] = {}
    if (!byEmp[r.employeeId][r.positionId] ||
        r.ratedAt?.seconds > byEmp[r.employeeId][r.positionId].ratedAt?.seconds) {
      byEmp[r.employeeId][r.positionId] = r
    }
  }

  // Incomplete: one row per active employee who is missing a rating for
  // at least one applicable position (leadership positions only count if
  // the employee is on the leadership track).
  const activeEmployees = employees.filter(e => (e.status || 'active') === 'active')
  const incomplete = activeEmployees
    .map(emp => {
      const ratedPositionIds = Object.keys(byEmp[emp.id] || {})
      const missing = missingForEmployee(emp, positions, ratedPositionIds)
      return { emp, missing }
    })
    .filter(x => x.missing.length > 0)

  const avg = (arr, key) => arr.reduce((s, r) => s + r[key], 0) / arr.length

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading ratings...</div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Ratings</span>
        <Link to="/training" className="btn btn-primary">
          <i className="ti ti-star" aria-hidden="true" /> Rate employee
        </Link>
      </div>
      <div className="content">
        <div className="tab-row" style={{marginBottom:16}}>
          <div className={`tab${view==='incomplete'?' active':''}`} onClick={() => setView('incomplete')}>
            Incomplete ({incomplete.length})
          </div>
          <div className={`tab${view==='team'?' active':''}`} onClick={() => setView('team')}>Team averages by position</div>
          <div className={`tab${view==='individual'?' active':''}`} onClick={() => setView('individual')}>Individual ratings</div>
        </div>

        {view === 'incomplete' && (
          <div className="card" style={{padding:0}}>
            {incomplete.length === 0 ? (
              <div className="empty-state"><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>Everyone has at least one rating recorded for all their applicable positions.</div></div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Area</th><th>Missing ratings</th><th></th></tr></thead>
                <tbody>
                  {incomplete.map(({ emp, missing }) => (
                    <tr key={emp.id}>
                      <td>
                        <Link to={`/employees/${emp.id}`} style={{fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{emp.name}</Link>
                      </td>
                      <td>
                        <span className="badge badge-info">{emp.area === 'foh' ? 'FOH' : emp.area === 'boh' ? 'BOH' : 'FOH + BOH'}</span>
                        {emp.leadershipTrack && <span className="badge badge-warn" style={{marginLeft:4}}>Leadership</span>}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          {missing.map(p => <span key={p.id} className="badge badge-gray">{p.name}</span>)}
                        </div>
                      </td>
                      <td><Link to={`/training?empId=${emp.id}`} className="btn btn-sm">Rate now</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {view === 'team' && (
          <div className="card" style={{padding:0}}>
            {Object.keys(teamByPos).length === 0 ? (
              <div className="empty-state"><i className="ti ti-star" /><div>No ratings yet. Start by rating employees in the Training section.</div></div>
            ) : (
              Object.entries(teamByPos).map(([posId, rs]) => {
                const gid = avg(rs, 'getsItDone')
                const rid = avg(rs, 'doesItRight')
                const eid = avg(rs, 'doesItEfficiently')
                const overall = ((gid + rid + eid) / 3).toFixed(1)
                const pos = positions.find(p => p.id === posId)
                return (
                  <div key={posId} style={{padding:'14px 20px',borderBottom:'0.5px solid var(--border)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                      <div className="score-circle" style={scoreStyle(parseFloat(overall))}>
                        <div className="score-num">{overall}</div>
                        <div className="score-den">/ 10</div>
                      </div>
                      <div>
                        <div style={{fontSize:14,fontWeight:500}}>{pos?.name || posId}</div>
                        <div style={{fontSize:12,color:'var(--text-sec)'}}>{rs.length} rating{rs.length>1?'s':''} · {new Set(rs.map(r=>r.employeeId)).size} employee{new Set(rs.map(r=>r.employeeId)).size>1?'s':''}</div>
                      </div>
                    </div>
                    {[['Gets it done', gid],['Does it right', rid],['Does it efficiently', eid]].map(([l, v]) => (
                      <div key={l} className="rating-row">
                        <div className="rating-label">{l}</div>
                        <div className="rating-track"><div className="rating-fill" style={{width:`${v*10}%`,background:ratingColor(v)}} /></div>
                        <div className="rating-val">{v.toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        )}

        {view === 'individual' && (
          <div className="card" style={{padding:0}}>
            {allRatings.length === 0 ? (
              <div className="empty-state"><i className="ti ti-star" /><div>No ratings yet.</div></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Employee</th><th>Position</th><th>Gets it done</th><th>Does it right</th><th>Does it efficiently</th><th>Overall</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {allRatings.map(r => {
                    const ov = ((r.getsItDone + r.doesItRight + r.doesItEfficiently) / 3).toFixed(1)
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/employees/${r.employeeId}`} style={{fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{r.employeeName}</Link>
                        </td>
                        <td style={{color:'var(--text-sec)'}}>{r.positionName}</td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div className="rating-track" style={{width:50}}><div className="rating-fill" style={{width:`${r.getsItDone*10}%`,background:ratingColor(r.getsItDone)}} /></div>
                            <span>{r.getsItDone}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div className="rating-track" style={{width:50}}><div className="rating-fill" style={{width:`${r.doesItRight*10}%`,background:ratingColor(r.doesItRight)}} /></div>
                            <span>{r.doesItRight}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div className="rating-track" style={{width:50}}><div className="rating-fill" style={{width:`${r.doesItEfficiently*10}%`,background:ratingColor(r.doesItEfficiently)}} /></div>
                            <span>{r.doesItEfficiently}</span>
                          </div>
                        </td>
                        <td>
                          <div className="score-circle score-circle-sm" style={{...scoreStyle(parseFloat(ov)),display:'inline-flex'}}>
                            <div className="score-num" style={{fontSize:13}}>{ov}</div>
                          </div>
                        </td>
                        <td className="mono">{r.ratedAt ? new Date(r.ratedAt.seconds*1000).toLocaleDateString() : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  )
}
