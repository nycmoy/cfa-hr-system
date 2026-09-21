import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getEmployees, getConductEntries, createConductEntry, updateConductEntry, CONDUCT_LEVELS } from '../lib/db'

const LEVEL_LABEL = Object.fromEntries(CONDUCT_LEVELS.map(l => [l.value, l.label]))
const LEVEL_BADGE = Object.fromEntries(CONDUCT_LEVELS.map(l => [l.value, l.badge]))

export default function Conduct() {
  const [searchParams] = useSearchParams()
  const preEmpId = searchParams.get('empId')

  const [employees, setEmployees] = useState([])
  const [allEntries, setAllEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(!!preEmpId)
  const [saving, setSaving] = useState(false)

  // Form state
  const [empId, setEmpId] = useState(preEmpId || '')
  const [empName, setEmpName] = useState('')
  const [entryType, setEntryType] = useState('ownership_journal')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0,10))
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const emps = await getEmployees()
    setEmployees(emps)
    if (preEmpId) {
      const found = emps.find(e => e.id === preEmpId)
      if (found) setEmpName(found.name)
    }
    const all = []
    for (const emp of emps) {
      try {
        const entries = await getConductEntries(emp.id)
        entries.forEach(e => all.push({ ...e, employeeId: emp.id, employeeName: emp.name }))
      } catch {}
    }
    all.sort((a,b) => (b.date||'').localeCompare(a.date||''))
    setAllEntries(all)
    setLoading(false)
  }

  async function handleSave() {
    if (!empId || !entryDate) return
    setSaving(true)
    try {
      await createConductEntry(empId, {
        type: entryType,
        date: entryDate,
        category,
        description,
        notes,
        empName,
        countsTowardDiscipline: CONDUCT_LEVELS.find(l=>l.value===entryType)?.counts || false,
      })
      setShowForm(false)
      setDescription('')
      setNotes('')
      setCategory('')
      await load()
    } finally { setSaving(false) }
  }

  const pending = allEntries.filter(e => e.status !== 'resolved')

  if (loading) return <><div className="topbar"><span className="topbar-title">Standards of Conduct</span></div><div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading…</div></>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Standards of Conduct</span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {pending.length > 0 && <span className="badge badge-danger">{pending.length} active</span>}
          <button className="btn btn-primary" onClick={()=>setShowForm(true)}><i className="ti ti-plus" /> New entry</button>
        </div>
      </div>

      <div className="content">
        <div className="info-box" style={{marginBottom:16}}>
          <i className="ti ti-info-circle" />
          <div>
            <strong>Standards of Conduct framework</strong> — This tracks conduct-related entries separately from attendance. 
            Detailed categories and evaluation criteria will be added when content is provided. 
            The ladder runs: Ownership Journal Entry → Verbal Warning → Written Warning → Final Warning → Termination.
          </div>
        </div>

        {allEntries.length === 0 ? (
          <div className="empty-state"><i className="ti ti-shield-check" style={{color:'var(--green)'}} /><div>No conduct entries yet.</div></div>
        ) : (
          <div className="card" style={{padding:0}}>
            <table className="data-table">
              <thead><tr><th>Employee</th><th>Type</th><th>Date</th><th>Category</th><th>Description</th><th>Status</th></tr></thead>
              <tbody>
                {allEntries.map(e => (
                  <tr key={e.id}>
                    <td><Link to={`/employees/${e.employeeId}`} style={{fontWeight:500,color:'var(--text)',textDecoration:'none'}}>{e.employeeName}</Link></td>
                    <td><span className={`badge ${LEVEL_BADGE[e.type]||'badge-gray'}`}>{LEVEL_LABEL[e.type]||e.type}</span></td>
                    <td className="mono" style={{fontSize:11}}>{e.date}</td>
                    <td style={{fontSize:12,color:'var(--text-sec)'}}>{e.category||'—'}</td>
                    <td style={{fontSize:12,color:'var(--text-sec)',maxWidth:200}}>{e.description||'—'}</td>
                    <td><span className={`badge ${e.status==='resolved'?'badge-ok':'badge-warn'}`}>{e.status||'active'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="modal" style={{width:520}}>
            <div className="modal-header">
              <div className="modal-header-title">New conduct entry</div>
              <button className="btn btn-sm" onClick={()=>setShowForm(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Employee</label>
                <select value={empId} onChange={e=>{setEmpId(e.target.value);setEmpName(employees.find(x=>x.id===e.target.value)?.name||'')}}>
                  <option value="">— select —</option>
                  {employees.filter(e=>(e.status||'active')==='active').map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Entry type</label>
                  <select value={entryType} onChange={e=>setEntryType(e.target.value)}>
                    {CONDUCT_LEVELS.map(l=><option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Category <span style={{color:'var(--text-ter)',fontWeight:400}}>(optional — will be defined with conduct standards)</span></label>
                <input type="text" value={category} onChange={e=>setCategory(e.target.value)} placeholder="e.g. Uniform, Guest experience, Teamwork…" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the specific conduct issue or observation…" style={{minHeight:80}} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes / Action taken</label>
                <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What was discussed, what corrective action was agreed upon…" style={{minHeight:72}} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving||!empId||!entryDate}><i className="ti ti-device-floppy" /> {saving?'Saving…':'Save entry'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
