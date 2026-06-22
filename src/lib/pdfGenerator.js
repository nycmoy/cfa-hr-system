import jsPDF from 'jspdf'

const STORE_TITLE = 'Chick-fil-A Jacksonville [TX]'
const STORE_SUFFIX = 'Chick-fil-A Jacksonville, TX #04695'

const POLICY_QUOTE = `On Page 20 of the Team Member Policy Handbook, under Punctuality and Attendance, it states, "You will be advised of your work schedules, and it is your responsibility to know your schedule and report ready for work on time ..." (see attached sheet for additional information)`

// Builds the incident statement line the way the real form writes it,
// e.g. "Guillermo was 40 minutes late to his scheduled shift 01/10/26"
// When we have structured incident data (date/scheduled/actual/minutes),
// we compose a precise sentence; otherwise we fall back to free-text notes.
function buildIncidentStatement(emp, incidentDetail, fallbackNotes) {
  const firstName = (emp.name || '').split(',').length > 1
    ? emp.name.split(',')[1].trim().split(' ')[0]
    : (emp.name || '').split(' ')[0]

  if (incidentDetail && incidentDetail.minutesLate && incidentDetail.date) {
    let line = `${firstName} was ${incidentDetail.minutesLate} minutes late to their scheduled shift on ${incidentDetail.date}.`
    if (incidentDetail.scheduledTime || incidentDetail.actualTime) {
      const parts = []
      if (incidentDetail.scheduledTime) parts.push(`Scheduled: ${incidentDetail.scheduledTime}`)
      if (incidentDetail.actualTime) parts.push(`Actual arrival: ${incidentDetail.actualTime}`)
      line += ` (${parts.join(' · ')})`
    }
    return line
  }
  return fallbackNotes || ''
}

function drawCheckbox(pdf, x, y, checked) {
  pdf.rect(x, y - 3.2, 3.5, 3.5)
  if (checked) {
    pdf.setFont('helvetica', 'bold')
    pdf.text('X', x + 0.6, y - 0.3)
    pdf.setFont('helvetica', 'normal')
  }
}

function underline(pdf, x, y, width) {
  pdf.line(x, y, x + width, y)
}

// Wraps text onto an underline, returning the new Y position after the line
function fillOnLine(pdf, text, x, y, width, fontSize = 10) {
  pdf.setFontSize(fontSize)
  pdf.setFont('helvetica', 'normal')
  if (text) pdf.text(String(text), x + 1, y - 1)
  underline(pdf, x, y, width)
  return y
}

/**
 * Generates the disciplinary notice matching the CFA Jacksonville form exactly:
 * - Header with logo-style title
 * - Employee / Operator / Witness lines
 * - Documentation of: Verbal / Written / Termination checkboxes
 * - Statement of issue/occurrence
 * - Relevant Unit policy (Punctuality and Attendance) + handbook quote
 * - Prior warnings Y/N, policy violation Y/N
 * - Corrective action, consequences
 * - Team member statement
 * - Signature lines
 *
 * @param {object} emp - { name }
 * @param {string} warningType - 'verbal' | 'written' | 'termination'
 * @param {object} fields - {
 *   operatorName, witnessNames, incidentDetail: {date, scheduledTime, actualTime, minutesLate},
 *   priorWarnings: 'yes'|'no', priorWarningsDetail,
 *   policyViolation: 'yes'|'no',
 *   correctiveAction, consequences, teamMemberStatement, notes
 * }
 * @param {string} docId
 */
