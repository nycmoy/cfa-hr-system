import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import EmployeeDetail from './pages/EmployeeDetail'
import Upload from './pages/Upload'
import VerifyUpload from './pages/VerifyUpload'
import Flags from './pages/Flags'
import Documentation from './pages/Documentation'
import Training from './pages/Training'
import Positions from './pages/Positions'
import Ratings from './pages/Ratings'
import FollowUps from './pages/FollowUps'
import './index.css'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (user === undefined) return <div style={{padding:40,textAlign:'center'}}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="employees" element={<Employees />} />
            <Route path="employees/:id" element={<EmployeeDetail />} />
            <Route path="upload" element={<Upload />} />
            <Route path="verify-upload" element={<VerifyUpload />} />
            <Route path="flags" element={<Flags />} />
            <Route path="documentation" element={<Documentation />} />
            <Route path="training" element={<Training />} />
            <Route path="positions" element={<Positions />} />
            <Route path="ratings" element={<Ratings />} />
            <Route path="followups" element={<FollowUps />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
