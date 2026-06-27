import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees, getAttendanceFlags, updateFlagStatus, createDocument } from '../lib/db'
import { generateCoachingNote } from '../lib/pdfGenerator'

const TYPE_LABELS = {
  noshow: 'No-show',
  tier2: '10+ min late',
  tier1: 'Tier 1 pattern',
  'tier1-info': 'Minor late',
  early: 'Early departure',
  overage: 'Overage',
  excessive_absence: 'Excessive absences',
}

const SEV_STYLE = {
  critical: { bg: 'var(--red-lt)', border: 'var(--red)', text: 'var(--red-txt)' },
  high:     { bg: 'var(--red-lt)', border: 'var(--red)', text: 'var(--red-txt)' },
  medium:   { bg: 'var(--amber-lt)', border: 'var(--amber)', text: 'var(--amber-txt)' },
  review:   { bg: 'var(--blue-lt)', border: '#B5D4F4', text: 'var(--blue-txt)' },
  info:     { bg: '#F1EFE8', border: '#D3D1C7', text: '#444441' },
}

const RESOLVE_OPTIONS = {
  noshow:    ['documentation_only','create_documentation','override'],
  tier2:     ['documentation_only','create_documentation','override'],
  tier1:     ['documentation_only','create_documentation','override'],
  early:     ['documentation_only','override','excuse'],
  overage:   ['override','excuse'],
  'tier1-info': ['override','excuse'],
  excessive_absence: ['create_documentation','documentation_only','excuse'],
}

const OPTION_META = {
  documentation_only:   { label: 'Documentation only', desc: 'Record in file — does not count toward progressive discipline', color: 'var(--blue)', bg: 'var(--blue-lt)', border: '#B5D4F4' },
  create_documentation: { label: 'Create documentation', desc: 'Opens documentation form — counts toward discipline', color: 'var(--red)', bg: 'var(--red-lt)', border: '#F7C1C1' },
  override:             { label: 'Override — remove flag', desc: 'Remove flag with required comment explaining reason', color: 'var(--amber-txt)', bg: 'var(--amber-lt)', border: '#FAC775' },
  excuse:               { label: 'Excuse', desc: 'Mark as excused — no documentation created', color: 'var(--green)', bg: 'var(--green-lt)', border: '#C0DD97' },
}

// Sort key resolvers — each returns a comparable primitive for a given row
const SORT_RESOLVERS = {
  employee: f => f.employeeName?.toLowerCase() || '',
  type: f => TYPE_LABELS[f.type] || f.type || '',
  date: f => {
    // tier1 flags use windowIdx for chronological sort, others use workday/date
    if (f.type === 'tier1' && typeof f.windowIdx === 'number') return f.windowIdx
    if (f.workday?.seconds) return f.workday.seconds
    if (f.date) {
      const d = new Date(f.date)
      return isNaN(d) ? 0 : d.getTime()
    }
    return 0
  },
  detail: f => f.detail?.toLowerCase() || '',
  status: f => f.status || 'pending',
}

