import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getEmployees, getPositions, addPosition, setTrainingStatus, getTraining, getAllTraining, saveRating, getRatings } from '../lib/db'
import { applicablePositions, missingForEmployee } from '../lib/positionRules'

export default function Training() {
  const [searchParams] = useSearchParams()
  const preEmpId = searchParams.get('empId')

  const [employees, setEmployees] = useState([])
  const [positions, setPositions] = useState([])
  const [selectedEmp, setSelectedEmp] = useState(preEmpId || '')
  const [training, setTraining] = useState([])
  const [allTraining, setAllTraining] = useState([])
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(preEmpId ? 'detail' : 'incomplete') // incomplete | detail
  const [showAddPos, setShowAddPos] = useState(false)
  const [newPosName, setNewPosName] = useState('')
  const [savingPos, setSavingPos] = useState(null) // positionId currently saving
  const [editingDate, setEditingDate] = useState(null) // positionId whose date is being edited

  // Optional 1-10 rating modal (kept separate from yes/no completion)
  const [rateModal, setRateModal] = useState(null)
  const [r1, setR1] = useState(7)
  const [r2, setR2] = useState(7)
  const [r3, setR3] = useState(7)
  const [rNotes, setRNotes] = useState('')
  const [savingRating, setSavingRating] = useState(false)

  useEffect(() => {
    Promise.all([getEmployees(), getPositions(), getAllTraining()]).then(([e, p, at]) => {
      setEmployees(e); setPositions(p); setAllTraining(at); setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (selectedEmp) {
      getTraining(selectedEmp).then(setTraining)
      getRatings(selectedEmp).then(setRatings)
    }
  }, [selectedEmp])

  // Incomplete training dashboard — one row per active employee missing
  // a COMPLETED training record for at least one applicable position.
  const completedByEmp = {}
  for (const t of allTraining) {
    if (!t.completed) continue
    if (!completedByEmp[t.employeeId]) completedByEmp[t.employeeId] = new Set()
    completedByEmp[t.employeeId].add(t.positionId)
  }
  const activeEmployees = employees.filter(e => (e.status || 'active') === 'active')
  const incompleteTraining = activeEmployees
    .map(emp => {
      const havePositionIds = Array.from(completedByEmp[emp.id] || [])
      const missing = missingForEmployee(emp, positions, havePositionIds)
      return { emp, missing }
    })
    .filter(x => x.missing.length > 0)

  function goToEmployee(empId) {
    setSelectedEmp(empId)
    setView('detail')
  }

  async function handleAddPosition() {
    if (!newPosName.trim()) return
    await addPosition(newPosName.trim())
    const updated = await getPositions()
    setPositions(updated)
    setNewPosName('')
    setShowAddPos(false)
  }

  // Toggle a position's Yes/No completion. Auto-populates today's date when
  // checked to Yes; clears the date when unchecked back to No.
  async function toggleTraining(pos, checked) {
    setSavingPos(pos.id)
    const existing = training.find(t => t.positionId === pos.id)
    const dateToUse = checked
      ? (existing?.completedDate || new Date().toISOString().split('T')[0])
      : null
    await setTrainingStatus(selectedEmp, pos.id, pos.name, checked, dateToUse)
    const updated = await getTraining(selectedEmp)
    setTraining(updated)
    const updatedAll = await getAllTraining()
    setAllTraining(updatedAll)
    setSavingPos(null)
  }

  async function updateTrainingDate(pos, newDate) {
    await setTrainingStatus(selectedEmp, pos.id, pos.name, true, newDate)
    const updated = await getTraining(selectedEmp)
    setTraining(updated)
    const updatedAll = await getAllTraining()
    setAllTraining(updatedAll)
  }

  async function handleSaveRating() {
    if (!selectedEmp || !rateModal) return
    setSavingRating(true)
    await saveRating(selectedEmp, rateModal.pos.id, {
      positionId: rateModal.pos.id,
      positionName: rateModal.pos.name,
      getsItDone: r1,
      doesItRight: r2,
      doesItEfficiently: r3,
      notes: rNotes,
    })
    const updated = await getRatings(selectedEmp)
    setRatings(updated)
    setRateModal(null)
    setRNotes('')
    setSavingRating(false)
  }

  const trainingByPos = {}
  for (const t of training) trainingByPos[t.positionId] = t

  const ratingsByPos = {}
  for (const r of ratings) {
    if (!ratingsByPos[r.positionId] || r.ratedAt?.seconds > ratingsByPos[r.positionId].ratedAt?.seconds) {
      ratingsByPos[r.positionId] = r
    }
  }

  const ratingColor = v => v >= 8 ? 'var(--green)' : v >= 5 ? 'var(--amber)' : 'var(--red)'
  const scoreStyle = v => v >= 8
    ? {background:'var(--green-lt)',color:'var(--green-txt)'}
    : v >= 5 ? {background:'var(--amber-lt)',color:'var(--amber-txt)'}
    : {background:'var(--red-lt)',color:'var(--red-txt)'}

  const avg = ((r1+r2+r3)/3).toFixed(1)
  const selectedEmpObj = employees.find(e => e.id === selectedEmp)
  const visiblePositions = selectedEmpObj ? applicablePositions(selectedEmpObj, positions) : []
  const completedCount = visiblePositions.filter(p => trainingByPos[p.id]?.completed).length

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading...</div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Position training</span>
        <button className="btn btn-primary" onClick={() => setShowAddPos(true)}>
          <i className="ti ti-plus" aria-hidden="true" /> Add position
        </button>
      </div>
      <div className="content">
        <div className="tab-row" style={{marginBottom:16}}>
          <div className={`tab${view==='incomplete'?' active':''}`} onClick={() => setView('incomplete')}>
            Incomplete ({incompleteTraining.length})
          </div>
          <div className={`tab${view==='detail'?' active':''}`} onClick={() => setView('detail')}>By employee</div>
        </div>

        {view === 'incomplete' && (
          <div className="card" style={{padding:0}}>
            {incompleteTraining.length === 0 ? (
              <div className="empty-state"><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>Everyone has training recorded for all their applicable positions.</div></div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Area</th><th>Missing training</th><th></th></tr></thead>
                <tbody>
                  {incompleteTraining.map(({ emp, missing }) => (
                    <tr key={emp.id}>
                      <td><span style={{fontWeight:500}}>{emp.name}</span></td>
                      <td>
                        <span className="badge badge-info">{emp.area === 'foh' ? 'FOH' : emp.area === 'boh' ? 'BOH' : 'FOH + BOH'}</span>
                        {emp.leadershipTrack && <span className="badge badge-warn" style={{marginLeft:4}}>Leadership</span>}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          {missing.map(p => <span key={p.id} className="badge badge-gray">{p.name}</span>)}
                        </div>
                      </td>
                      <td><button className="btn btn-sm" onClick={() => goToEmployee(emp.id)}>Train now</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {view === 'detail' && (
        <>
        <div className="info-box">
          <i className="ti ti-info-circle" aria-hidden="true" />
          <div>Check off each position as the employee completes training. The date auto-fills to today but you can edit it to backdate. Only positions applicable to their FOH/BOH area (and leadership track, if assigned) are shown.</div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="card-title"><i className="ti ti-users" aria-hidden="true" /> Select employee</div>
            <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} style={{maxWidth:320}}>
              <option value="">— choose employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>

        {selectedEmp && (
          <>
            <div className="card" style={{marginBottom:16}}>
              <div className="card-body" style={{display:'flex',alignItems:'center',gap:12}}>
                <div className="score-circle" style={completedCount===visiblePositions.length && visiblePositions.length>0 ? {background:'var(--green-lt)',color:'var(--green-txt)'} : {background:'var(--amber-lt)',color:'var(--amber-txt)'}}>
                  <div className="score-num">{completedCount}</div>
                  <div className="score-den">/ {visiblePositions.length}</div>
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>Positions completed</div>
                  <div style={{fontSize:12,color:'var(--text-sec)'}}>{selectedEmpObj?.name}</div>
                </div>
              </div>
            </div>

            <div className="card" style={{padding:0}}>
              <table className="data-table">
                <thead><tr><th style={{width:40}}></th><th>Position</th><th>Completed date</th><th>Rating (optional)</th></tr></thead>
                <tbody>
                  {visiblePositions.map(pos => {
                    const t = trainingByPos[pos.id]
                    const isComplete = !!t?.completed
                    const r = ratingsByPos[pos.id]
                    const posAvg = r ? ((r.getsItDone + r.doesItRight + r.doesItEfficiently) / 3).toFixed(1) : null
                    return (
                      <tr key={pos.id}>
                        <td>
                          <div
                            onClick={() => savingPos !== pos.id && toggleTraining(pos, !isComplete)}
                            style={{
                              width:22,height:22,borderRadius:5,
                              border:`1.5px solid ${isComplete?'var(--green)':'var(--border)'}`,
                              background:isComplete?'var(--green)':'transparent',
                              display:'flex',alignItems:'center',justifyContent:'center',
                              cursor:savingPos===pos.id?'wait':'pointer',
                              opacity:savingPos===pos.id?0.5:1,
                            }}
                          >
                            {isComplete && <i className="ti ti-check" style={{color:'#fff',fontSize:15}} />}
                          </div>
                        </td>
                        <td style={{fontWeight:500}}>{pos.name}</td>
                        <td>
                          {isComplete ? (
                            editingDate === pos.id ? (
                              <input
                                type="date"
                                value={t.completedDate || ''}
                                onChange={e => updateTrainingDate(pos, e.target.value)}
                                onBlur={() => setEditingDate(null)}
                                autoFocus
                                style={{maxWidth:160}}
                              />
                            ) : (
                              <span
                                className="mono"
                                style={{cursor:'pointer',textDecoration:'underline dotted'}}
                                onClick={() => setEditingDate(pos.id)}
                                title="Click to edit date"
                              >
                                {t.completedDate ? new Date(t.completedDate).toLocaleDateString() : '—'} <i className="ti ti-pencil" style={{fontSize:11}} />
                              </span>
                            )
                          ) : (
                            <span style={{color:'var(--text-ter)',fontSize:12}}>Not completed</span>
                          )}
                        </td>
                        <td>
                          {r ? (
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <div className="score-circle score-circle-sm" style={scoreStyle(parseFloat(posAvg))}>
                                <div className="score-num" style={{fontSize:13}}>{posAvg}</div>
                              </div>
                              <button className="btn btn-sm" onClick={() => { setRateModal({pos}); setR1(r.getsItDone); setR2(r.doesItRight); setR3(r.doesItEfficiently); setRNotes('') }}>
                                <i className="ti ti-pencil" />
                              </button>
                            </div>
                          ) : (
                            <button className="btn btn-sm" onClick={() => { setRateModal({pos}); setR1(7); setR2(7); setR3(7); setRNotes('') }}>
                              <i className="ti ti-star" /> Rate
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!selectedEmp && (
          <div className="empty-state"><i className="ti ti-school" /><div>Select an employee above to view their training checklist.</div></div>
        )}
        </>
        )}
      </div>

      {/* Optional 1-10 rating modal */}
      {rateModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setRateModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-header-title">Rate: {rateModal.pos.name}</div>
                <div style={{fontSize:12,color:'var(--text-sec)'}}>{employees.find(e=>e.id===selectedEmp)?.name}</div>
              </div>
              <button className="btn btn-sm" onClick={() => setRateModal(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="info-box"><i className="ti ti-info-circle" aria-hidden="true" /><div>Rate each area 1–10. These three scores average into an overall position rating. This is separate from the Yes/No training checklist.</div></div>

              {[
                ['Gets it done', 'Completes the task — meets throughput expectations', r1, setR1],
                ['Does it right', 'Accuracy, quality, follows process correctly', r2, setR2],
                ['Does it efficiently', "Speed, minimizes waste, doesn't need help", r3, setR3],
              ].map(([label, sub, val, setter]) => (
                <div key={label} className="form-group">
                  <label className="form-label">{label} <span style={{fontSize:11,color:'var(--text-ter)',textTransform:'none',letterSpacing:0}}>— {sub}</span></label>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <input type="range" min={1} max={10} value={val} onChange={e => setter(parseInt(e.target.value))} style={{flex:1,accentColor:'var(--amber)'}} />
                    <span style={{fontSize:16,fontWeight:500,width:24,textAlign:'right'}}>{val}</span>
                  </div>
                </div>
              ))}

              <div style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:12,display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                <div className="score-circle" style={r1+r2+r3>=24?{background:'var(--green-lt)',color:'var(--green-txt)'}:r1+r2+r3>=15?{background:'var(--amber-lt)',color:'var(--amber-txt)'}:{background:'var(--red-lt)',color:'var(--red-txt)'}}>
                  <div className="score-num">{avg}</div>
                  <div className="score-den">/ 10</div>
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>Overall average</div>
                  <div style={{fontSize:12,color:'var(--text-sec)'}}>({r1} + {r2} + {r3}) ÷ 3 = {avg}</div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Observation notes (optional)</label>
                <textarea value={rNotes} onChange={e => setRNotes(e.target.value)} placeholder="Specific observations that support these scores…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRateModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveRating} disabled={savingRating}>
                <i className="ti ti-device-floppy" /> {savingRating ? 'Saving…' : 'Save rating'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add position modal */}
      {showAddPos && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowAddPos(false)}>
          <div className="modal" style={{width:400}}>
            <div className="modal-header">
              <div className="modal-header-title">Add position</div>
              <button className="btn btn-sm" onClick={() => setShowAddPos(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Position name</label>
                <input type="text" value={newPosName} onChange={e => setNewPosName(e.target.value)} placeholder="e.g. Drive-thru cashier, Fry station…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowAddPos(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddPosition} disabled={!newPosName.trim()}>
                <i className="ti ti-plus" /> Add position
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