export function generateDisciplinaryNotice(emp, warningType, fields, docId) {
  const pdf = new jsPDF()
  const today = new Date().toLocaleDateString('en-US')

  // Outer border (matches the boxed form look)
  pdf.setLineWidth(0.6)
  pdf.rect(8, 8, 194, 281)
  pdf.setLineWidth(0.2)

  // Header
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bolditalic')
  pdf.setTextColor(220, 30, 30)
  pdf.text('Chick-fil-A', 40, 26)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(16)
  pdf.text('Jacksonville [TX]', 80, 26)

  pdf.setFontSize(15)
  pdf.setFont('helvetica', 'bolditalic')
  pdf.text('DISCIPLINARY NOTICE', 105, 38, { align: 'center' })

  let y = 50

  // Employee name
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Employee name:', 14, y)
  fillOnLine(pdf, emp.name, 50, y, 130)
  y += 10

  // Operator/Supervisor
  pdf.text('Operator/Supervisor name:', 14, y)
  fillOnLine(pdf, fields.operatorName || '', 66, y, 80)
  pdf.setFontSize(9)
  pdf.text(STORE_SUFFIX, 150, y)
  pdf.setFontSize(10)
  y += 10

  // Witness
  pdf.text('Witness name(s) if any:', 14, y)
  pdf.setFont('helvetica', 'italic')
  underline(pdf, 62, y, 130)
  if (fields.witnessNames) pdf.text(fields.witnessNames, 63, y - 1)
  pdf.setFont('helvetica', 'normal')
  y += 11

  // Documentation of: checkboxes
  pdf.text('Documentation of:', 14, y)
  drawCheckbox(pdf, 56, y, warningType === 'verbal')
  pdf.text('Verbal warning', 61, y)
  drawCheckbox(pdf, 96, y, warningType === 'written')
  pdf.text('Written warning', 101, y)
  drawCheckbox(pdf, 142, y, warningType === 'termination')
  pdf.text('Termination', 147, y)
  y += 11

  // Statement of issue/occurrence
  pdf.text('Statement of the issue/occurrence (include date, location and description of incident/issue):', 14, y)
  y += 7
  const statement = buildIncidentStatement(emp, fields.incidentDetail, fields.notes)
  const statementLines = pdf.splitTextToSize(statement, 178)
  pdf.text(statementLines, 14, y)
  underline(pdf, 14, y + 3, 178)
  underline(pdf, 14, y + 11, 178)
  y += 18

  // Relevant unit policy
  pdf.setFont('helvetica', 'normal')
  pdf.text('Relevant Unit policy:', 14, y)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Punctuality and Attendance', 56, y)
  pdf.setFont('helvetica', 'normal')
  y += 9

  // Prior warnings
  const priorYes = fields.priorWarnings === 'yes'
  pdf.text('Has the team member received prior warnings on this subject?', 14, y)
  drawCheckbox(pdf, 142, y, priorYes)
  pdf.text('Yes', 147, y)
  drawCheckbox(pdf, 160, y, !priorYes && fields.priorWarnings === 'no')
  pdf.text('No', 165, y)
  y += 8

  if (priorYes) {
    pdf.text('If yes, how many and what kind?', 14, y)
    fillOnLine(pdf, fields.priorWarningsDetail || '', 78, y, 110)
    y += 9
  } else {
    pdf.text('If yes, how many and what kind?', 14, y)
    underline(pdf, 78, y, 110)
    y += 9
  }

  // Policy violation
  const violationYes = fields.policyViolation !== 'no'
  pdf.text("Was the team member's activity in violation of a written Unit policy?", 14, y)
  drawCheckbox(pdf, 150, y, violationYes)
  pdf.text('Yes', 155, y)
  drawCheckbox(pdf, 170, y, !violationYes)
  pdf.text('No', 175, y)
  y += 8

  pdf.text('If yes, describe how:', 14, y)
  y += 6
  pdf.setFontSize(8.5)
  const quoteLines = pdf.splitTextToSize(POLICY_QUOTE, 178)
  pdf.text(quoteLines, 14, y)
  y += quoteLines.length * 4.2 + 6
  pdf.setFontSize(10)

  // Corrective action
  pdf.text('Describe the corrective action to be taken by the team member:', 14, y)
  y += 6
  const corrLines = pdf.splitTextToSize(fields.correctiveAction || '', 178)
  pdf.setFontSize(9)
  pdf.text(corrLines, 14, y)
  underline(pdf, 14, y + 3, 178)
  underline(pdf, 14, y + 11, 178)
  pdf.setFontSize(10)
  y += 18

  // Consequences
  pdf.text('Consequences of failure to improve performance or correct behavior:', 14, y)
  y += 6
  const consLines = pdf.splitTextToSize(fields.consequences || '', 178)
  pdf.setFontSize(9)
  pdf.text(consLines, 14, y)
  underline(pdf, 14, y + 3, 178)
  underline(pdf, 14, y + 11, 178)
  pdf.setFontSize(10)
  y += 18

  // Team member statement
  pdf.text('Team member statement:', 14, y)
  y += 6
  const tmLines = pdf.splitTextToSize(fields.teamMemberStatement || '', 178)
  pdf.setFontSize(9)
  pdf.text(tmLines, 14, y)
  underline(pdf, 14, y + 3, 178)
  underline(pdf, 14, y + 11, 178)
  underline(pdf, 14, y + 19, 178)
  pdf.setFontSize(10)
  y += 26

  // Acknowledgment text
  pdf.setFontSize(9)
  const ack = 'I have read and understand the information provided in this notice. I also understand that further violations/occurrences could lead to further disciplinary action up to and including termination.'
  const ackLines = pdf.splitTextToSize(ack, 178)
  pdf.text(ackLines, 14, y)
  y += ackLines.length * 4.3 + 8
  pdf.setFontSize(10)

  // Signatures
  pdf.text('Team Member Signature:', 14, y)
  underline(pdf, 60, y, 80)
  pdf.text('Date', 145, y)
  underline(pdf, 155, y, 35)
  y += 11

  pdf.text('Leadership Signature:', 14, y)
  underline(pdf, 60, y, 80)
  pdf.text('Date', 145, y)
  underline(pdf, 155, y, 35)
  y += 14

  if (fields.signatureStatus === 'refused') {
    pdf.setFontSize(9)
    pdf.setTextColor(180, 0, 0)
    pdf.text('** Employee refused to sign — witness signature required above **', 14, y)
    pdf.setTextColor(0, 0, 0)
  }

  // Footer / metadata (small, bottom of page, inside border)
  pdf.setFontSize(7)
  pdf.setTextColor(150)
  pdf.text(`Documentation ID: ${docId} | Generated ${today} | CFA HR System`, 14, 285)
  pdf.setTextColor(0, 0, 0)

  // ── Page 2: Full handbook policy text (matches the attached reference) ──
  pdf.addPage()
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('PG 20 of Team Member Policy Handbook states the following,', 14, 20)
  y = 28
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text('"Punctuality and Attendance', 14, y)
  y += 7
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)

  const handbookText = `You will be advised of your work schedules, and it is your responsibility to know your schedule and report ready for work on time. Generally, the Restaurant's work hours are 5:30 a.m. to 11:00 p.m., Monday through Saturday. Your attendance is expected to be punctual and regular. Team Members are expected to report to work as scheduled, on time and prepared to start work at the beginning of their shifts and at the end of lunch and break periods. Team Members also are expected to remain at work for their entire work schedule, except for meal and rest periods or when required to leave on authorized Restaurant business. Late arrival, early departure or other absences from scheduled hours are disruptive and should be avoided.

Non-exempt Team Members are not permitted to work beyond their normal work schedule without the express approval of a Director or Supervisor on duty.

Absence is defined as any time a Team Member is scheduled to work and does not report for work. This does not include approved time off such as approved PTO for PTO-eligible Team Members, Restaurant holidays, approved leave of absence, or jury duty.

Tardiness is defined as when a Team Member fails to work the workday as scheduled, unless otherwise directed by management. This includes arriving at work after the scheduled start time, returning late from lunch or break periods, not being properly dressed and ready for work, or leaving work before the end of the workday.

Reporting Absenteeism Or Tardiness.
If Team Members know of a required absence from work in advance, they must inform a Supervisor as far in advance as possible, so that the Supervisor can adjust the work schedule accordingly. At minimum, if Team Members are going to absent or tardy, they are expected to call a Supervisor at least two (2) hours before the beginning of their scheduled shift to provide: (1) an explanation for the absence, and (2) a date/time when they will report to work. Failure to provide proper notice may result in disciplinary action. If an absence is to exceed one (1) day, Team Members must provide a Supervisor with an update at the beginning of each day of the absence, until a return-to-work date has been established.

If a Team Member must leave work early because of illness or other unavoidable reasons, they must personally notify a Supervisor on duty and obtain approval before departure.

Excessive absenteeism or tardiness (whether paid or not) and/or failure to properly notify management of an unscheduled departure may result in disciplinary action, up to and including suspension and or discharge of employment. Team Members will not be subject to discipline for legally protected absences.

If a Team Member fails to report for work without any notification to a Director or Supervisor and the Team Member's absence continues for a period of three (3) days, the Restaurant may consider that the Team Member has abandoned employment and voluntarily resigned, subject to legally-protected exceptions."`

  const wrapped = pdf.splitTextToSize(handbookText, 178)
  pdf.text(wrapped, 14, y)

  return pdf
}

