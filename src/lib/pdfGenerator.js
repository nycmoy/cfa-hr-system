import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const STORE = 'CFA Jacksonville [TX] FSU'
const ADDR = 'Jacksonville, Texas'

function header(pdf, title, empName, docId, date) {
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text(STORE, 14, 18)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.text(ADDR, 14, 24)
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.text(title, 14, 34)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Employee: ${empName}`, 14, 42)
  pdf.text(`Document ID: ${docId}`, 14, 48)
  pdf.text(`Date: ${date}`, 14, 54)
  pdf.line(14, 58, 196, 58)
}

function signatureBlock(pdf, y, empSigned = null) {
  pdf.setFontSize(9)
  pdf.text('Signatures', 14, y)
  y += 6
  pdf.line(14, y + 10, 90, y + 10)
  pdf.text('Employee signature', 14, y + 14)
  pdf.line(100, y + 10, 176, y + 10)
  pdf.text('Manager signature', 100, y + 14)
  y += 20
  pdf.line(14, y + 10, 90, y + 10)
  pdf.text('Date', 14, y + 14)
  if (empSigned === false) {
    pdf.setTextColor(180, 0, 0)
    pdf.text('** Employee refused to sign — witness required **', 14, y + 20)
    pdf.setTextColor(0, 0, 0)
    pdf.line(14, y + 28, 90, y + 28)
    pdf.text('Witness signature', 14, y + 32)
  }
  return y + 40
}

export function generateWrittenWarning(emp, incidents, notes, docId) {
  const pdf = new jsPDF()
  const date = new Date().toLocaleDateString('en-US')
  header(pdf, 'Written Warning', emp.name, docId, date)

  let y = 66
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Policy violation: Attendance', 14, y)
  y += 8

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  const intro = `This written warning is issued to ${emp.name} regarding attendance policy violations documented during the period covered by this report. This document serves as formal notice and will be retained in the employee's file.`
  const introLines = pdf.splitTextToSize(intro, 182)
  pdf.text(introLines, 14, y)
  y += introLines.length * 5 + 6

  autoTable(pdf, {
    startY: y,
    head: [['Date', 'Type', 'Detail']],
    body: incidents.map(i => [i.date, i.type === 'tier2' ? '10+ min late' : i.type === 'tier1' ? 'Tier 1 pattern' : 'No-show', i.detail]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [60, 60, 60] },
  })
  y = pdf.lastAutoTable.finalY + 10

  if (notes) {
    pdf.setFont('helvetica', 'bold')
    pdf.text('Manager notes:', 14, y)
    y += 6
    pdf.setFont('helvetica', 'normal')
    const noteLines = pdf.splitTextToSize(notes, 182)
    pdf.text(noteLines, 14, y)
    y += noteLines.length * 5 + 6
  }

  pdf.setFont('helvetica', 'bold')
  pdf.text('Expectations going forward:', 14, y)
  y += 6
  pdf.setFont('helvetica', 'normal')
  const expectations = 'The employee is expected to arrive on time for all scheduled shifts and complete all scheduled hours unless prior approval has been granted. Further attendance violations may result in additional disciplinary action up to and including termination.'
  const expLines = pdf.splitTextToSize(expectations, 182)
  pdf.text(expLines, 14, y)
  y += expLines.length * 5 + 10

  signatureBlock(pdf, y)

  pdf.setFontSize(7)
  pdf.setTextColor(150)
  pdf.text(`Generated ${new Date().toISOString()} | ${docId} | CFA HR System`, 14, 288)

  return pdf
}

export function generateFinalWarning(emp, incidents, notes, hoursData, docId) {
  const pdf = new jsPDF()
  const date = new Date().toLocaleDateString('en-US')
  header(pdf, 'Final Warning', emp.name, docId, date)

  let y = 66
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(180, 0, 0)
  pdf.text('FINAL WARNING — Continued employment at risk', 14, y)
  pdf.setTextColor(0, 0, 0)
  y += 10

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  const intro = `This Final Warning is issued to ${emp.name}. This is the final step in the progressive discipline process. Any further violations of the attendance policy may result in immediate termination of employment.`
  const introLines = pdf.splitTextToSize(intro, 182)
  pdf.text(introLines, 14, y)
  y += introLines.length * 5 + 6

  autoTable(pdf, {
    startY: y,
    head: [['Date', 'Type', 'Detail']],
    body: incidents.map(i => [i.date, i.type, i.detail]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [160, 0, 0] },
  })
  y = pdf.lastAutoTable.finalY + 10

  if (hoursData) {
    pdf.setFont('helvetica', 'bold')
    pdf.text('Hours reduction:', 14, y)
    y += 6
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Hours before: ${hoursData.before}/wk  →  Hours after: ${hoursData.after}/wk`, 14, y)
    y += 5
    pdf.text(`Duration: ${hoursData.duration}  |  Review date: ${hoursData.reviewDate}`, 14, y)
    y += 10
  }

  if (notes) {
    const noteLines = pdf.splitTextToSize(notes, 182)
    pdf.text(noteLines, 14, y)
    y += noteLines.length * 5 + 6
  }

  signatureBlock(pdf, y)

  pdf.setFontSize(7)
  pdf.setTextColor(150)
  pdf.text(`Generated ${new Date().toISOString()} | ${docId} | CFA HR System`, 14, 288)

  return pdf
}

export function generateCoachingNote(emp, topic, notes, docId) {
  const pdf = new jsPDF()
  const date = new Date().toLocaleDateString('en-US')
  header(pdf, 'Coaching Conversation Record', emp.name, docId, date)

  let y = 66
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'italic')
  pdf.text('This document does NOT count toward discipline. It is a record of a coaching conversation only.', 14, y)
  y += 10

  pdf.setFont('helvetica', 'bold')
  pdf.text(`Topic: ${topic}`, 14, y)
  y += 8

  pdf.setFont('helvetica', 'normal')
  const noteLines = pdf.splitTextToSize(notes, 182)
  pdf.text(noteLines, 14, y)
  y += noteLines.length * 5 + 10

  signatureBlock(pdf, y)

  pdf.setFontSize(7)
  pdf.setTextColor(150)
  pdf.text(`Generated ${new Date().toISOString()} | ${docId} | CFA HR System`, 14, 288)

  return pdf
}
