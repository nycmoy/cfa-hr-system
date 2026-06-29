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
// Normalizes a date string to MM/DD/YYYY with zero-padding, regardless of
// how it arrived (e.g. "4/16/2026" and "04/16/2026" must be treated as the
// same day). This is a safety net on top of always WRITING dates in the
// canonical padded format — older records created before that fix may still
// have inconsistent padding, and this keeps duplicate detection correct for
// them too without requiring a data migration.
function normalizeDateStr(dateStr) {
  if (!dateStr) return dateStr
  const parts = dateStr.split('/')
  if (parts.length !== 3) return dateStr
  const [m, d, y] = parts
  return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`
}

// Builds a stable identity key for a flag so we can detect duplicates
// across uploads. Two flags are "the same" if they're the same type, on
// the same date (or window, for Tier 1 patterns), for the same employee.
// Exported so the one-time cleanup tool (Settings > Deduplicate flags)
// uses this exact same definition of "duplicate."
export function flagIdentityKey(flag) {
  if (flag.type === 'tier1') {
    return `tier1::${flag.windowLabel}`
  }
  return `${flag.type}::${normalizeDateStr(flag.date)}`
}

export async function saveAttendanceFlags(employeeId, flags) {
  // Pull existing flags once so we can check every incoming flag against
  // what's already on file — prevents re-uploading the same report (or an
  // overlapping date range) from creating duplicate flag records.
  const existing = await getAttendanceFlags(employeeId)
  const existingKeys = new Set(existing.map(flagIdentityKey))

  const batch = writeBatch(db)
  let skipped = 0
  let written = 0

  for (const flag of flags) {
    const key = flagIdentityKey(flag)
    if (existingKeys.has(key)) {
      skipped++
      continue
    }
    existingKeys.add(key) // guard against duplicates within the same upload batch too
    const ref = doc(collection(db, 'employees', employeeId, 'attendance'))
    batch.set(ref, {
      ...flag,
      createdAt: serverTimestamp(),
      status: flag.status || 'pending',
    })
    written++
  }

  if (written > 0) await batch.commit()
  return { written, skipped }
}

export async function getAttendanceFlags(employeeId) {
  const snap = await getDocs(
    query(collection(db, 'employees', employeeId, 'attendance'), orderBy('workday', 'desc'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ─── ONE-TIME CLEANUP: find & remove existing duplicate flags ────────────────
// saveAttendanceFlags() only prevents NEW duplicates going forward. This
// scans everything already in Firestore and groups flags that share the
// same identity key (employee + type + date/window) — the same definition
// used at upload time. Within each duplicate group, the OLDEST flag is kept
// (first created = the original) and the rest are marked for removal.
// Pending status is preferred over resolved when picking which to keep,
// since a resolved flag represents work already done and shouldn't be the
// one silently discarded.
export async function findDuplicateFlags() {
  const employees = await getEmployees()
  const groups = [] // { employeeId, employeeName, key, flags: [...] } where flags.length > 1

  for (const emp of employees) {
    const flags = await getAttendanceFlags(emp.id)
    const byKey = {}
    for (const f of flags) {
      const key = flagIdentityKey(f)
      if (!byKey[key]) byKey[key] = []
      byKey[key].push(f)
    }
    for (const [key, group] of Object.entries(byKey)) {
      if (group.length > 1) {
        // Prefer keeping a flag that's already been resolved (documented/
        // excused/overridden) over a pending one — resolution work shouldn't
        // be silently discarded. Among ties, keep the oldest (first created).
        const sorted = [...group].sort((a, b) => {
          const aResolved = a.status && a.status !== 'pending' ? 1 : 0
          const bResolved = b.status && b.status !== 'pending' ? 1 : 0
          if (aResolved !== bResolved) return bResolved - aResolved // resolved first
          const aTime = a.createdAt?.seconds || 0
          const bTime = b.createdAt?.seconds || 0
          return aTime - bTime // oldest first
        })
        groups.push({
          employeeId: emp.id,
          employeeName: emp.name,
          key,
          keep: sorted[0],
          remove: sorted.slice(1),
        })
      }
    }
  }

  return groups
}

// Deletes a specific list of flag documents. Takes explicit
// {employeeId, id} pairs rather than re-deriving duplicates itself, so the
// caller (UI) controls exactly what gets removed after the person reviews
// the findDuplicateFlags() preview.
export async function deleteFlags(targets) {
  const batch = writeBatch(db)
  for (const t of targets) {
    batch.delete(doc(db, 'employees', t.employeeId, 'attendance', t.id))
  }
  if (targets.length > 0) await batch.commit()
  return { deleted: targets.length }
}

// ─── RE-VERIFY: compare re-parsed PDF flags against what's stored ────────────
// Used by the "Verify upload" tool after a parser fix — re-runs the source
// PDF through the (now corrected) parser and compares the result against
// what's actually sitting in Firestore for each employee, so a manager can
// see exactly which existing flags are correct, wrong, or fabricated before
// deleting anything. Never deletes on its own — returns a report only.
//
// `expectedByEmployee` is { employeeName: [ flag, ... ] } as produced by
// analyzeEmployee().flagsToSave for each employee from the re-parsed file.
export async function verifyFlagsAgainstSource(expectedByEmployee, employeeNameToId) {
  const report = [] // one entry per employee that has either expected or stored flags in scope

  for (const [name, expectedFlags] of Object.entries(expectedByEmployee)) {
    const empId = employeeNameToId[name]
    if (!empId) {
      report.push({ employeeName: name, employeeId: null, notFound: true, matches: [], mismatches: [], missing: expectedFlags, fabricated: [] })
      continue
    }

    const storedFlags = await getAttendanceFlags(empId)
    // Only compare against stored flags whose date falls within the dates
    // covered by this re-uploaded file, so we don't flag unrelated weeks
    // as "fabricated" just because they aren't in this particular PDF.
    const expectedDates = new Set(expectedFlags.map(f => f.date))
    const storedInScope = storedFlags.filter(f => expectedDates.has(f.date))

    // IMPORTANT: group by DATE alone here, not flagIdentityKey() (which
    // includes type). A flag that was wrongly typed by an older, buggy
    // parser — e.g. a real early-departure stored as "tier2" (late) — would
    // produce a different identity key than the correctly-typed flag the
    // fixed parser now computes for that same date. Keying on type would
    // make that bad flag invisible to this comparison (it would match
    // neither "stored" nor "expected" under the same key), exactly the
    // failure mode that let mistyped flags go undetected.
    //
    // A single date can legitimately hold MORE THAN ONE flag (e.g. arrived
    // late AND left early the same day), so each date maps to an array, not
    // a single flag — Tier 1 entries keep their own window-based grouping
    // since several lates share one date by design.
    function groupByDateOrWindow(flags) {
      const map = new Map()
      for (const f of flags) {
        const key = f.type === 'tier1' ? flagIdentityKey(f) : f.date
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(f)
      }
      return map
    }

    const expectedByKey = groupByDateOrWindow(expectedFlags)
    const storedByKey = groupByDateOrWindow(storedInScope)

    const matches = []      // same date, same type & minutes — correct, leave alone
    const mismatches = []   // same date, different type or minutes — wrong, needs fixing
    const missing = []      // expected but not stored at all — should be added
    const fabricated = []   // stored but not expected — shouldn't exist, candidate for deletion

    for (const [key, expectedGroup] of expectedByKey) {
      const storedGroup = storedByKey.get(key) || []
      // Match each expected flag against a stored flag of the SAME type on
      // this date/window — there can be more than one flag per date, and
      // we want a same-type pairing, not just "any flag exists here."
      const usedStoredIds = new Set()
      for (const expected of expectedGroup) {
        const sameTypeStored = storedGroup.find(s => s.type === expected.type && !usedStoredIds.has(s.id))
        if (sameTypeStored) {
          usedStoredIds.add(sameTypeStored.id)
          if (sameTypeStored.minutes !== expected.minutes) {
            mismatches.push({ stored: sameTypeStored, expected })
          } else {
            matches.push(sameTypeStored)
          }
        } else {
          // No stored flag of this exact type on this date — check if
          // there's an UNUSED stored flag of a DIFFERENT type here, which
          // means the old parser mistyped it (the actual bug being fixed).
          const wrongTypeStored = storedGroup.find(s => !usedStoredIds.has(s.id))
          if (wrongTypeStored) {
            usedStoredIds.add(wrongTypeStored.id)
            mismatches.push({ stored: wrongTypeStored, expected })
          } else {
            missing.push(expected)
          }
        }
      }
      // Anything left in storedGroup that wasn't matched or claimed as a
      // mismatch is genuinely fabricated for this date/window.
      for (const s of storedGroup) {
        if (!usedStoredIds.has(s.id)) fabricated.push(s)
      }
    }
    for (const [key, storedGroup] of storedByKey) {
      if (!expectedByKey.has(key)) {
        for (const s of storedGroup) fabricated.push(s)
      }
    }

    if (matches.length || mismatches.length || missing.length || fabricated.length) {
      report.push({ employeeName: name, employeeId: empId, notFound: false, matches, mismatches, missing, fabricated })
    }
  }

  return report
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

// ─── TRAINING (yes/no completion + editable date — distinct from ratings) ────
// One doc per employee per position: { positionId, positionName, completed, completedDate }
export async function setTrainingStatus(employeeId, positionId, positionName, completed, completedDate) {
  const id = positionId
  const ref = doc(db, 'employees', employeeId, 'training', id)
  await setDoc(ref, stripUndefined({
    positionId,
    positionName,
    completed: !!completed,
    completedDate: completed ? (completedDate || new Date().toISOString().split('T')[0]) : null,
    updatedAt: serverTimestamp(),
  }))
}

export async function getTraining(employeeId) {
  const snap = await getDocs(collection(db, 'employees', employeeId, 'training'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllTraining() {
  const emps = await getEmployees()
  const all = []
  for (const emp of emps) {
    const t = await getTraining(emp.id)
    t.forEach(item => all.push({ ...item, employeeId: emp.id, employeeName: emp.name }))
  }
  return all
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