// ─── Backward-compatible wrappers used elsewhere in the app ──────────────────
// These map the old call signatures onto the new exact-form generator so
// Documentation.jsx doesn't need to change its call sites.

export function generateVerbalWarning(emp, incidentDetail, notes, docId, extra = {}) {
  return generateDisciplinaryNotice(emp, 'verbal', { incidentDetail, notes, ...extra }, docId)
}

export function generateWrittenWarning(emp, incidentDetail, notes, docId, extra = {}) {
  return generateDisciplinaryNotice(emp, 'written', { incidentDetail, notes, ...extra }, docId)
}

export function generateFinalWarning(emp, incidentDetail, notes, hoursData, docId, extra = {}) {
  const fields = { incidentDetail, notes, ...extra }
  if (hoursData) {
    fields.consequences = fields.consequences ||
      `Hours reduced from ${hoursData.before}/wk to ${hoursData.after}/wk for ${hoursData.duration}. Review date: ${hoursData.reviewDate}. Next step is termination.`
  }
  return generateDisciplinaryNotice(emp, 'written', fields, docId) // final warning still uses the same form, "written" box + consequences text carries the "final" weight
}

export function generateTerminationNotice(emp, notes, docId, extra = {}) {
  return generateDisciplinaryNotice(emp, 'termination', { notes, ...extra }, docId)
}