export default function Flags() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [typeFilter, setTypeFilter] = useState('all')
  const [empFilter, setEmpFilter] = useState('all')
  const [sortKey, setSortKey] = useState('severity')
  const [sortDir, setSortDir] = useState('asc')
  const [selected, setSelected] = useState(null)
  const [resolution, setResolution] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Bulk selection — checkbox per row, batch excuse/override across all
  // selected flags at once.
  const [selectedIds, setSelectedIds] = useState(new Set()) // keys: `${employeeId}::${id}`
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkResolution, setBulkResolution] = useState('')
  const [bulkNote, setBulkNote] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => { loadFlags() }, [])

  async function loadFlags() {
    setLoading(true)
    const emps = await getEmployees()
    // Inactive employees should never surface flags for review — their
    // attendance history is no longer actionable once they're inactive.
    const activeEmps = emps.filter(e => (e.status || 'active') === 'active')
    const all = []
    for (const emp of activeEmps) {
      const flags = await getAttendanceFlags(emp.id)
      flags.forEach(f => all.push({ ...f, employeeId: emp.id, employeeName: emp.name }))
    }
    setRows(all)
    setLoading(false)
  }

  function openReview(f) {
    setSelected(f)
    setResolution('')
    setNote('')
  }

  async function handleResolve() {
    if (!selected || !resolution) return
    if (resolution === 'create_documentation') {
      window.location.href = `/documentation?empId=${selected.employeeId}&flagId=${selected.id}&type=${selected.type}`
      return
    }
    if (resolution === 'override' && !note.trim()) return

    setSaving(true)
    try {
      if (resolution === 'documentation_only') {
        const docId = `DOC-${Date.now()}`
        await createDocument(selected.employeeId, {
          docId,
          docType: 'documentation_only',
          date: new Date().toLocaleDateString('en-US'),
          notes: note || `Attendance flag: ${selected.detail}`,
          signatureStatus: 'pending',
          countsTowardDiscipline: false,
          employeeName: selected.employeeName,
          relatedFlagId: selected.id,
          relatedFlagType: selected.type,
        })
        const pdf = generateCoachingNote(
          { name: selected.employeeName },
          'Attendance documentation (record only)',
          note || selected.detail,
          docId
        )
        pdf.save(`${docId}.pdf`)
        await updateFlagStatus(selected.employeeId, selected.id, 'documented', note)

      } else if (resolution === 'excuse') {
        await updateFlagStatus(selected.employeeId, selected.id, 'excused', note)

      } else if (resolution === 'override') {
        await updateFlagStatus(selected.employeeId, selected.id, 'overridden', note)
      }

      setRows(prev => prev.map(r =>
        r.id === selected.id && r.employeeId === selected.employeeId
          ? { ...r, status: resolution === 'override' ? 'overridden' : resolution === 'excuse' ? 'excused' : 'documented' }
          : r
      ))
      setSelected(null)
    } finally {
      setSaving(false)
    }
  }

  function rowKey(f) { return `${f.employeeId}::${f.id}` }

  function toggleRowSelected(f) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const key = rowKey(f)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedIds(prev => {
      const allSelected = filtered.every(f => prev.has(rowKey(f)))
      if (allSelected) return new Set()
      const next = new Set(prev)
      filtered.forEach(f => next.add(rowKey(f)))
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function openBulkModal() {
    setBulkResolution('')
    setBulkNote('')
    setBulkModal(true)
  }

  const selectedFlags = useMemo(
    () => rows.filter(f => selectedIds.has(rowKey(f))),
    [rows, selectedIds]
  )

  // Bulk resolve only supports excuse/override — "create documentation" and
  // "documentation only" need a per-employee form and don't make sense to
  // batch blindly, so those stay single-flag actions via the Review modal.
  async function handleBulkResolve() {
    if (!bulkResolution || selectedFlags.length === 0) return
    if (bulkResolution === 'override' && !bulkNote.trim()) return

    setBulkSaving(true)
    try {
      const newStatus = bulkResolution === 'override' ? 'overridden' : 'excused'
      for (const f of selectedFlags) {
        await updateFlagStatus(f.employeeId, f.id, newStatus, bulkNote)
      }
      const resolvedKeys = new Set(selectedFlags.map(rowKey))
      setRows(prev => prev.map(r => resolvedKeys.has(rowKey(r)) ? { ...r, status: newStatus } : r))
      clearSelection()
      setBulkModal(false)
    } finally {
      setBulkSaving(false)
    }
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Unique employee list for the filter dropdown, derived from loaded flags
  const employeeOptions = useMemo(() => {
    const names = new Map()
    rows.forEach(r => names.set(r.employeeId, r.employeeName))
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows.filter(r => {
      const statusMatch = filter === 'all' || r.status === filter ||
        (filter === 'pending' && (!r.status || r.status === 'pending'))
      const typeMatch = typeFilter === 'all' || r.type === typeFilter
      const empMatch = empFilter === 'all' || r.employeeId === empFilter
      return statusMatch && typeMatch && empMatch
    })

    if (sortKey === 'severity') {
      const sev = { critical: 0, high: 1, medium: 2, review: 3, info: 4 }
      list = [...list].sort((a, b) => (sev[a.severity] ?? 5) - (sev[b.severity] ?? 5))
    } else {
      const resolver = SORT_RESOLVERS[sortKey]
      list = [...list].sort((a, b) => {
        const av = resolver(a), bv = resolver(b)
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [rows, filter, typeFilter, empFilter, sortKey, sortDir])

  const pending = rows.filter(r => !r.status || r.status === 'pending').length
  const docNeeded = rows.filter(r =>
    (!r.status || r.status === 'pending') && ['noshow','tier2','tier1'].includes(r.type)
  ).length

  const statusBadge = s => {
    if (!s || s === 'pending') return 'badge-warn'
    if (s === 'excused') return 'badge-ok'
    if (s === 'documented') return 'badge-info'
    if (s === 'overridden') return 'badge-gray'
    return 'badge-gray'
  }

  const options = selected ? (RESOLVE_OPTIONS[selected.type] || ['documentation_only','override','excuse']) : []

  const SortHeader = ({ label, k }) => (
    <th
      onClick={() => handleSort(k)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      title="Click to sort"
    >
      {label}
      {sortKey === k && (
        <i
          className={`ti ti-arrow-${sortDir === 'asc' ? 'up' : 'down'}`}
          style={{ marginLeft: 4, fontSize: 12 }}
          aria-hidden="true"
        />
      )}
    </th>
  )

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
            <div><strong>{docNeeded} flags</strong> require a documentation decision. Review each one below.</div>
          </div>
        )}

        {/* Filters */}
        <div className="card" style={{marginBottom:16}}>
          <div style={{padding:'10px 16px',display:'flex',gap:8,flexWrap:'wrap',borderBottom:'0.5px solid var(--border)'}}>
            <span style={{fontSize:12,color:'var(--text-sec)',alignSelf:'center',marginRight:4}}>Status:</span>
            {[['pending','Pending'],['documented','Documented'],['excused','Excused'],['overridden','Overridden'],['all','All']].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)} className="btn btn-sm"
                style={filter===v?{background:'var(--amber)',borderColor:'var(--amber)',color:'#fff'}:{}}>
                {l}
              </button>
            ))}
          </div>
          <div style={{padding:'10px 16px',display:'flex',gap:8,flexWrap:'wrap',borderBottom:'0.5px solid var(--border)'}}>
            <span style={{fontSize:12,color:'var(--text-sec)',alignSelf:'center',marginRight:4}}>Type:</span>
            {[['all','All'],['noshow','No-show'],['tier2','10+ min'],['tier1','Tier 1'],['early','Early dep.'],['overage','Overage'],['excessive_absence','Excessive absences']].map(([v,l]) => (
              <button key={v} onClick={() => setTypeFilter(v)} className="btn btn-sm"
                style={typeFilter===v?{background:'var(--blue)',borderColor:'var(--blue)',color:'#fff'}:{}}>
                {l}
              </button>
            ))}
          </div>
          <div style={{padding:'10px 16px',display:'flex',gap:8,alignItems:'center'}}>
            <span style={{fontSize:12,color:'var(--text-sec)'}}>Employee:</span>
            <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{maxWidth:260}}>
              <option value="all">All employees</option>
              {employeeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            {empFilter !== 'all' && (
              <button className="btn btn-sm" onClick={() => setEmpFilter('all')}>
                <i className="ti ti-x" /> Clear
              </button>
            )}
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div style={{
            background: 'var(--amber-lt)', border: '0.5px solid #FAC775', borderRadius: 'var(--radius)',
            padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--amber-txt)' }}>
              {selectedIds.size} flag{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button className="btn btn-sm" onClick={clearSelection}>Clear</button>
              <button className="btn btn-sm btn-primary" onClick={openBulkModal}>
                <i className="ti ti-checklist" /> Resolve selected
              </button>
            </div>
          </div>
        )}

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
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(f => selectedIds.has(rowKey(f)))}
                      onChange={toggleSelectAllVisible}
                      style={{ width: 'auto' }}
                      title="Select all visible"
                    />
                  </th>
                  <SortHeader label="Employee" k="employee" />
                  <SortHeader label="Type" k="type" />
                  <SortHeader label="Date / Window" k="date" />
                  <SortHeader label="Detail" k="detail" />
                  <SortHeader label="Status" k="status" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const s = SEV_STYLE[f.severity] || SEV_STYLE.info
                  const displayDate = f.type === 'tier1' ? f.windowLabel : f.date
                  const isPending = !f.status || f.status === 'pending'
                  const checked = selectedIds.has(rowKey(f))
                  return (
                    <tr key={`${f.employeeId}-${f.id}`} style={checked ? { background: 'var(--amber-lt)' } : undefined}>
                      <td>
                        {isPending && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRowSelected(f)}
                            style={{ width: 'auto' }}
                          />
                        )}
                      </td>
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
                      <td className="mono" style={{fontSize:11}}>{displayDate}</td>
                      <td style={{fontSize:12,color:'var(--text-sec)',maxWidth:220}}>{f.detail}</td>
                      <td>
                        <span className={`badge ${statusBadge(f.status)}`}>
                          {f.status || 'pending'}
                        </span>
                      </td>
                      <td>
                        {isPending && (
                          <button className="btn btn-sm" onClick={() => openReview(f)}>
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
          <div className="modal" style={{width:580}}>
            <div className="modal-header">
              <div>
                <div className="modal-header-title">{selected.employeeName}</div>
                <div style={{fontSize:12,color:'var(--text-sec)'}}>
                  {TYPE_LABELS[selected.type]} · {selected.type === 'tier1' ? selected.windowLabel : selected.date}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setSelected(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:12,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>{selected.detail}</div>
                {selected.lates && (
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>
                    {selected.lates.map((l,i) => (
                      <span key={i} style={{fontSize:11,background:'rgba(0,0,0,.08)',borderRadius:3,padding:'2px 6px'}}>
                        {l.date} · {l.minutes} min
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {selected.type === 'noshow' && (
                <div className="warn-box">
                  <i className="ti ti-info-circle" aria-hidden="true" />
                  <div>Investigate before resolving. Was there an approved absence, emergency, or schedule error?</div>
                </div>
              )}

              {selected.type === 'excessive_absence' && (
                <div className="warn-box">
                  <i className="ti ti-info-circle" aria-hidden="true" />
                  <div>This flag exists to prompt evaluation, regardless of whether prior absences were excused. Review the employee's full absence history before deciding next steps.</div>
                </div>
              )}

              <div style={{fontSize:12,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:10}}>
                How would you like to resolve this flag?
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                {options.map(opt => {
                  const m = OPTION_META[opt]
                  return (
                    <div key={opt}
                      onClick={() => setResolution(opt)}
                      style={{
                        border: `0.5px solid ${resolution===opt ? m.color : 'var(--border)'}`,
                        borderLeft: `3px solid ${resolution===opt ? m.color : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        padding: '10px 14px',
                        cursor: 'pointer',
                        background: resolution===opt ? m.bg : 'var(--surface)',
                        transition: 'all .1s',
                      }}
                    >
                      <div style={{fontSize:13,fontWeight:500,color:resolution===opt?m.color:'var(--text)'}}>{m.label}</div>
                      <div style={{fontSize:12,color:'var(--text-sec)',marginTop:2}}>{m.desc}</div>
                    </div>
                  )
                })}
              </div>

              <div className="form-group">
                <label className="form-label">
                  {resolution === 'override' ? 'Override reason (required)' : 'Notes (optional)'}
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={
                    resolution === 'override'
                      ? 'Explain why this flag is being removed…'
                      : resolution === 'documentation_only'
                      ? 'Notes to include in the documentation record…'
                      : 'Any context or investigation findings…'
                  }
                />
              </div>

              {resolution === 'override' && !note.trim() && (
                <div style={{fontSize:12,color:'var(--red-txt)',marginTop:-8,marginBottom:8}}>
                  A comment is required to override a flag.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setSelected(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleResolve}
                disabled={saving || !resolution || (resolution === 'override' && !note.trim())}
              >
                {saving ? 'Saving…' : resolution === 'create_documentation' ? 'Open documentation form' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk resolve modal */}
      {bulkModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setBulkModal(false)}>
          <div className="modal" style={{width:560}}>
            <div className="modal-header">
              <div>
                <div className="modal-header-title">Resolve {selectedFlags.length} flag{selectedFlags.length!==1?'s':''}</div>
                <div style={{fontSize:12,color:'var(--text-sec)'}}>Applies the same resolution to every selected flag</div>
              </div>
              <button className="btn btn-sm" onClick={() => setBulkModal(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div style={{maxHeight:160,overflowY:'auto',border:'0.5px solid var(--border)',borderRadius:'var(--radius)',marginBottom:16}}>
                <table className="data-table">
                  <thead><tr><th>Employee</th><th>Type</th><th>Date</th></tr></thead>
                  <tbody>
                    {selectedFlags.map(f => (
                      <tr key={rowKey(f)}>
                        <td style={{fontWeight:500}}>{f.employeeName}</td>
                        <td><span className="badge badge-gray">{TYPE_LABELS[f.type]||f.type}</span></td>
                        <td className="mono" style={{fontSize:11}}>{f.type==='tier1'?f.windowLabel:f.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="warn-box">
                <i className="ti ti-info-circle" aria-hidden="true" />
                <div>Bulk actions support <strong>Excuse</strong> and <strong>Override</strong> only. For "Create documentation" or "Documentation only," resolve flags individually since each generates a distinct document.</div>
              </div>

              <div style={{fontSize:12,fontWeight:500,color:'var(--text-sec)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:10}}>
                Resolution for all selected
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                {['excuse','override'].map(opt => {
                  const m = OPTION_META[opt]
                  return (
                    <div key={opt}
                      onClick={() => setBulkResolution(opt)}
                      style={{
                        border: `0.5px solid ${bulkResolution===opt ? m.color : 'var(--border)'}`,
                        borderLeft: `3px solid ${bulkResolution===opt ? m.color : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        padding: '10px 14px',
                        cursor: 'pointer',
                        background: bulkResolution===opt ? m.bg : 'var(--surface)',
                      }}
                    >
                      <div style={{fontSize:13,fontWeight:500,color:bulkResolution===opt?m.color:'var(--text)'}}>{m.label}</div>
                      <div style={{fontSize:12,color:'var(--text-sec)',marginTop:2}}>{m.desc}</div>
                    </div>
                  )
                })}
              </div>

              <div className="form-group">
                <label className="form-label">
                  {bulkResolution === 'override' ? 'Override reason (required, applies to all)' : 'Notes (optional, applies to all)'}
                </label>
                <textarea
                  value={bulkNote}
                  onChange={e => setBulkNote(e.target.value)}
                  placeholder={bulkResolution === 'override' ? 'Explain why these flags are being removed…' : 'Any shared context…'}
                />
              </div>
              {bulkResolution === 'override' && !bulkNote.trim() && (
                <div style={{fontSize:12,color:'var(--red-txt)',marginTop:-8,marginBottom:8}}>
                  A comment is required to override flags.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setBulkModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleBulkResolve}
                disabled={bulkSaving || !bulkResolution || (bulkResolution === 'override' && !bulkNote.trim())}
              >
                {bulkSaving ? 'Saving…' : `Apply to ${selectedFlags.length} flag${selectedFlags.length!==1?'s':''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
