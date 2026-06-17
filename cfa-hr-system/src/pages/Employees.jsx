import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, upsertEmployee } from '../lib/db'

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
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPos, setNewPos] = useState('Team Member')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getEmployees().then(e => { setEmployees(e); setLoading(false) })
  }, [])

  async function addEmployee() {
    if (!newName.trim()) return
    setSaving(true)
    await upsertEmployee(newName.trim(), { position: newPos })
    const updated = await getEmployees()
    setEmployees(updated)
    setShowAdd(false)
    setNewName('')
    setSaving(false)
  }

  const filtered = employees.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase())
  )

  const sevColor = (level) => {
    if (level === 'final_warning') return '#C13333'
    if (level === 'written_warning' || level === 'coaching') return '#E89A1A'
    return '#3B6D11'
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading...</div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Employees</span>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <i className="ti ti-plus" aria-hidden="true" /> Add employee
        </button>
      </div>
      <div className="content">
        <div className="metric-grid metric-grid-4" style={{marginBottom:16}}>
          <div className="metric"><div className="metric-label">Total employees</div><div className="metric-value">{employees.length}</div></div>
          <div className="metric"><div className="metric-label">Active</div><div className="metric-value">{employees.filter(e=>e.status==='active').length}</div></div>
          <div className="metric"><div className="metric-label">In discipline</div><div className="metric-value" style={{color:'var(--red)'}}>{employees.filter(e=>e.leadershipStatus&&e.leadershipStatus!=='good_standing').length}</div></div>
          <div className="metric"><div className="metric-label">Good standing</div><div className="metric-value" style={{color:'var(--green)'}}>{employees.filter(e=>!e.leadershipStatus||e.leadershipStatus==='good_standing').length}</div></div>
        </div>

        <div className="card" style={{padding:0}}>
          <div style={{padding:'10px 14px',borderBottom:'0.5px solid var(--border)'}}>
            <input type="text" placeholder="Search employees…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{border:'none',outline:'none',fontSize:13,background:'transparent',width:'100%'}} />
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state"><i className="ti ti-users" /><div>No employees found</div></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Position</th><th>Discipline status</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(emp => {
                  const level = emp.leadershipStatus || emp.disciplineLevel || 'good_standing'
                  return (
                    <tr key={emp.id}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:4,height:32,borderRadius:0,background:sevColor(level),flexShrink:0}} />
                          <div>
                            <div style={{fontWeight:500}}>{emp.name}</div>
                            <div className="mono">{emp.id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{color:'var(--text-sec)',fontSize:12}}>{emp.position || 'Team Member'}</td>
                      <td><span className={`badge ${LEVEL_BADGE[level]||'badge-gray'}`}>{LEVEL_LABEL[level]||level}</span></td>
                      <td><span className={`badge ${emp.status==='active'?'badge-ok':'badge-gray'}`}>{emp.status||'active'}</span></td>
                      <td><Link to={`/employees/${emp.id}`} className="btn btn-sm">View profile</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-header-title">Add employee</div>
              <button className="btn btn-sm" onClick={() => setShowAdd(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Full name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Lastname, Firstname" />
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
    </>
  )
}
