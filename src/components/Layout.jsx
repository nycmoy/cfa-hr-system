import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-name">HR System</div>
          <div className="sidebar-logo-sub">CFA Jacksonville TX</div>
        </div>

        <div className="nav-section">Overview</div>
        <NavLink to="/dashboard" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-layout-dashboard" aria-hidden="true" /> Dashboard
        </NavLink>
        <NavLink to="/employees" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-users" aria-hidden="true" /> Employees
        </NavLink>

        <div className="nav-section">Attendance</div>
        <NavLink to="/upload" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-upload" aria-hidden="true" /> Upload report
        </NavLink>
        <NavLink to="/verify-upload" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-file-search" aria-hidden="true" /> Verify upload
        </NavLink>
        <NavLink to="/flags" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-alert-circle" aria-hidden="true" /> Flags
        </NavLink>

        <div className="nav-section">Discipline</div>
        <NavLink to="/documentation" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-file-text" aria-hidden="true" /> Documentation
        </NavLink>
        <NavLink to="/followups" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-calendar-check" aria-hidden="true" /> Follow-ups
        </NavLink>

        <div className="nav-section">Team</div>
        <NavLink to="/training" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-school" aria-hidden="true" /> Position training
        </NavLink>
        <NavLink to="/positions" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-list-details" aria-hidden="true" /> Manage positions
        </NavLink>
        <NavLink to="/ratings" className={({isActive})=>`nav-item${isActive?' active':''}`}>
          <i className="ti ti-star" aria-hidden="true" /> Ratings
        </NavLink>

        <div style={{marginTop:'auto',padding:'12px 16px',borderTop:'0.5px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--text-sec)',marginBottom:6}}>{user?.email}</div>
          <button className="btn btn-sm" onClick={logout} style={{width:'100%',justifyContent:'center'}}>
            <i className="ti ti-logout" aria-hidden="true" /> Sign out
          </button>
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
