import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getEmployee, getAttendanceFlags, getDocuments, getRatings, getFollowUps, updateDocument } from '../lib/db'

const LEVEL_LABEL = { good_standing:'Good standing', coaching:'Coaching', written_warning:'Written warning', final_warning:'Final warning' }
const LEVEL_BADGE = { good_standing:'badge-ok', coaching:'badge-warn', written_warning:'badge-warn', final_warning:'badge-danger' }
const TYPE_LABEL = { noshow:'No-show', tier2:'10+ min late', tier1:'Tier 1 pattern', 'tier1-info':'Minor late', early:'Early departure', overage:'Overage' }

export default function EmployeeDetail() {
  const { id } = useParams()
  const [emp, setEmp] = useState(null)
  const [flags, setFlags] = useState([])
  const [docs, setDocs] = useState([])
  const [ratings, setRatings] = useState([])
  const [followups, setFollowups] = useState([])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getEmployee(id),
      getAttendanceFlags(id),
      getDocuments(id),
      getRatings(id),
      getFollowUps(id),
    ]).then(([e, f, d, r, fu]) => {
      setEmp(e); setFlags(f); setDocs(d); setRatings(r); setFollowups(fu)
      setLoading(false)
    })
  }, [id])

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading profile...</div>
  if (!emp) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Employee not found.</div>

  const level = emp.leadershipStatus || emp.disciplineLevel || 'good_standing'
  const docFlags = flags.filter(f => ['noshow','tier2','tier1'].includes(f.type) && f.status === 'pending')
  const activeEarly = flags.filter(f => f.type === 'early')

  // Rating averages by position
  const ratingsByPos = {}
  for (const r of ratings) {
    if (!ratingsByPos[r.positionId]) ratingsByPos[r.positionId] = []
    ratingsByPos[r.positionId].push(r)
  }

  const ratingColor = v => v >= 8 ? 'var(--green)' : v >= 5 ? 'var(--amber)' : 'var(--red)'
  const scoreClass = v => v >= 8 ? {bg:'var(--green-lt)',color:'var(--green-txt)'} : v >= 5 ? {bg:'var(--amber-lt)',color:'var(--amber-txt)'} : {bg:'var(--red-lt)',color:'var(--red-txt)'}

  return (
    <>
      <div className="topbar">
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <Link to="/employees" className="btn btn-sm"><i className="ti ti-arrow-left" /></Link>
          <span className="topbar-title">{emp.name}</span>
          <span className="mono">{id}</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Link to={`/documentation?empId=${id}`} className="btn btn-primary">
            <i className="ti ti-file-plus" aria-hidden="true" /> New document
          </Link>
        </div>
      </div>

      <div className="content">
        {/* Header card */}
        <div className="card">
          <div className="card-body">
            <div style={{display:'flex',alignItems:'flex-start',gap:16,marginBottom:16}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--amber-lt)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:500,color:'var(--amber-txt)',flexShrink:0}}>
                {emp.name.split(',')[0].slice(0,2).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:18,fontWeight:500,marginBottom:4}}>{emp.name}</div>
                <div style={{fontSize:13,color:'var(--text-sec)',display:'flex',gap:12}}>
                  <span>{emp.position || 'Team Member'}</span>
                  {emp.hireDate && <span>Hired {emp.hireDate}</span>}
                  <span className={`badge ${emp.status==='active'?'badge-ok':'badge-gray'}`}>{emp.status||'active'}</span>
                </div>
              </div>
            </div>

            {/* Discipline tier display */}
            <div style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:14,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10}}>Discipline status</div>
              <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                {[
                  {label:'System calculates',value:emp.disciplineLevel||'good_standing'},
                  {label:'System recommends',value:emp.disciplineLevel||'good_standing'},
                  {label:'Leadership decision',value:level,highlight:true},
                ].map((t,i) => (
                  <div key={i} style={{flex:1,border:`0.5px solid ${t.highlight?'var(--amber)':'var(--border)'}`,borderRadius:'var(--radius)',padding:10,background:t.highlight?'var(--amber-lt)':'var(--surface)',textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5}}>{t.label}</div>
                    <span className={`badge ${LEVEL_BADGE[t.value]||'badge-gray'}`}>{LEVEL_LABEL[t.value]||t.value}</span>
                  </div>
                ))}
              </div>
              {emp.leadershipStatusNote && (
                <div style={{fontSize:12,color:'var(--text-sec)',marginTop:8,fontStyle:'italic'}}>Note: {emp.leadershipStatusNote}</div>
              )}
            </div>

            {/* Stats */}
            <div className="metric-grid metric-grid-4">
              <div className="metric"><div className="metric-label">Flags pending</div><div className="metric-value" style={{color:docFlags.length?'var(--red)':'inherit'}}>{docFlags.length}</div></div>
              <div className="metric"><div className="metric-label">Documents</div><div className="metric-value">{docs.length}</div></div>
              <div className="metric"><div className="metric-label">Ratings</div><div className="metric-value">{ratings.length}</div></div>
              <div className="metric"><div className="metric-label">Follow-ups</div><div className="metric-value">{followups.filter(f=>f.status==='open').length}</div></div>
            </div>
          </div>
        </div>

        {docFlags.length > 0 && (
          <div className="danger-box">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <div>
              <strong>{docFlags.length} attendance flag{docFlags.length>1?'s':''}</strong> pending review.
              <Link to="/flags" style={{color:'var(--red-txt)',marginLeft:8}}>Review now →</Link>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tab-row" style={{marginBottom:0}}>
          {[['overview','Overview'],['attendance','Attendance'],['documents','Documents'],['training','Training'],['ratings','Ratings']].map(([v,l]) => (
            <div key={v} className={`tab${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</div>
          ))}
        </div>

        <div style={{marginTop:16}}>
          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div className="card">
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0}}><i className="ti ti-timeline" /> Recent timeline</span>
                </div>
                <div style={{padding:'12px 16px'}}>
                  {[...docs, ...flags.filter(f=>f.status==='documented')]
                    .sort((a,b) => new Date(b.createdAt?.seconds*1000||b.date) - new Date(a.createdAt?.seconds*1000||a.date))
                    .slice(0,6)
                    .map((item,i) => (
                      <div key={i} style={{display:'flex',gap:10,paddingBottom:12,borderBottom:'0.5px solid var(--border)',marginBottom:12}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:item.docType?'var(--red)':'var(--amber)',flexShrink:0,marginTop:5}} />
                        <div>
                          <div style={{fontSize:13,fontWeight:500}}>{item.docType||TYPE_LABEL[item.type]||item.type}</div>
                          <div style={{fontSize:12,color:'var(--text-sec)'}}>{item.date || new Date((item.createdAt?.seconds||0)*1000).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  {docs.length === 0 && flags.length === 0 && <div style={{color:'var(--text-ter)',fontSize:13}}>No history yet.</div>}
                </div>
              </div>

              <div className="card">
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0}}><i className="ti ti-calendar-check" /> Open follow-ups</span>
                </div>
                <div style={{padding:'12px 16px'}}>
                  {followups.filter(f=>f.status==='open').map(f => (
                    <div key={f.id} style={{background:'var(--amber-lt)',borderRadius:'var(--radius)',padding:10,marginBottom:8}}>
                      <div style={{fontSize:13,fontWeight:500}}>{f.title}</div>
                      <div style={{fontSize:12,color:'var(--amber-txt)'}}>Due {new Date(f.dueDate).toLocaleDateString()}</div>
                    </div>
                  ))}
                  {followups.filter(f=>f.status==='open').length === 0 && <div style={{color:'var(--text-ter)',fontSize:13}}>No open follow-ups.</div>}
                </div>
              </div>
            </div>
          )}

          {/* ATTENDANCE TAB */}
          {tab === 'attendance' && (
            <div className="card" style={{padding:0}}>
              {flags.length === 0 ? (
                <div className="empty-state"><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>No attendance flags found.</div></div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Status</th></tr></thead>
                  <tbody>
                    {flags.map(f => (
                      <tr key={f.id}>
                        <td className="mono">{f.date}</td>
                        <td><span className={`badge ${['noshow','tier2','tier1'].includes(f.type)?'badge-danger':f.type==='early'?'badge-info':'badge-gray'}`}>{TYPE_LABEL[f.type]||f.type}</span></td>
                        <td style={{fontSize:12,color:'var(--text-sec)'}}>{f.detail}</td>
                        <td><span className={`badge ${f.status==='excused'?'badge-ok':f.status==='documented'?'badge-info':'badge-warn'}`}>{f.status||'pending'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* DOCUMENTS TAB */}
          {tab === 'documents' && (
            <div className="card" style={{padding:0}}>
              <div style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
                <Link to={`/documentation?empId=${id}`} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> New document</Link>
              </div>
              {docs.length === 0 ? (
                <div className="empty-state"><i className="ti ti-file-text" /><div>No documents yet.</div></div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Doc ID</th><th>Type</th><th>Date</th><th>Counts toward discipline</th><th>Signature</th><th></th></tr></thead>
                  <tbody>
                    {docs.map(d => (
                      <tr key={d.id}>
                        <td className="mono">{d.docId}</td>
                        <td><span className={`badge ${d.docType==='final_warning'?'badge-danger':d.docType==='written_warning'?'badge-warn':'badge-info'}`}>{d.docType?.replace(/_/g,' ')}</span></td>
                        <td className="mono">{d.date || new Date((d.createdAt?.seconds||0)*1000).toLocaleDateString()}</td>
                        <td>{d.countsTowardDiscipline ? <span className="badge badge-warn">Yes</span> : <span className="badge badge-gray">No</span>}</td>
                        <td><span className={`badge ${d.signatureStatus==='signed'?'badge-ok':d.signatureStatus==='refused'?'badge-danger':'badge-gray'}`}>{d.signatureStatus||'pending'}</span></td>
                        <td>
                          {d.pdfUrl && <a href={d.pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm"><i className="ti ti-download" /> PDF</a>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TRAINING TAB */}
          {tab === 'training' && (
            <div>
              <div style={{marginBottom:12,display:'flex',justifyContent:'flex-end'}}>
                <Link to={`/training?empId=${id}`} className="btn btn-primary btn-sm"><i className="ti ti-pencil" /> Update training</Link>
              </div>
              {Object.keys(ratingsByPos).length === 0 ? (
                <div className="empty-state"><i className="ti ti-school" /><div>No training ratings yet. <Link to={`/training?empId=${id}`}>Add training status →</Link></div></div>
              ) : (
                <div className="pos-grid">
                  {Object.entries(ratingsByPos).map(([posId, rs]) => {
                    const latest = rs[0]
                    const avg = ((latest.getsItDone + latest.doesItRight + latest.doesItEfficiently) / 3).toFixed(1)
                    const sc = scoreClass(parseFloat(avg))
                    return (
                      <div key={posId} className="pos-card certified">
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                          <div style={{fontSize:13,fontWeight:500}}>{latest.positionName}</div>
                          <span className="badge badge-ok">Rated</span>
                        </div>
                        {[['Gets it done',latest.getsItDone],['Does it right',latest.doesItRight],['Does it efficiently',latest.doesItEfficiently]].map(([l,v]) => (
                          <div key={l} className="rating-row">
                            <div className="rating-label" style={{fontSize:11}}>{l}</div>
                            <div className="rating-track"><div className="rating-fill" style={{width:`${v*10}%`,background:ratingColor(v)}} /></div>
                            <div className="rating-val">{v}</div>
                          </div>
                        ))}
                        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,paddingTop:10,borderTop:'0.5px solid var(--border)'}}>
                          <div className="score-circle score-circle-sm" style={{...sc}}>
                            <div className="score-num" style={{fontSize:14}}>{avg}</div>
                          </div>
                          <div style={{fontSize:12,color:'var(--text-sec)'}}>Overall avg</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* RATINGS TAB */}
          {tab === 'ratings' && (
            <div className="card" style={{padding:0}}>
              <div style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
                <Link to={`/ratings?empId=${id}`} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add rating</Link>
              </div>
              {ratings.length === 0 ? (
                <div className="empty-state"><i className="ti ti-star" /><div>No ratings yet.</div></div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Position</th><th>Gets it done</th><th>Does it right</th><th>Does it efficiently</th><th>Average</th><th>Date</th></tr></thead>
                  <tbody>
                    {ratings.map(r => {
                      const avg = ((r.getsItDone + r.doesItRight + r.doesItEfficiently) / 3).toFixed(1)
                      const sc = scoreClass(parseFloat(avg))
                      return (
                        <tr key={r.id}>
                          <td style={{fontWeight:500}}>{r.positionName}</td>
                          <td>{r.getsItDone}/10</td>
                          <td>{r.doesItRight}/10</td>
                          <td>{r.doesItEfficiently}/10</td>
                          <td>
                            <div className="score-circle score-circle-sm" style={{...sc,display:'inline-flex'}}>
                              <div className="score-num" style={{fontSize:13}}>{avg}</div>
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
      </div>
    </>
  )
}
