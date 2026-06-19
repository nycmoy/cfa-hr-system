import { useEffect, useState } from 'react'
import { getPositions, addPosition, updatePosition, deletePosition } from '../lib/db'

const AREA_LABEL = { foh: 'FOH', boh: 'BOH', both: 'FOH + BOH' }
const AREA_BADGE = { foh: 'badge-info', boh: 'badge-warn', both: 'badge-gray' }

export default function Positions() {
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // position being edited, or 'new'
  const [name, setName] = useState('')
  const [area, setArea] = useState('both')
  const [leadership, setLeadership] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const p = await getPositions()
    setPositions(p)
    setLoading(false)
  }

  function openNew() {
    setEditing('new')
    setName('')
    setArea('both')
    setLeadership(false)
  }

  function openEdit(pos) {
    setEditing(pos.id)
    setName(pos.name)
    setArea(pos.area || 'both')
    setLeadership(!!pos.leadership)
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (editing === 'new') {
        await addPosition(name.trim(), area, leadership)
      } else {
        await updatePosition(editing, { name: name.trim(), area, leadership })
      }
      await load()
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(pos) {
    await deletePosition(pos.id)
    await load()
    setConfirmDelete(null)
  }

  const foh = positions.filter(p => !p.leadership && (p.area === 'foh' || p.area === 'both'))
  const boh = positions.filter(p => !p.leadership && (p.area === 'boh' || p.area === 'both'))
  const leaders = positions.filter(p => p.leadership)

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-sec)'}}>Loading...</div>

  const Row = ({ pos }) => (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'0.5px solid var(--border)'}}>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:500}}>{pos.name}</div>
      </div>
      <span className={`badge ${AREA_BADGE[pos.area]||'badge-gray'}`}>{AREA_LABEL[pos.area]||pos.area}</span>
      {pos.leadership && <span className="badge badge-warn">Leadership</span>}
      <button className="btn btn-sm" onClick={() => openEdit(pos)}><i className="ti ti-pencil" /></button>
      <button className="btn btn-sm" style={{color:'var(--red-txt)'}} onClick={() => setConfirmDelete(pos)}><i className="ti ti-trash" /></button>
    </div>
  )

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Positions</span>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="ti ti-plus" aria-hidden="true" /> Add position
        </button>
      </div>
      <div className="content">
        <div className="info-box">
          <i className="ti ti-info-circle" aria-hidden="true" />
          <div>Positions are grouped by area — Front of House (FOH), Back of House (BOH), or both. Mark a position as <strong>Leadership</strong> to keep it separate from standard area assignments; it applies additively to employees on the leadership track.</div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="card" style={{padding:0}}>
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
              <span className="card-title" style={{marginBottom:0}}><i className="ti ti-toolsKitchen2" aria-hidden="true" /> Front of House ({foh.length})</span>
            </div>
            {foh.length === 0
              ? <div className="empty-state" style={{padding:24}}><i className="ti ti-list" /><div>No FOH positions yet.</div></div>
              : foh.map(p => <Row key={p.id} pos={p} />)}
          </div>

          <div className="card" style={{padding:0}}>
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
              <span className="card-title" style={{marginBottom:0}}><i className="ti ti-flame" aria-hidden="true" /> Back of House ({boh.length})</span>
            </div>
            {boh.length === 0
              ? <div className="empty-state" style={{padding:24}}><i className="ti ti-list" /><div>No BOH positions yet.</div></div>
              : boh.map(p => <Row key={p.id} pos={p} />)}
          </div>
        </div>

        <div className="card" style={{padding:0,marginTop:16}}>
          <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)'}}>
            <span className="card-title" style={{marginBottom:0}}><i className="ti ti-crown" aria-hidden="true" /> Leadership positions ({leaders.length})</span>
          </div>
          {leaders.length === 0
            ? <div className="empty-state" style={{padding:24}}><i className="ti ti-list" /><div>No leadership positions yet.</div></div>
            : leaders.map(p => <Row key={p.id} pos={p} />)}
        </div>
      </div>

      {/* Add/Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setEditing(null)}>
          <div className="modal" style={{width:420}}>
            <div className="modal-header">
              <div className="modal-header-title">{editing === 'new' ? 'Add position' : 'Edit position'}</div>
              <button className="btn btn-sm" onClick={() => setEditing(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Position name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Drive-thru cashier" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Area</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[['foh','FOH'],['boh','BOH'],['both','Both']].map(([v,l]) => (
                    <div key={v} onClick={() => setArea(v)} style={{
                      border:`0.5px solid ${area===v?'var(--amber)':'var(--border)'}`,
                      borderRadius:'var(--radius)',padding:'8px',textAlign:'center',cursor:'pointer',
                      background:area===v?'var(--amber-lt)':'transparent',fontSize:13,fontWeight:500,
                    }}>{l}</div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                  <input type="checkbox" checked={leadership} onChange={e => setLeadership(e.target.checked)} style={{width:'auto'}} />
                  <span style={{fontSize:13}}>This is a leadership position</span>
                </label>
                <div style={{fontSize:11,color:'var(--text-ter)',marginTop:4}}>Leadership positions are additive — only employees marked "leadership track" need ratings/training for these.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
                <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{width:380}}>
            <div className="modal-header">
              <div className="modal-header-title">Delete position?</div>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body">
              <div className="danger-box">
                <i className="ti ti-alert-triangle" aria-hidden="true" />
                <div>Deleting <strong>{confirmDelete.name}</strong> does not remove existing ratings or training records tied to it, but it will no longer appear for new ratings.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>
                <i className="ti ti-trash" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
