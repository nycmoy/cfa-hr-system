import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { parseCSVRow, analyzeEmployee } from '../lib/attendanceEngine'
import { upsertEmployee, saveAttendanceFlags, recordUpload } from '../lib/db'
import { Link } from 'react-router-dom'

const RULES = [
  ['#E89A1A', '5–9 min late', '2+ in any 2-week window (anchored Jun 7) = 1 documentation'],
  ['#C13333', '10+ min late', 'Each instance = its own documentation'],
  ['#791F1F', '120+ min late', 'Treated as possible no-show — investigation required'],
  ['#185FA5', '30+ min early departure', 'Flagged for manager review'],
  ['#888780', '5+ hrs over schedule', 'Flagged for possible missed punch'],
]

export default function Upload() {
  const [stage, setStage] = useState('idle') // idle | processing | done | error
  const [drag, setDrag] = useState(false)
  const [progress, setProgress] = useState({ step: '', pct: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const processFile = useCallback(async (file) => {
    setStage('processing')
    setError('')

    try {
      // Parse CSV
      setProgress({ step: 'Parsing CSV…', pct: 10 })
      const text = await file.text()
      const parsed = await new Promise((res, rej) =>
        Papa.parse(text, { header: true, skipEmptyLines: true, complete: res, error: rej })
      )

      const rows = parsed.data
      if (!rows.length) throw new Error('No data rows found in file.')
      if (!rows[0].FULL_NAME) throw new Error('File does not appear to be a punch variance export. Expected column: FULL_NAME.')

      setProgress({ step: 'Grouping shifts by employee…', pct: 25 })
      const byEmployee = {}
      for (const row of rows) {
        const shift = parseCSVRow(row)
        if (!shift.name) continue
        if (!byEmployee[shift.name]) byEmployee[shift.name] = []
        byEmployee[shift.name].push(shift)
      }

      const empNames = Object.keys(byEmployee)
      setProgress({ step: `Analyzing ${empNames.length} employees…`, pct: 40 })

      let totalDocs = 0, totalNoshow = 0, totalTier2 = 0, totalTier1 = 0
      let totalEarly = 0, totalOverage = 0, affectedCount = 0
      const summaries = []

      for (let i = 0; i < empNames.length; i++) {
        const name = empNames[i]
        const shifts = byEmployee[name]
        const analysis = analyzeEmployee(shifts)

        setProgress({
          step: `Processing ${name}…`,
          pct: Math.round(40 + (i / empNames.length) * 40),
        })

        // Upsert employee
        const empId = await upsertEmployee(name, { totalShifts: shifts.length })

        // Save only flags that should be stored (excludes tier1-info which is below threshold)
        if (analysis.flagsToSave?.length) {
          await saveAttendanceFlags(empId, analysis.flagsToSave)
        }

        totalDocs += analysis.docCount
        totalNoshow += analysis.noshow.length
        totalTier2 += analysis.tier2.length
        totalTier1 += analysis.tier1Docs.length
        totalEarly += analysis.early.length
        totalOverage += analysis.overage.length
        if (analysis.docCount > 0) affectedCount++

        summaries.push({
          name,
          empId,
          docCount: analysis.docCount,
          noshow: analysis.noshow.length,
          tier2: analysis.tier2.length,
          tier1: analysis.tier1Docs.length,
          early: analysis.early.length,
        })
      }

      setProgress({ step: 'Recording upload…', pct: 90 })

      // Detect date range
      const allDates = rows.map(r => new Date(r.WORKDAY)).filter(d => !isNaN(d))
      const minDate = new Date(Math.min(...allDates)).toLocaleDateString('en-US')
      const maxDate = new Date(Math.max(...allDates)).toLocaleDateString('en-US')
      const dateRange = `${minDate} – ${maxDate}`

      await recordUpload({
        fileName: file.name,
        dateRange,
        empCount: empNames.length,
        shiftCount: rows.length,
        totalDocs,
        affectedCount,
      })

      setProgress({ step: 'Done!', pct: 100 })
      setResult({
        fileName: file.name,
        dateRange,
        empCount: empNames.length,
        shiftCount: rows.length,
        totalDocs,
        totalNoshow,
        totalTier2,
        totalTier1,
        totalEarly,
        totalOverage,
        affectedCount,
        top: summaries.sort((a, b) => b.docCount - a.docCount).slice(0, 8),
      })
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

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Upload time report</span>
      </div>
      <div className="content">
        {stage === 'idle' && (
          <>
            <div className="card">
              <div className="card-body">
                <div className="card-title"><i className="ti ti-ruler-2" aria-hidden="true" /> Rules active for this upload</div>
                {RULES.map(([dot, title, sub]) => (
                  <div key={title} style={{display:'flex',gap:12,alignItems:'flex-start',padding:'8px 0',borderBottom:'0.5px solid var(--border)'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:dot,flexShrink:0,marginTop:5}} />
                    <div>
                      <div style={{fontSize:13,fontWeight:500}}>{title}</div>
                      <div style={{fontSize:12,color:'var(--text-sec)',marginTop:1}}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`upload-zone${drag?' drag':''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={handleDrop}
            >
              <i className="ti ti-file-spreadsheet" style={{fontSize:36,color:'var(--text-ter)',display:'block',marginBottom:12}} aria-hidden="true" />
              <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>Drop your punch variance CSV here</div>
              <div style={{fontSize:12,color:'var(--text-sec)',marginBottom:16}}>
                Export from your POS as CSV with columns: FULL_NAME, WORKDAY, SCHED_START, SCHED_END, WORK_START, WORK_END, START_VARIANCE, END_VARIANCE
              </div>
              <button className="btn btn-primary"><i className="ti ti-upload" aria-hidden="true" /> Choose file</button>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e => processFile(e.target.files[0])} />
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
              <div style={{fontWeight:500,marginBottom:4}}>Upload failed</div>
              <div>{error}</div>
              <button className="btn btn-sm" style={{marginTop:8}} onClick={() => setStage('idle')}>Try again</button>
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <>
            <div className="card" style={{borderLeft:'3px solid var(--green)'}}>
              <div className="card-body">
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'var(--green-lt)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--green)'}}>
                    <i className="ti ti-check" style={{fontSize:18}} aria-hidden="true" />
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:500}}>Report processed — {result.dateRange}</div>
                    <div style={{fontSize:12,color:'var(--text-sec)'}}>{result.empCount} employees · {result.shiftCount.toLocaleString()} shifts</div>
                  </div>
                </div>
                <div className="metric-grid metric-grid-5" style={{marginBottom:16}}>
                  <div className="metric"><div className="metric-label">Docs needed</div><div className="metric-value" style={{color:'var(--red)'}}>{result.totalDocs}</div></div>
                  <div className="metric"><div className="metric-label">No-shows</div><div className="metric-value" style={{color:'#791F1F'}}>{result.totalNoshow}</div></div>
                  <div className="metric"><div className="metric-label">Tier 2 lates</div><div className="metric-value" style={{color:'var(--red)'}}>{result.totalTier2}</div></div>
                  <div className="metric"><div className="metric-label">Tier 1 patterns</div><div className="metric-value" style={{color:'var(--amber-txt)'}}>{result.totalTier1}</div></div>
                  <div className="metric"><div className="metric-label">Early departures</div><div className="metric-value" style={{color:'var(--blue)'}}>{result.totalEarly}</div></div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <Link to="/flags" className="btn btn-primary"><i className="ti ti-alert-circle" aria-hidden="true" /> Review flags</Link>
                  <button className="btn" onClick={() => setStage('idle')}><i className="ti ti-upload" aria-hidden="true" /> Upload another</button>
                </div>
              </div>
            </div>

            {result.top.length > 0 && (
              <div className="card">
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
                  <span className="card-title" style={{marginBottom:0}}><i className="ti ti-podium" aria-hidden="true" /> Top priority — most documentation events</span>
                </div>
                <table className="data-table">
                  <thead><tr><th>Employee</th><th>Total docs</th><th>No-show</th><th>Tier 2</th><th>Tier 1</th><th>Early exits</th><th></th></tr></thead>
                  <tbody>
                    {result.top.filter(e => e.docCount > 0).map(e => (
                      <tr key={e.empId}>
                        <td style={{fontWeight:500}}>{e.name}</td>
                        <td><span className="badge badge-danger">{e.docCount}</span></td>
                        <td>{e.noshow > 0 ? <span className="badge badge-danger">{e.noshow}</span> : '—'}</td>
                        <td>{e.tier2 > 0 ? <span className="badge badge-warn">{e.tier2}</span> : '—'}</td>
                        <td>{e.tier1 > 0 ? <span className="badge badge-warn">{e.tier1}</span> : '—'}</td>
                        <td>{e.early > 0 ? <span className="badge badge-info">{e.early}</span> : '—'}</td>
                        <td><Link to={`/employees/${e.empId}`} className="btn btn-sm">View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
