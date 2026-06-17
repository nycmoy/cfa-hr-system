import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  addDoc, query, where, orderBy, serverTimestamp, deleteDoc, writeBatch
} from 'firebase/firestore'
import { db } from './firebase'

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────
export async function getEmployees() {
  const snap = await getDocs(query(collection(db, 'employees'), orderBy('name')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getEmployee(id) {
  const snap = await getDoc(doc(db, 'employees', id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function upsertEmployee(name, data = {}) {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_')
  const ref = doc(db, 'employees', id)
  const existing = await getDoc(ref)
  if (existing.exists()) {
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
  } else {
    await setDoc(ref, {
      name,
      status: 'active',
      disciplineLevel: 'good_standing',
      leadershipStatus: 'good_standing',
      leadershipStatusNote: '',
      hireDate: null,
      position: 'Team Member',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...data,
    })
  }
  return id
}

// ─── ATTENDANCE FLAGS ─────────────────────────────────────────────────────────
export async function saveAttendanceFlags(employeeId, flags) {
  const batch = writeBatch(db)
  for (const flag of flags) {
    const ref = doc(collection(db, 'employees', employeeId, 'attendance'))
    batch.set(ref, {
      ...flag,
      createdAt: serverTimestamp(),
      status: flag.status || 'pending',
    })
  }
  await batch.commit()
}

export async function getAttendanceFlags(employeeId) {
  const snap = await getDocs(
    query(collection(db, 'employees', employeeId, 'attendance'), orderBy('workday', 'desc'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateFlagStatus(employeeId, flagId, status, note = '') {
  await updateDoc(doc(db, 'employees', employeeId, 'attendance', flagId), {
    status,
    statusNote: note,
    resolvedAt: serverTimestamp(),
  })
}

// ─── DOCUMENTATION ────────────────────────────────────────────────────────────
export async function createDocument(employeeId, docData) {
  const docId = `DOC-${Date.now()}`
  const ref = doc(db, 'employees', employeeId, 'documents', docId)
  await setDoc(ref, {
    docId,
    employeeId,
    ...docData,
    createdAt: serverTimestamp(),
    status: 'active',
    signatureStatus: 'pending',
  })
  // Also update discipline level on employee
  if (docData.countsTowardDiscipline) {
    await updateDoc(doc(db, 'employees', employeeId), {
      updatedAt: serverTimestamp(),
    })
  }
  return docId
}

export async function getDocuments(employeeId) {
  const snap = await getDocs(
    query(collection(db, 'employees', employeeId, 'documents'), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateDocument(employeeId, docId, data) {
  await updateDoc(doc(db, 'employees', employeeId, 'documents', docId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

// ─── POSITIONS ────────────────────────────────────────────────────────────────
export async function getPositions() {
  const snap = await getDocs(query(collection(db, 'positions'), orderBy('name')))
  if (snap.empty) {
    await seedDefaultPositions()
    return getPositions()
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

async function seedDefaultPositions() {
  const defaults = [
    'Front counter', 'Drive-thru cashier', 'Drive-thru window',
    'Fry station', 'Nugget station', 'Sandwich assembly',
    'Boh prep', 'Drinks / desserts', 'Dining room',
    'Opening duties', 'Closing duties', 'Leadership / trainer',
  ]
  const batch = writeBatch(db)
  for (const name of defaults) {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    batch.set(doc(db, 'positions', id), { name, createdAt: serverTimestamp() })
  }
  await batch.commit()
}

export async function addPosition(name) {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_')
  await setDoc(doc(db, 'positions', id), { name, createdAt: serverTimestamp() })
  return id
}

// ─── RATINGS ─────────────────────────────────────────────────────────────────
export async function saveRating(employeeId, positionId, rating) {
  const ratingId = `${positionId}_${Date.now()}`
  const ref = doc(db, 'employees', employeeId, 'ratings', ratingId)
  await setDoc(ref, {
    positionId,
    ...rating,
    ratedAt: serverTimestamp(),
    ratedBy: rating.ratedBy || 'Manager',
  })
  return ratingId
}

export async function getRatings(employeeId) {
  const snap = await getDocs(
    query(collection(db, 'employees', employeeId, 'ratings'), orderBy('ratedAt', 'desc'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllRatings() {
  const emps = await getEmployees()
  const all = []
  for (const emp of emps) {
    const ratings = await getRatings(emp.id)
    ratings.forEach(r => all.push({ ...r, employeeId: emp.id, employeeName: emp.name }))
  }
  return all
}

// ─── FOLLOW-UPS ───────────────────────────────────────────────────────────────
export async function createFollowUp(employeeId, data) {
  return addDoc(collection(db, 'employees', employeeId, 'followups'), {
    ...data,
    createdAt: serverTimestamp(),
    status: 'open',
  })
}

export async function getFollowUps(employeeId) {
  const snap = await getDocs(
    query(collection(db, 'employees', employeeId, 'followups'), orderBy('dueDate'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllOpenFollowUps() {
  const emps = await getEmployees()
  const all = []
  for (const emp of emps) {
    const fus = await getFollowUps(emp.id)
    fus.filter(f => f.status === 'open').forEach(f =>
      all.push({ ...f, employeeId: emp.id, employeeName: emp.name })
    )
  }
  return all.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
}

// ─── UPLOAD HISTORY ───────────────────────────────────────────────────────────
export async function recordUpload(meta) {
  return addDoc(collection(db, 'uploads'), {
    ...meta,
    uploadedAt: serverTimestamp(),
  })
}

export async function getUploads() {
  const snap = await getDocs(query(collection(db, 'uploads'), orderBy('uploadedAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
