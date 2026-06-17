import { useAuth } from '../hooks/useAuth'
import { Navigate } from 'react-router-dom'

export default function Login() {
  const { user, login } = useAuth()
  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}>
      <div style={{background:'var(--surface)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'40px',width:380,textAlign:'center'}}>
        <div style={{fontSize:22,fontWeight:500,marginBottom:4}}>HR System</div>
        <div style={{fontSize:13,color:'var(--text-sec)',marginBottom:32}}>CFA Jacksonville [TX] FSU</div>
        <button
          className="btn btn-primary"
          style={{width:'100%',justifyContent:'center',padding:'10px 16px',fontSize:14}}
          onClick={login}
        >
          <i className="ti ti-brand-google" aria-hidden="true" />
          Sign in with Google
        </button>
        <p style={{fontSize:12,color:'var(--text-ter)',marginTop:16}}>
          Access restricted to authorized managers only.
        </p>
      </div>
    </div>
  )
}
