import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { analyzeEmployee, parsePunchVariancePDFFromWords, pdfSegmentsToShifts } from '../lib/attendanceEngine'
import { extractPdfWords } from '../lib/pdfTextExtractor'
import { getEmployees, verifyFlagsAgainstSource, deleteFlags, saveAttendanceFlags } from '../lib/db'

const TYPE_LABELS = {
  noshow: 'No-show', tier2: '10+ min late', tier1: 'Tier 1 pattern',
  early: 'Early departure', overage: 'Overage', excessive_absence: 'Excessive absences',
}

export default function VerifyUpload() {
  const [stage, setStage] = useState('idle') // idle | processing | done | error
  const [drag, setDrag] = useState(false)
  const [progress, setProgress] = useState({ step: '', pct: 0 })
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [selectedFabricated, setSelectedFabricated] = useState(new Set()) // keys: `${employeeId}::${id}`
  const [deleting, setDeleting] = useState(false)
  const [deleteResult, setDeleteResult] = useState(null)
  const fileRef = useRef()

  const processFile = useCallback(async (file) => {
    setStage('processing')
    setError('')
    setReport(null)
    setDeleteResult(null)
    setSelectedFabricated(new Set())

    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
      if (!isPdf) throw new Error('This tool only supports PDF re-verification, since the CSV path was never affected by the column-position bug.')

      setProgress({ step: 'Reading PDF…', pct: 10 })
      const pages = await extractPdfWords(file)

      setProgress({ step: 'Re-parsing with corrected logic…', pct: 30 })
      const parsedEmployees = parsePunchVariancePDFFromWords(pages)
      const empNamesFound = Object.keys(parsedEmployees)
      if (empNamesFound.length === 0) {
        throw new Error('No employees found in this PDF.')
      }

      setProgress({ step: 'Computing expected flags…', pct: 45 })
      const expectedByEmployee = {}
      for (const [name, segments] of Object.entries(parsedEmployees)) {
        const shifts = pdfSegmentsToShifts(segments)
        const analysis = analyzeEmployee(shifts)
        expectedByEmployee[name] = analysis.flagsToSave || []
      }

      setProgress({ step: 'Loading current employees…', pct: 60 })
      const employees = await getEmployees()
      const nameToId = {}
      for (const e of employees) nameToId[e.name] = e.id

      setProgress({ step: 'Comparing against what\'s stored…', pct: 75 })
      const result = await verifyFlagsAgainstSource(expectedByEmployee, nameToId)

      setProgress({ step: 'Done', pct: 100 })
      setReport(result)
      setStage('done')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Unknown error')
      setStage('error')
    }
  }, [])

  const handleDrop = useCallback(e => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }, [processFile])

  function rowKey(employeeId, flag) { return `${employeeId}::${flag.id}` }

  function toggleFabricated(employeeId, flag) {
    setSelectedFabricated(prev => {
      const next = new Set(prev)
      const key = rowKey(employeeId, flag)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAllFabricated() {
    if (!report) return
    const all = new Set()
    for (const emp of report) {
      for (const f of emp.fabricated) all.add(rowKey(emp.employeeId, f))
    }
    setSelectedFabricated(all)
  }

  async function handleDeleteSelected() {
    if (!report || selectedFabricated.size === 0) return
    setDeleting(true)
    try {
      const targets = []
      for (const emp of report) {
        for (const f of emp.fabricated) {
          if (selectedFabricated.has(rowKey(emp.employeeId, f))) {
            targets.push({ employeeId: emp.employeeId, id: f.id })
          }
        }
      }
      const { deleted } = await deleteFlags(targets)
      setDeleteResult({ deleted })
      setReport(prev => prev.map(emp => ({
        ...emp,
        fabricated: emp.fabricated.filter(f => !selectedFabricated.has(rowKey(emp.employeeId, f))),
      })))
      setSelectedFabricated(new Set())
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddMissing(emp) {
    if (!emp.missing.length) return
    await saveAttendanceFlags(emp.employeeId, emp.missing)
    setReport(prev => prev.map(e => e === emp ? { ...e, missing: [] } : e))
  }

  const totalMatches = report?.reduce((s, e) => s + e.matches.length, 0) || 0
  const totalMismatches = report?.reduce((s, e) => s + e.mismatches.length, 0) || 0
  const totalMissing = report?.reduce((s, e) => s + e.missing.length, 0) || 0
  const totalFabricated = report?.reduce((s, e) => s + e.fabricated.length, 0) || 0

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Verify upload</span>
      </div>
      <div className="content">
        {stage === 'idle' && (
          <>
            <div className="info-box">
              <i className="ti ti-info-circle" aria-hidden="true" />
              <div>
                Re-upload a PDF report you've already uploaded before. This re-parses it with the
                corrected column-position logic and compares the result against what's actually stored,
                without changing anything until you review and confirm.
              </div>
            </div>
            <div
              className={`upload-zone${drag?' drag':''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={handleDrop}
            >
              <i className="ti ti-file-search" style={{fontSize:36,color:'var(--text-ter)',display:'block',marginBottom:12}} aria-hidden="true" />
              <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>Drop a previously-uploaded PDF here</div>
              <div style={{fontSize:12,color:'var(--text-sec)',marginBottom:16}}>
                PDF only — the CSV path was never affected by the column-position bug, so there's nothing to re-verify there.
              </div>
              <button className="btn btn-primary"><i className="ti ti-upload" aria-hidden="true" /> Choose file</button>
              <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e => processFile(e.target.files[0])} />
            </div>
          </>
        )}

        {stage === 'processing' && (
          <div className="card">
            <div className="card-body" style={{textAlign:'center',padding:48}}>
              <i className="ti ti-loader" style={{fontSize:36,color:'var(--text-ter)',display:'block',marginBottom:12}} aria-hidden="true" />
              <div style={{fontSize:14,fontWeight:500,marginBottom:8}}>{progress.step}</div>
              <div style={{background:'var(--bg)',borderRadius:4,height:6,overflow:'hidden',maxWidth:320,margin:'0 auto'}}>
                <div style={{height:'100%',background:'var(--amber)',borderRadius:4,width:`${progress.pct}%`,transition:'width .3s'}} />
              </div>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="danger-box" style={{padding:16}}>
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <div>
              <div style={{fontWeight:500,marginBottom:4}}>Verification failed</div>
              <div>{error}</div>
              <button className="btn btn-sm" style={{marginTop:8}} onClick={() => setStage('idle')}>Try again</button>
            </div>
          </div>
        )}

        {stage === 'done' && report && (
          <>
            <div className="metric-grid metric-grid-4" style={{marginBottom:16}}>
              <div className="metric"><div className="metric-label">Correct (matches)</div><div className="metric-value" style={{color:'var(--green)'}}>{totalMatches}</div></div>
              <div className="metric"><div className="metric-label">Wrong values</div><div className="metric-value" style={{color:totalMismatches?'var(--amber-txt)':'inherit'}}>{totalMismatches}</div></div>
              <div className="metric"><div className="metric-label">Missing entirely</div><div className="metric-value" style={{color:totalMissing?'var(--blue)':'inherit'}}>{totalMissing}</div></div>
              <div className="metric"><div className="metric-label">Fabricated (shouldn't exist)</div><div className="metric-value" style={{color:totalFabricated?'var(--red)':'inherit'}}>{totalFabricated}</div></div>
            </div>

            {deleteResult && (
              <div className="info-box">
                <i className="ti ti-circle-check" aria-hidden="true" />
                <div>Removed {deleteResult.deleted} fabricated flag{deleteResult.deleted!==1?'s':''}.</div>
              </div>
            )}

            {report.length === 0 ? (
              <div className="empty-state"><i className="ti ti-circle-check" style={{color:'var(--green)'}} /><div>Nothing in this report overlaps with stored flags, or everything matches perfectly.</div></div>
            ) : (
              <>
                {totalFabricated > 0 && (
                  <div className="card">
                    <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <span className="card-title" style={{marginBottom:0,color:'var(--red-txt)'}}>
                        <i className="ti ti-alert-triangle" /> Fabricated — shouldn't exist ({totalFabricated})
                      </span>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-sm" onClick={selectAllFabricated}>Select all</button>
                        <button className="btn btn-sm btn-danger" onClick={handleDeleteSelected} disabled={deleting || selectedFabricated.size===0}>
                          <i className="ti ti-trash" /> {deleting ? 'Removing…' : `Delete ${selectedFabricated.size} selected`}
                        </button>
                      </div>
                    </div>
                    {report.filter(e => e.fabricated.length).map(emp => (
                      <div key={emp.employeeId}>
                        {emp.fabricated.map(f => (
                          <div key={f.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'0.5px solid var(--border)'}}>
                            <input type="checkbox" checked={selectedFabricated.has(rowKey(emp.employeeId,f))} onChange={() => toggleFabricated(emp.employeeId, f)} style={{width:'auto'}} />
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,fontWeight:500}}>{emp.employeeName}</div>
                              <div style={{fontSize:12,color:'var(--text-sec)'}}>{TYPE_LABELS[f.type]||f.type} · {f.date} · {f.detail}</div>
                            </div>
                            <Link to={`/employees/${emp.employeeId}`} className="btn btn-sm">View</Link>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {totalMismatches > 0 && (
                  <div className="card">
                    <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                      <span className="card-title" style={{marginBottom:0,color:'var(--amber-txt)'}}>
                        <i className="ti ti-edit" /> Wrong values — same date/type, different detail ({totalMismatches})
                      </span>
                    </div>
                    {report.filter(e => e.mismatches.length).map(emp => (
                      <div key={emp.employeeId}>
                        {emp.mismatches.map((m, i) => (
                          <div key={i} style={{padding:'10px 16px',borderBottom:'0.5px solid var(--border)'}}>
                            <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>{emp.employeeName} — {m.stored.date}</div>
                            <div style={{fontSize:12,color:'var(--red-txt)'}}>Stored: {m.stored.detail}</div>
                            <div style={{fontSize:12,color:'var(--green-txt)'}}>Should be: {m.expected.detail}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div style={{padding:'10px 16px',fontSize:12,color:'var(--text-sec)'}}>
                      These need manual correction — go to each employee's profile, remove the wrong flag (treat it as fabricated), and the corrected value can be re-added via "Missing" below or a future correct upload.
                    </div>
                  </div>
                )}

                {totalMissing > 0 && (
                  <div className="card">
                    <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                      <span className="card-title" style={{marginBottom:0,color:'var(--blue-txt)'}}>
                        <i className="ti ti-plus" /> Missing — should exist but doesn't ({totalMissing})
                      </span>
                    </div>
                    {report.filter(e => e.missing.length).map(emp => (
                      <div key={emp.employeeId} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'0.5px solid var(--border)'}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:500}}>{emp.employeeName}</div>
                          <div style={{fontSize:12,color:'var(--text-sec)'}}>{emp.missing.length} flag{emp.missing.length!==1?'s':''} not yet recorded</div>
                        </div>
                        <button className="btn btn-sm" onClick={() => handleAddMissing(emp)}><i className="ti ti-plus" /> Add {emp.missing.length}</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="card">
                  <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                    <span className="card-title" style={{marginBottom:0,color:'var(--green-txt)'}}>
                      <i className="ti ti-circle-check" /> Confirmed correct ({totalMatches})
                    </span>
                  </div>
                  <div style={{padding:'10px 16px',fontSize:12,color:'var(--text-sec)'}}>
                    These flags match the corrected parser exactly — no action needed.
                  </div>
                </div>
              </>
            )}

            <button className="btn" style={{marginTop:16}} onClick={() => setStage('idle')}><i className="ti ti-upload" aria-hidden="true" /> Verify another file</button>
          </>
        )}
      </div>
    </>
  )
}