export function generateCoachingNote(emp, topic, notes, docId) {
  // Coaching notes are informal and don't use the formal disciplinary form —
  // keep a simple plain record for these.
  const pdf = new jsPDF()
  const date = new Date().toLocaleDateString('en-US')
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Chick-fil-A Jacksonville [TX]', 14, 18)
  pdf.setFontSize(12)
  pdf.text('Coaching / Documentation Record', 14, 28)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Employee: ${emp.name}`, 14, 38)
  pdf.text(`Documentation ID: ${docId}`, 14, 44)
  pdf.text(`Date: ${date}`, 14, 50)
  pdf.line(14, 54, 196, 54)

  let y = 64
  pdf.setFont('helvetica', 'italic')
  pdf.text('This documentation does NOT count toward discipline. It is a record only.', 14, y)
  y += 10
  pdf.setFont('helvetica', 'bold')
  pdf.text(`Topic: ${topic}`, 14, y)
  y += 8
  pdf.setFont('helvetica', 'normal')
  const noteLines = pdf.splitTextToSize(notes || '', 182)
  pdf.text(noteLines, 14, y)
  y += noteLines.length * 5 + 14

  pdf.text('Employee signature: _____________________________  Date: ____________', 14, y)
  y += 10
  pdf.text('Manager signature: ______________________________  Date: ____________', 14, y)

  pdf.setFontSize(7)
  pdf.setTextColor(150)
  pdf.text(`Generated ${new Date().toISOString()} | ${docId} | CFA HR System`, 14, 288)

  return pdf
}
