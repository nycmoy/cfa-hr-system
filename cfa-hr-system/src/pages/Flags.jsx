import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, getAttendanceFlags, updateFlagStatus } from '../lib/db'

const TYPE_LABELS = {
  noshow: 'No-show',
  tier2: '10+ min late',
  tier1: 'Tier 1 pattern',
  'tier1-info': 'Minor late',
  early: 'Early departure',
  overage: 'Overage',
}

const SEV_STYLE = {
  critical: { bg: 'var(--red-lt)', border: 'var(--red)', text: 'var(--red-txt)', dot: '#A32D2D' },
  high:     { bg: 'var(--red-lt)', border: 'var(--red)', text: 'var(--red-txt)', dot: '#C13333' },
  medium:   { bg: 'var(--amber-lt)', border: 'var(--amber)', text: 'var(--amber-txt)', dot: '#E89A1A' },
  review:   { bg: 'var(--blue-lt)', border: '#B5D4F4', text: 'var(--blue-txt)', dot: '#185FA5' },
  info:     { bg: '#F1EFE8', border: '#D3D1C7', text: '#444441', dot: '#888780' },
}

export default function Flags() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadFlags() }, [])

  async function loadFlags() {
    setLoading(true)
    const emps = await getEmployees()
    const all = []
    for (const emp of emps) {
      const flags = await getAttendanceFlags(emp.id)
      flags.forEach(f => all.push({ ...f, employeeId: emp.id, employeeName: emp.name }))
    }
    all.sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, review: 3, info: 4 }
      return (sev[a.severity] ?? 5) - (sev[b.severity] ?? 5)
    })
    setRows(all)
    setLoading(false)
  }

  async function resolve(status) {
    if (!selected) return
    setSaving(true)
    await updateFlagStatus(selected.employeeId, selected.id, status, note)
    setRows(prev => prev.map(r => r.id === selected.id && r.employeeId === selected.employeeId
      ? { ...r, status, statusNote: note } : r))
    setSelected(null)
    setNote('')
    setSaving(false)
  }

  const filtered = rows.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    return true
  })

  const pending = rows.filter(r => r.status === 'pending').length
  const docNeeded = rows.filter(r => r.status === 'pending' && ['noshow','tier2','tier1'].includes(r.type)).length

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading flags...</div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Attendance flags</span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {pending > 0 && <span className="badge badge-danger">{pending} pending</span>}
          {docNeeded > 0 && <span className="badge badge-warn">{docNeeded} need docs</span>}
        </div>
      </div>
      <div className="content">
        {docNeeded > 0 && (
          <div className="warn-box">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <div><strong>{docNeeded} flags</strong> require documentation. Review and either excuse or create documentation for each one.</div>
          </div>
        )}

        {/* Filters */}
        <div className="card" style={{marginBottom:16}}>
          <div style={{padding:'10px 16px',display:'flex',gap:8,flexWrap:'wrap',borderBottom:'0.5px solid var(--border)'}}>
            <span style={{fontSize:12,color:'var(--text-sec)',alignSelf:'center',marginRight:4}}>Status:</span>
            {[['pending','Pending'],['excused','Excused'],['documented','Documented'],['all','All']].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className="btn btn-sm" style={filter===v?{background:'var(--amber)',borderColor:'var(--amber)',color:'#fff'}:{}}>
                {l}
              </button>
            ))}
          </div>
          <div style={{padding:'10px 16px',display:'flex',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:12,color:'var(--text-sec)',alignSelf:'center',marginRight:4}}>Type:</span>
            {[['all','All'],['noshow','No-show'],['tier2','10+ min'],['tier1','Tier 1'],['early','Early departure'],['overage','Overage']].map(([v,l]) => (
              <button key={v} onClick={() => setTypeFilter(v)}
                className="btn btn-sm" style={typeFilter===v?{background:'var(--blue)',borderColor:'var(--blue)',color:'#fff'}:{}}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Flag list */}
        <div className="card" style={{padding:0}}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-circle-check" style={{color:'var(--green)'}} />
              <div>No flags match this filter</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Detail</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const s = SEV_STYLE[f.severity] || SEV_STYLE.info
                  return (
                    <tr key={`${f.employeeId}-${f.id}`}>
                      <td>
                        <Link to={`/employees/${f.employeeId}`} style={{fontWeight:500,color:'var(--text)',textDecoration:'none'}}>
                          {f.employeeName}
                        </Link>
                      </td>
                      <td>
                        <span className="badge" style={{background:s.bg,color:s.text,border:`0.5px solid ${s.border}`}}>
                          {TYPE_LABELS[f.type] || f.type}
                        </span>
                      </td>
                      <td className="mono">{f.date}</td>
                      <td style={{fontSize:12,color:'var(--text-sec)',maxWidth:240}}>{f.detail}</td>
                      <td>
                        <span className={`badge ${f.status==='excused'?'badge-ok':f.status==='documented'?'badge-info':'badge-warn'}`}>
                          {f.status || 'pending'}
                        </span>
                      </td>
                      <td>
                        {f.status === 'pending' && (
                          <button className="btn btn-sm" onClick={() => { setSelected(f); setNote('') }}>
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Review modal */}
      {selected && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setSelected(null)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-header-title">{selected.employeeName}</div>
                <div style={{fontSize:12,color:'var(--text-sec)'}}>{TYPE_LABELS[selected.type]} · {selected.date}</div>
              </div>
              <button className="btn btn-sm" onClick={() => setSelected(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="flag-card flag-crit" style={{marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>{selected.detail}</div>
                {selected.lates && (
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>
                    {selected.lates.map((l,i) => (
                      <span key={i} style={{fontSize:11,background:'rgba(0,0,0,.06)',borderRadius:3,padding:'1px 5px'}}>{l.date} · {l.minutes} min</span>
                    ))}
                  </div>
                )}
              </div>

              {selected.type === 'noshow' && (
                <div className="warn-box">
                  <i className="ti ti-info-circle" aria-hidden="true" />
                  <div>No-show requires investigation before logging. Confirm: Was this approved? Schedule error? Emergency?</div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Notes / investigation findings</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Record what you found or any context…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setSelected(null)}>Cancel</button>
              <button className="btn" style={{background:'var(--green-lt)',color:'var(--green-txt)',borderColor:'var(--green)'}}
                onClick={() => resolve('excused')} disabled={saving}>
                <i className="ti ti-check" /> Excuse
              </button>
              <Link
                to={`/documentation?empId=${selected.employeeId}&flagId=${selected.id}&type=${selected.type}`}
                className="btn btn-primary"
                onClick={() => setSelected(null)}
              >
                <i className="ti ti-file-plus" /> Create documentation
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
