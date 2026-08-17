import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getEmployee, getAttendanceFlags, getDocuments, getRatings, getFollowUps, updateEmployee, getPositions, getTraining, getTeams, updateEmployeeTeams, addTeam } from '../lib/db'
import { DISCIPLINE_LABEL, DISCIPLINE_BADGE, computeEffectiveDisciplineLevel } from '../lib/disciplineLevels'
import { applicablePositions } from '../lib/positionRules'

const LEVEL_LABEL = DISCIPLINE_LABEL
const LEVEL_BADGE = DISCIPLINE_BADGE
const TYPE_LABEL = { noshow:'No-show', tier2:'10+ min late', tier1:'Tier 1 pattern', 'tier1-info':'Minor late', early:'Early departure', overage:'Overage' }
const AREA_LABEL = { foh: 'Front of House', boh: 'Back of House', both: 'FOH + BOH' }

export default function EmployeeDetail() {
  const { id } = useParams()
  const [emp, setEmp] = useState(null)
  const [flags, setFlags] = useState([])
  const [docs, setDocs] = useState([])
  const [ratings, setRatings] = useState([])
  const [followups, setFollowups] = useState([])
  const [positions, setPositions] = useState([])
  const [training, setTraining] = useState([])
  const [teams, setTeams] = useState([])
  const [empTeams, setEmpTeams] = useState([])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [savingTeams, setSavingTeams] = useState(false)
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [addingTeam, setAddingTeam] = useState(false)

  const [eInitialStart, setEInitialStart] = useState('')
  const [eCurrentPos, setECurrentPos] = useState('')
  const [eCurrentPosStart, setECurrentPosStart] = useState('')
  const [eArea, setEArea] = useState('both')
  const [eLeadership, setELeadership] = useState(false)
  const [eEmail, setEEmail] = useState('')
  const [ePhone, setEPhone] = useState('')
  const [eBirthdate, setEBirthdate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    const [e, f, d, r, fu, p, tr, t] = await Promise.all([
      getEmployee(id), getAttendanceFlags(id), getDocuments(id),
      getRatings(id), getFollowUps(id), getPositions(), getTraining(id), getTeams(),
    ])
    setEmp(e); setFlags(f); setDocs(d); setRatings(r); setFollowups(fu)
    setPositions(p); setTraining(tr); setTeams(t)
    setEmpTeams(e?.teams || [])

    // Recompute effective discipline level from recent documentation history.
    // If offenses have rolled off the 4-month window, this will return a
    // lower level (possibly good_standing) and silently update the stored
    // field so every page that reads disciplineLevel stays current.
    const effectiveLevel = computeEffectiveDisciplineLevel(d)
    const storedLevel = e?.leadershipStatus || e?.disciplineLevel || 'good_standing'
    if (effectiveLevel !== storedLevel && e?.status === 'active') {
      await updateEmployee(id, {
        disciplineLevel: effectiveLevel,
        leadershipStatus: effectiveLevel,
      })
      e.disciplineLevel = effectiveLevel
      e.leadershipStatus = effectiveLevel
    }

    setLoading(false)
  }

  async function toggleTeam(teamId) {
    setSavingTeams(true)
    const next = empTeams.includes(teamId)
      ? empTeams.filter(t => t !== teamId)
      : [...empTeams, teamId]
    setEmpTeams(next)
    await updateEmployeeTeams(id, next)
    setSavingTeams(false)
  }

  async function handleAddTeam() {
    if (!newTeamName.trim()) return
    setAddingTeam(true)
    await addTeam(newTeamName.trim())
    const updated = await getTeams()
    setTeams(updated)
    setNewTeamName('')
    setShowAddTeam(false)
    setAddingTeam(false)
  }

  function openEdit() {
    setEInitialStart(emp.initialStartDate || '')
    setECurrentPos(emp.currentPosition || emp.position || 'Team Member')
    setECurrentPosStart(emp.currentPositionStartDate || '')
    setEArea(emp.area || 'both')
    setELeadership(!!emp.leadershipTrack)
    setEEmail(emp.email || '')
    setEPhone(emp.phone || '')
    setEBirthdate(emp.birthdate || '')
    setShowEdit(true)
  }

  async function saveEdit() {
    setSaving(true)
    try {
      await updateEmployee(id, {
        initialStartDate: eInitialStart, currentPosition: eCurrentPos,
        currentPositionStartDate: eCurrentPosStart, position: eCurrentPos,
        area: eArea, leadershipTrack: eLeadership,
        email: eEmail || '',
        phone: ePhone || '',
        birthdate: eBirthdate || '',
      })
      await load()
      setShowEdit(false)
    } finally { setSaving(false) }
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading profile...</div>
  if (!emp) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Employee not found.</div>

  // Age and minor status
  function getAge(birthdate) {
    if (!birthdate) return null
    const today = new Date()
    const birth = new Date(birthdate)
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age
  }
  const age = getAge(emp.birthdate)
  const isMinor = age !== null && age < 18
  const is15Under = isMinor && age <= 15
  const is1617 = isMinor && age >= 16

  const level = emp.leadershipStatus || emp.disciplineLevel || 'good_standing'
  const docFlags = flags.filter(f => ['noshow','tier2','tier1'].includes(f.type) && f.status === 'pending')

  const ratingsByPos = {}
  for (const r of ratings) {
    if (!ratingsByPos[r.positionId]) ratingsByPos[r.positionId] = []
    ratingsByPos[r.positionId].push(r)
  }

  const ratingColor = v => v >= 8 ? 'var(--green)' : v >= 5 ? 'var(--amber)' : 'var(--red)'
  const scoreClass = v => v >= 8
    ? {background:'var(--green-lt)',color:'var(--green-txt)'}
    : v >= 5 ? {background:'var(--amber-lt)',color:'var(--amber-txt)'}
    : {background:'var(--red-lt)',color:'var(--red-txt)'}

  return (
    <>
      <div className="topbar">
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <Link to="/employees" className="btn btn-sm"><i className="ti ti-arrow-left" /></Link>
          <span className="topbar-title">{emp.name}</span>
          <span className="mono">{id}</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={openEdit}><i className="ti ti-pencil" aria-hidden="true" /> Edit profile</button>
          <Link to={`/documentation?empId=${id}`} className="btn btn-primary"><i className="ti ti-file-plus" aria-hidden="true" /> New documentation</Link>
        </div>
      </div>

      <div className="content">
        <div className="card">
          <div className="card-body">
            <div style={{display:'flex',alignItems:'flex-start',gap:16,marginBottom:16}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--amber-lt)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:500,color:'var(--amber-txt)',flexShrink:0}}>
                {emp.name.split(',')[0].slice(0,2).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:18,fontWeight:500,marginBottom:4}}>{emp.name}</div>
                <div style={{fontSize:13,color:'var(--text-sec)',display:'flex',gap:12,flexWrap:'wrap',marginBottom:6}}>
                  <span>{emp.currentPosition || emp.position || 'Team Member'}</span>
                  <span className={`badge ${emp.status==='active'?'badge-ok':'badge-gray'}`}>{emp.status||'active'}</span>
                  <span className="badge badge-info">{AREA_LABEL[emp.area]||'FOH + BOH'}</span>
                  {emp.leadershipTrack && <span className="badge badge-warn"><i className="ti ti-crown" style={{fontSize:11}} /> Leadership track</span>}
                  {is15Under && <span className="badge badge-danger"><i className="ti ti-alert-triangle" style={{fontSize:11}} /> Minor · Age {age}</span>}
                  {is1617 && <span className="badge badge-warn"><i className="ti ti-alert-triangle" style={{fontSize:11}} /> Minor · Age {age}</span>}
                </div>
                <div style={{fontSize:12,color:'var(--text-sec)',display:'flex',gap:16}}>
                  <span><i className="ti ti-calendar" aria-hidden="true" /> Hired: {emp.initialStartDate ? new Date(emp.initialStartDate).toLocaleDateString() : '—'}</span>
                  <span><i className="ti ti-calendar-event" aria-hidden="true" /> Current position since: {emp.currentPositionStartDate ? new Date(emp.currentPositionStartDate).toLocaleDateString() : '—'}</span>
                </div>
                {(emp.email || emp.phone || emp.birthdate) && (
                  <div style={{fontSize:12,color:'var(--text-sec)',display:'flex',gap:16,marginTop:4}}>
                    {emp.email && <span><i className="ti ti-mail" aria-hidden="true" /> <a href={`mailto:${emp.email}`} style={{color:'var(--text-sec)'}}>{emp.email}</a></span>}
                    {emp.phone && <span><i className="ti ti-phone" aria-hidden="true" /> <a href={`tel:${emp.phone}`} style={{color:'var(--text-sec)'}}>{emp.phone}</a></span>}
                    {emp.birthdate && <span><i className="ti ti-cake" aria-hidden="true" /> DOB: {new Date(emp.birthdate).toLocaleDateString()}{age !== null ? ` (Age ${age})` : ''}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Teams section */}
            <div style={{borderTop:'0.5px solid var(--border)',paddingTop:14,marginTop:4}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.05em'}}>Teams</div>
                <button className="btn btn-sm" onClick={() => setShowAddTeam(true)}><i className="ti ti-plus" /> New team</button>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {teams.map(team => {
                  const on = empTeams.includes(team.id)
                  return (
                    <div
                      key={team.id}
                      onClick={() => !savingTeams && toggleTeam(team.id)}
                      style={{
                        display:'flex',alignItems:'center',gap:6,padding:'6px 12px',
                        borderRadius:'var(--radius)',cursor:savingTeams?'wait':'pointer',
                        border:`0.5px solid ${on?'var(--amber)':'var(--border)'}`,
                        background:on?'var(--amber-lt)':'transparent',
                        fontSize:13,fontWeight:on?500:400,
                        color:on?'var(--amber-txt)':'var(--text-sec)',
                        transition:'all .1s',
                      }}
                    >
                      <div style={{
                        width:14,height:14,borderRadius:3,flexShrink:0,
                        border:`1.5px solid ${on?'var(--amber)':'var(--border)'}`,
                        background:on?'var(--amber)':'transparent',
                        display:'flex',alignItems:'center',justifyContent:'center',
                      }}>
                        {on && <i className="ti ti-check" style={{fontSize:10,color:'#fff'}} />}
                      </div>
                      {team.name}
                    </div>
                  )
                })}
                {teams.length === 0 && <span style={{fontSize:12,color:'var(--text-ter)'}}>No teams yet — click "New team" to create one.</span>}
              </div>
            </div>

            {/* Discipline status */}
            <div style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:14,marginTop:14,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10}}>Discipline status</div>
              <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                {[
                  {label:'System calculates',value:emp.disciplineLevel||'good_standing'},
                  {label:'Leadership decision',value:level,highlight:true},
                ].map((t,i) => (
                  <div key={i} style={{flex:1,border:`0.5px solid ${t.highlight?'var(--amber)':'var(--border)'}`,borderRadius:'var(--radius)',padding:10,background:t.highlight?'var(--amber-lt)':'var(--surface)',textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5}}>{t.label}</div>
                    <span className={`badge ${LEVEL_BADGE[t.value]||'badge-gray'}`}>{LEVEL_LABEL[t.value]||t.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="metric-grid metric-grid-4">
              <div className="metric"><div className="metric-label">Flags pending</div><div className="metric-value" style={{color:docFlags.length?'var(--red)':'inherit'}}>{docFlags.length}</div></div>
              <div className="metric"><div className="metric-label">Documentation</div><div className="metric-value">{docs.length}</div></div>
              <div className="metric"><div className="metric-label">Ratings</div><div className="metric-value">{ratings.length}</div></div>
              <div className="metric"><div className="metric-label">Follow-ups</div><div className="metric-value">{followups.filter(f=>f.status==='open').length}</div></div>
            </div>
          </div>
        </div>

        {docFlags.length > 0 && (
          <div className="danger-box">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <div><strong>{docFlags.length} attendance flag{docFlags.length>1?'s':''}</strong> pending. <Link to="/flags" style={{color:'var(--red-txt)'}}>Review now →</Link></div>
          </div>
        )}

        <div className="tab-row" style={{marginBottom:0}}>
          {[['overview','Overview'],['attendance','Attendance'],['documents','Documentation'],['training','Training'],['ratings','Ratings']].map(([v,l]) => (
            <div key={v} className={`tab${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</div>
          ))}
        </div>

        <div style={{marginTop:16}}>
          {tab === 'overview' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div className="card">
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}><span className="card-title" style={{marginBottom:0}}>Recent timeline</span></div>
                <div style={{padding:'12px 16px'}}>
                  {[...docs, ...flags.filter(f=>f.status==='documented')]
                    .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
                    .slice(0,6)
                    .map((item,i)=>(
                      <div key={i} style={{display:'flex',gap:10,paddingBottom:12,borderBottom:'0.5px solid var(--border)',marginBottom:12}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:item.docType?'var(--red)':'var(--amber)',flexShrink:0,marginTop:5}} />
                        <div>
                          <div style={{fontSize:13,fontWeight:500}}>{item.docType||TYPE_LABEL[item.type]||item.type}</div>
                          <div style={{fontSize:12,color:'var(--text-sec)'}}>{item.date||new Date((item.createdAt?.seconds||0)*1000).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  {docs.length===0&&flags.length===0&&<div style={{color:'var(--text-ter)',fontSize:13}}>No history yet.</div>}
                </div>
              </div>
              <div className="card">
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}><span className="card-title" style={{marginBottom:0}}>Open follow-ups</span></div>
                <div style={{padding:'12px 16px'}}>
                  {followups.filter(f=>f.status==='open').map(f=>(
                    <div key={f.id} style={{background:'var(--amber-lt)',borderRadius:'var(--radius)',padding:10,marginBottom:8}}>
                      <div style={{fontSize:13,fontWeight:500}}>{f.title}</div>
                      <div style={{fontSize:12,color:'var(--amber-txt)'}}>Due {new Date(f.dueDate).toLocaleDateString()}</div>
                    </div>
                  ))}
                  {followups.filter(f=>f.status==='open').length===0&&<div style={{color:'var(--text-ter)',fontSize:13}}>No open follow-ups.</div>}
                </div>
              </div>
            </div>
          )}

          {tab === 'attendance' && (
            <div className="card" style={{padding:0}}>
              {flags.length===0?(
                <div className="empty-state"><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>No attendance flags.</div></div>
              ):(
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Status</th></tr></thead>
                  <tbody>
                    {flags.map(f=>(
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

          {tab === 'documents' && (
            <div className="card" style={{padding:0}}>
              <div style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
                <Link to={`/documentation?empId=${id}`} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> New documentation</Link>
              </div>
              {docs.length===0?(
                <div className="empty-state"><i className="ti ti-file-text" /><div>No documentation yet.</div></div>
              ):(
                <table className="data-table">
                  <thead><tr><th>Doc ID</th><th>Type</th><th>Date</th><th>Counts</th><th>Signature</th></tr></thead>
                  <tbody>
                    {docs.map(d=>(
                      <tr key={d.id}>
                        <td className="mono">{d.docId}</td>
                        <td><span className={`badge ${d.docType==='final_warning'?'badge-danger':d.docType==='written_warning'?'badge-warn':'badge-info'}`}>{d.docType?.replace(/_/g,' ')}</span></td>
                        <td className="mono">{d.date||new Date((d.createdAt?.seconds||0)*1000).toLocaleDateString()}</td>
                        <td>{d.countsTowardDiscipline?<span className="badge badge-warn">Yes</span>:<span className="badge badge-gray">No</span>}</td>
                        <td><span className={`badge ${d.signatureStatus==='signed'?'badge-ok':d.signatureStatus==='refused'?'badge-danger':'badge-gray'}`}>{d.signatureStatus||'pending'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'training' && (() => {
            const completedSet = new Set(training.filter(t=>t.completed).map(t=>t.positionId))
            const applicable = applicablePositions(emp, positions)
            const completedList = applicable.filter(p=>completedSet.has(p.id))
            const neededList = applicable.filter(p=>!completedSet.has(p.id))
            const trainingByPosId = Object.fromEntries(training.map(t=>[t.positionId,t]))
            return (
              <div>
                <div style={{marginBottom:12,display:'flex',justifyContent:'flex-end'}}>
                  <Link to={`/training?empId=${id}`} className="btn btn-primary btn-sm"><i className="ti ti-pencil" /> Update training</Link>
                </div>
                <div className="metric-grid metric-grid-3" style={{marginBottom:16}}>
                  <div className="metric"><div className="metric-label">Applicable</div><div className="metric-value">{applicable.length}</div></div>
                  <div className="metric"><div className="metric-label">Completed</div><div className="metric-value" style={{color:'var(--green)'}}>{completedList.length}</div></div>
                  <div className="metric"><div className="metric-label">Needed</div><div className="metric-value" style={{color:neededList.length?'var(--amber-txt)':'inherit'}}>{neededList.length}</div></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                  <div className="card" style={{padding:0}}>
                    <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}><span className="card-title" style={{marginBottom:0,color:'var(--green-txt)'}}>Training completed</span></div>
                    {completedList.length===0?<div className="empty-state" style={{padding:24}}><i className="ti ti-school" /><div>None yet.</div></div>:
                      completedList.map(pos=>{
                        const t=trainingByPosId[pos.id]
                        return <div key={pos.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'0.5px solid var(--border)'}}>
                          <i className="ti ti-check" style={{color:'var(--green)'}} />
                          <div style={{flex:1,fontSize:13,fontWeight:500}}>{pos.name}</div>
                          <span className="mono">{t?.completedDate?new Date(t.completedDate).toLocaleDateString():'—'}</span>
                        </div>
                      })
                    }
                  </div>
                  <div className="card" style={{padding:0}}>
                    <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}><span className="card-title" style={{marginBottom:0,color:'var(--amber-txt)'}}>Training needed</span></div>
                    {neededList.length===0?<div className="empty-state" style={{padding:24}}><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>Fully trained.</div></div>:
                      neededList.map(pos=>(
                        <div key={pos.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'0.5px solid var(--border)'}}>
                          <i className="ti ti-circle-dashed" style={{color:'var(--text-ter)'}} />
                          <div style={{flex:1,fontSize:13,fontWeight:500}}>{pos.name}</div>
                          <Link to={`/training?empId=${id}`} className="btn btn-sm">Train</Link>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            )
          })()}

          {tab === 'ratings' && (
            <div className="card" style={{padding:0}}>
              <div style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
                <Link to={`/ratings?empId=${id}`} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add rating</Link>
              </div>
              {ratings.length===0?<div className="empty-state"><i className="ti ti-star" /><div>No ratings yet.</div></div>:(
                <table className="data-table">
                  <thead><tr><th>Position</th><th>Gets it done</th><th>Does it right</th><th>Does it efficiently</th><th>Average</th><th>Date</th></tr></thead>
                  <tbody>
                    {ratings.map(r=>{
                      const avg=((r.getsItDone+r.doesItRight+r.doesItEfficiently)/3).toFixed(1)
                      const sc=scoreClass(parseFloat(avg))
                      return <tr key={r.id}>
                        <td style={{fontWeight:500}}>{r.positionName}</td>
                        <td>{r.getsItDone}/10</td><td>{r.doesItRight}/10</td><td>{r.doesItEfficiently}/10</td>
                        <td><div className="score-circle score-circle-sm" style={{...sc,display:'inline-flex'}}><div className="score-num" style={{fontSize:13}}>{avg}</div></div></td>
                        <td className="mono">{r.ratedAt?new Date(r.ratedAt.seconds*1000).toLocaleDateString():'—'}</td>
                      </tr>
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit profile modal */}
      {showEdit && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowEdit(false)}>
          <div className="modal" style={{width:460}}>
            <div className="modal-header">
              <div className="modal-header-title">Edit profile</div>
              <button className="btn btn-sm" onClick={()=>setShowEdit(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Initial start date</label><input type="date" value={eInitialStart} onChange={e=>setEInitialStart(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Current position</label>
                <select value={eCurrentPos} onChange={e=>setECurrentPos(e.target.value)}>
                  <option>Team Member</option>
                  {positions.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                  <option>Team Leader</option><option>Shift Lead</option><option>Kitchen Lead</option><option>Manager</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Current position start date</label><input type="date" value={eCurrentPosStart} onChange={e=>setECurrentPosStart(e.target.value)} /></div>
              <div className="divider" />
              <div className="form-group"><label className="form-label">Work area</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[['foh','FOH'],['boh','BOH'],['both','Both']].map(([v,l])=>(
                    <div key={v} onClick={()=>setEArea(v)} style={{border:`0.5px solid ${eArea===v?'var(--amber)':'var(--border)'}`,borderRadius:'var(--radius)',padding:'8px',textAlign:'center',cursor:'pointer',background:eArea===v?'var(--amber-lt)':'transparent',fontSize:13,fontWeight:500}}>{l}</div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                  <input type="checkbox" checked={eLeadership} onChange={e=>setELeadership(e.target.checked)} style={{width:'auto'}} />
                  <span style={{fontSize:13}}>On leadership track</span>
                </label>
              </div>
              <div className="divider" />
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" value={eEmail} onChange={e=>setEEmail(e.target.value)} placeholder="name@email.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="tel" value={ePhone} onChange={e=>setEPhone(e.target.value)} placeholder="(555) 555-5555" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Date of birth</label>
                <input type="date" value={eBirthdate} onChange={e=>setEBirthdate(e.target.value)} />
                <div style={{fontSize:11,color:'var(--text-ter)',marginTop:3}}>Used to determine minor status and applicable labor rules.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowEdit(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}><i className="ti ti-device-floppy" /> {saving?'Saving…':'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add team modal */}
      {showAddTeam && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddTeam(false)}>
          <div className="modal" style={{width:380}}>
            <div className="modal-header">
              <div className="modal-header-title">Add team</div>
              <button className="btn btn-sm" onClick={()=>setShowAddTeam(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Team name</label><input type="text" value={newTeamName} onChange={e=>setNewTeamName(e.target.value)} placeholder="e.g. Morning Crew, Drive-Thru Team…" autoFocus /></div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowAddTeam(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddTeam} disabled={addingTeam||!newTeamName.trim()}><i className="ti ti-plus" /> {addingTeam?'Adding…':'Add team'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
