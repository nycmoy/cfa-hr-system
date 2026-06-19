import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  addDoc, query, where, orderBy, serverTimestamp, deleteDoc, writeBatch
} from 'firebase/firestore'
import { db } from './firebase'

function stripUndefined(obj) {
  const clean = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) clean[k] = v
  }
  return clean
}

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
    await updateDoc(ref, { ...stripUndefined(data), updatedAt: serverTimestamp() })
  } else {
    await setDoc(ref, stripUndefined({
      name,
      status: 'active',
      disciplineLevel: 'good_standing',
      leadershipStatus: 'good_standing',
      leadershipStatusNote: '',
      initialStartDate: null,
      currentPosition: 'Team Member',
      currentPositionStartDate: null,
      area: 'both',          // 'foh' | 'boh' | 'both'
      leadershipTrack: false, // additive flag — leadership positions apply on top of area
      position: 'Team Member',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...data,
    }))
  }
  return id
}

export async function updateEmployee(id, data) {
  await updateDoc(doc(db, 'employees', id), stripUndefined({
    ...data,
    updatedAt: serverTimestamp(),
  }))
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
  // Respect an explicitly-passed docId; only generate one if missing
  const docId = docData.docId || `DOC-${Date.now()}`
  const ref = doc(db, 'employees', employeeId, 'documents', docId)
  await setDoc(ref, stripUndefined({
    ...docData,
    docId,
    employeeId,
    createdAt: serverTimestamp(),
    status: 'active',
    signatureStatus: docData.signatureStatus || 'pending',
  }))
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

// Aliases — internal storage stays "documents" for backward compatibility,
// but the app's UI and vocabulary refer to these as "Documentation".
export const createDocumentation = createDocument
export const getDocumentation = getDocuments
export const updateDocumentation = updateDocument

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
    { name: 'Front counter', area: 'foh', leadership: false },
    { name: 'Drive-thru cashier', area: 'foh', leadership: false },
    { name: 'Drive-thru window', area: 'foh', leadership: false },
    { name: 'Dining room', area: 'foh', leadership: false },
    { name: 'Fry station', area: 'boh', leadership: false },
    { name: 'Nugget station', area: 'boh', leadership: false },
    { name: 'Sandwich assembly', area: 'boh', leadership: false },
    { name: 'Boh prep', area: 'boh', leadership: false },
    { name: 'Drinks / desserts', area: 'both', leadership: false },
    { name: 'Opening duties', area: 'both', leadership: false },
    { name: 'Closing duties', area: 'both', leadership: false },
    { name: 'Leadership / trainer', area: 'both', leadership: true },
  ]
  const batch = writeBatch(db)
  for (const p of defaults) {
    const id = p.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    batch.set(doc(db, 'positions', id), { ...p, createdAt: serverTimestamp() })
  }
  await batch.commit()
}

export async function addPosition(name, area = 'both', leadership = false) {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_')
  await setDoc(doc(db, 'positions', id), {
    name, area, leadership: !!leadership, createdAt: serverTimestamp(),
  })
  return id
}

export async function updatePosition(id, data) {
  await updateDoc(doc(db, 'positions', id), stripUndefined({
    ...data,
    updatedAt: serverTimestamp(),
  }))
}

export async function deletePosition(id) {
  await deleteDoc(doc(db, 'positions', id))
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
