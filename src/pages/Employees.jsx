import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { getEmployees, upsertEmployee } from '../lib/db'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'

const LEVEL_LABEL = {
  good_standing: 'Good standing',
  coaching: 'Coaching',
  written_warning: 'Written warning',
  final_warning: 'Final warning',
}
const LEVEL_BADGE = {
  good_standing: 'badge-ok',
  coaching: 'badge-warn',
  written_warning: 'badge-warn',
  final_warning: 'badge-danger',
}

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPos, setNewPos] = useState('Team Member')
  const [saving, setSaving] = useState(false)

  // Import state
  const [importRows, setImportRows] = useState([])   // parsed preview rows
  const [importStep, setImportStep] = useState('upload') // upload | preview | done
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    loadEmployees()
  }, [])

  async function loadEmployees() {
    const e = await getEmployees()
    setEmployees(e)
    setLoading(false)
  }

  async function addEmployee() {
    if (!newName.trim()) return
    setSaving(true)
    await upsertEmployee(newName.trim(), { position: newPos })
    await loadEmployees()
    setShowAdd(false)
    setNewName('')
    setSaving(false)
  }

  async function toggleStatus(emp) {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active'
    await updateDoc(doc(db, 'employees', emp.id), { status: newStatus })
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: newStatus } : e))
  }

  // ── CSV IMPORT ──────────────────────────────────────────────────────────────
  function handleImportFile(file) {
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        // Accept either a dedicated employee CSV or the punch variance report
        // Look for a FULL_NAME column or a Name column
        const rows = result.data
        const nameKey = Object.keys(rows[0] || {}).find(k =>
          k.trim().toUpperCase() === 'FULL_NAME' || k.trim().toUpperCase() === 'NAME'
        )
        if (!nameKey) {
          alert('CSV must have a FULL_NAME or Name column.')
          return
        }
        // Deduplicate names within the file
        const seen = new Set()
        const unique = []
        for (const row of rows) {
          const name = row[nameKey]?.trim().replace(/^"|"$/g, '')
          if (name && !seen.has(name)) {
            seen.add(name)
            unique.push({
              name,
              position: row.POSITION || row.Position || row.ROLE || row.Role || 'Team Member',
              raw: row,
            })
          }
        }
        setImportRows(unique)
        setImportStep('preview')
      }
    })
  }

  async function runImport() {
    setImporting(true)
    const existing = await getEmployees()
    const existingIds = new Set(existing.map(e => e.id))
    const existingNames = new Set(existing.map(e => e.name.toLowerCase()))

    let added = 0, skipped = 0, updated = 0
    const details = []

    for (const row of importRows) {
      const id = row.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_')
      if (existingIds.has(id) || existingNames.has(row.name.toLowerCase())) {
        // Duplicate — update position if provided, don't overwrite discipline data
        await upsertEmployee(row.name, { position: row.position })
        skipped++
        details.push({ name: row.name, result: 'duplicate — skipped (data preserved)' })
      } else {
        await upsertEmployee(row.name, { position: row.position })
        added++
        details.push({ name: row.name, result: 'added' })
      }
    }

    await loadEmployees()
    setImportResult({ added, skipped, updated, details })
    setImportStep('done')
    setImporting(false)
  }

  function resetImport() {
    setImportRows([])
    setImportStep('upload')
    setImportResult(null)
    setShowImport(false)
  }

  const filtered = employees.filter(e => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || (e.status || 'active') === statusFilter
    return matchSearch && matchStatus
  })

  const sevColor = level => {
    if (level === 'final_warning') return '#C13333'
    if (level === 'written_warning' || level === 'coaching') return '#E89A1A'
    return '#3B6D11'
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading...</div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Employees</span>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={() => setShowImport(true)}>
            <i className="ti ti-file-import" aria-hidden="true" /> Import CSV
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <i className="ti ti-plus" aria-hidden="true" /> Add employee
          </button>
        </div>
      </div>
      <div className="content">
        <div className="metric-grid metric-grid-4" style={{marginBottom:16}}>
          <div className="metric"><div className="metric-label">Total</div><div className="metric-value">{employees.length}</div></div>
          <div className="metric"><div className="metric-label">Active</div><div className="metric-value">{employees.filter(e=>(e.status||'active')==='active').length}</div></div>
          <div className="metric"><div className="metric-label">Inactive</div><div className="metric-value" style={{color:'var(--text-sec)'}}>{employees.filter(e=>e.status==='inactive').length}</div></div>
          <div className="metric"><div className="metric-label">In discipline</div><div className="metric-value" style={{color:'var(--red)'}}>{employees.filter(e=>e.leadershipStatus&&e.leadershipStatus!=='good_standing').length}</div></div>
        </div>

        <div className="card" style={{padding:0}}>
          <div style={{padding:'10px 14px',borderBottom:'0.5px solid var(--border)',display:'flex',gap:12,alignItems:'center'}}>
            <input type="text" placeholder="Search employees…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{border:'none',outline:'none',fontSize:13,background:'transparent',flex:1}} />
            <div style={{display:'flex',gap:6}}>
              {[['active','Active'],['inactive','Inactive'],['all','All']].map(([v,l]) => (
                <button key={v} onClick={() => setStatusFilter(v)} className="btn btn-sm"
                  style={statusFilter===v?{background:'var(--amber)',borderColor:'var(--amber)',color:'#fff'}:{}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state"><i className="ti ti-users" /><div>No employees found</div></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Position</th><th>Discipline status</th><th>Active</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(emp => {
                  const level = emp.leadershipStatus || emp.disciplineLevel || 'good_standing'
                  const isActive = (emp.status || 'active') === 'active'
                  return (
                    <tr key={emp.id} style={{opacity: isActive ? 1 : 0.55}}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:4,height:32,background:sevColor(level),flexShrink:0}} />
                          <div>
                            <div style={{fontWeight:500}}>{emp.name}</div>
                            <div className="mono">{emp.id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{color:'var(--text-sec)',fontSize:12}}>{emp.position || 'Team Member'}</td>
                      <td><span className={`badge ${LEVEL_BADGE[level]||'badge-gray'}`}>{LEVEL_LABEL[level]||level}</span></td>
                      <td>
                        <button
                          className="btn btn-sm"
                          style={isActive
                            ? {background:'var(--green-lt)',color:'var(--green-txt)',borderColor:'var(--green)'}
                            : {background:'#F1EFE8',color:'#5F5E5A'}}
                          onClick={() => toggleStatus(emp)}
                          title={isActive ? 'Click to inactivate' : 'Click to reactivate'}
                        >
                          {isActive ? <><i className="ti ti-circle-check" /> Active</> : <><i className="ti ti-circle-x" /> Inactive</>}
                        </button>
                      </td>
                      <td><Link to={`/employees/${emp.id}`} className="btn btn-sm">View profile</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add employee modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowAdd(false)}>
          <div className="modal" style={{width:400}}>
            <div className="modal-header">
              <div className="modal-header-title">Add employee</div>
              <button className="btn btn-sm" onClick={() => setShowAdd(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Full name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Lastname, Firstname" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Position</label>
                <select value={newPos} onChange={e => setNewPos(e.target.value)}>
                  <option>Team Member</option>
                  <option>Team Leader</option>
                  <option>Shift Lead</option>
                  <option>Kitchen Lead</option>
                  <option>Manager</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addEmployee} disabled={saving || !newName.trim()}>
                <i className="ti ti-plus" /> Add employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && resetImport()}>
          <div className="modal" style={{width:620}}>
            <div className="modal-header">
              <div className="modal-header-title">Import employees from CSV</div>
              <button className="btn btn-sm" onClick={resetImport}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">

              {importStep === 'upload' && (
                <>
                  <div className="info-box">
                    <i className="ti ti-info-circle" aria-hidden="true" />
                    <div>
                      CSV must have a <strong>FULL_NAME</strong> or <strong>Name</strong> column.
                      Optionally include a <strong>POSITION</strong> or <strong>Role</strong> column.
                      Duplicates are detected automatically — existing employee data is never overwritten.
                    </div>
                  </div>
                  <div
                    className="upload-zone"
                    onClick={() => fileRef.current?.click()}
                    style={{padding:32}}
                  >
                    <i className="ti ti-file-import" style={{fontSize:32,color:'var(--text-ter)',display:'block',marginBottom:12}} aria-hidden="true" />
                    <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>Drop employee CSV here</div>
                    <div style={{fontSize:12,color:'var(--text-sec)',marginBottom:12}}>You can also use your punch variance export — it will extract unique employee names</div>
                    <button className="btn btn-primary">Choose file</button>
                    <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}}
                      onChange={e => handleImportFile(e.target.files[0])} />
                  </div>
                </>
              )}

              {importStep === 'preview' && (
                <>
                  <div style={{marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{fontSize:13,fontWeight:500}}>{importRows.length} unique employees found in file</div>
                    <button className="btn btn-sm" onClick={() => setImportStep('upload')}>← Back</button>
                  </div>
                  <div style={{maxHeight:320,overflowY:'auto',border:'0.5px solid var(--border)',borderRadius:'var(--radius)'}}>
                    <table className="data-table">
                      <thead><tr><th>Name</th><th>Position</th><th>Status</th></tr></thead>
                      <tbody>
                        {importRows.map((r,i) => {
                          const id = r.name.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/__+/g,'_')
                          const isDupe = employees.some(e => e.id === id || e.name.toLowerCase() === r.name.toLowerCase())
                          return (
                            <tr key={i}>
                              <td style={{fontWeight:500}}>{r.name}</td>
                              <td style={{color:'var(--text-sec)',fontSize:12}}>{r.position}</td>
                              <td>
                                {isDupe
                                  ? <span className="badge badge-warn">Exists — will skip</span>
                                  : <span className="badge badge-ok">New — will add</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{marginTop:12,fontSize:12,color:'var(--text-sec)'}}>
                    <strong>{importRows.filter(r => !employees.some(e => e.name.toLowerCase()===r.name.toLowerCase())).length}</strong> new ·{' '}
                    <strong>{importRows.filter(r => employees.some(e => e.name.toLowerCase()===r.name.toLowerCase())).length}</strong> duplicates (will be skipped)
                  </div>
                </>
              )}

              {importStep === 'done' && importResult && (
                <div>
                  <div style={{textAlign:'center',padding:'20px 0 16px'}}>
                    <i className="ti ti-circle-check" style={{fontSize:40,color:'var(--green)',display:'block',marginBottom:10}} />
                    <div style={{fontSize:16,fontWeight:500}}>Import complete</div>
                  </div>
                  <div className="metric-grid metric-grid-3" style={{marginBottom:16}}>
                    <div className="metric"><div className="metric-label">Added</div><div className="metric-value" style={{color:'var(--green)'}}>{importResult.added}</div></div>
                    <div className="metric"><div className="metric-label">Skipped (duplicate)</div><div className="metric-value" style={{color:'var(--amber-txt)'}}>{importResult.skipped}</div></div>
                    <div className="metric"><div className="metric-label">Total processed</div><div className="metric-value">{importRows.length}</div></div>
                  </div>
                  <div style={{maxHeight:200,overflowY:'auto',border:'0.5px solid var(--border)',borderRadius:'var(--radius)'}}>
                    <table className="data-table">
                      <thead><tr><th>Name</th><th>Result</th></tr></thead>
                      <tbody>
                        {importResult.details.map((d,i) => (
                          <tr key={i}>
                            <td>{d.name}</td>
                            <td style={{fontSize:12,color:d.result==='added'?'var(--green-txt)':'var(--text-sec)'}}>{d.result}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {importStep === 'preview' && (
                <>
                  <button className="btn" onClick={resetImport}>Cancel</button>
                  <button className="btn btn-primary" onClick={runImport} disabled={importing}>
                    {importing ? 'Importing…' : `Import ${importRows.filter(r => !employees.some(e => e.name.toLowerCase()===r.name.toLowerCase())).length} new employees`}
                  </button>
                </>
              )}
              {importStep === 'done' && (
                <button className="btn btn-primary" onClick={resetImport}>Done</button>
              )}
              {importStep === 'upload' && (
                <button className="btn" onClick={resetImport}>Cancel</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
