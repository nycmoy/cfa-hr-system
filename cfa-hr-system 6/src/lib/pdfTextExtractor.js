import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * Extracts all text from a PDF File object as flattened lines (legacy path,
 * still used where exact column position doesn't matter).
 */
export async function extractPdfText(file) {
  const pages = await extractPdfWords(file)
  let fullText = ''
  for (const page of pages) {
    const rows = groupWordsIntoRows(page)
    for (const row of rows) {
      const lineText = row.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim()
      if (lineText) fullText += lineText + '\n'
    }
  }
  return fullText
}

/**
 * Extracts every word from every page of a PDF with its x/y position
 * preserved (in PDF point coordinates, NOT normalized). Returns an array
 * of pages, each an array of { text, x0, x1, top } word objects, where
 * `top` increases downward (already flipped from PDF's bottom-up y-axis
 * to match the natural reading-order convention used by the column-based
 * attendance report parser).
 */
export async function extractPdfWords(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pages = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()

    const words = []
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue
      // item.transform = [scaleX, skewX, skewY, scaleY, x, y] in PDF space
      // (origin bottom-left, y increases upward). Flip y to a top-down
      // "top" coordinate to match the reading-order convention used
      // throughout the column-based parser (and matches pdfplumber's
      // convention, which the parsing rules were validated against).
      const x0 = item.transform[4]
      const yBottomUp = item.transform[5]
      const top = viewport.height - yBottomUp
      const width = item.width ?? (item.str.length * (item.transform[0] || 6))
      words.push({ text: item.str.trim(), x0, x1: x0 + width, top })
    }
    pages.push(words)
  }
  return pages
}

/**
 * Groups a flat list of positioned words into physical rows by clustering
 * on their `top` coordinate (tolerant of small float jitter), sorted left
 * to right within each row — mirroring pdfplumber's extract_words() +
 * manual row-grouping approach used to validate the parsing rules.
 */
function groupWordsIntoRows(words, tolerance = 3) {
  const buckets = new Map()
  for (const w of words) {
    const key = Math.round(w.top / tolerance) * tolerance
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(w)
  }
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b)
  return sortedKeys.map(k => buckets.get(k).sort((a, b) => a.x0 - b.x0))
}

export { groupWordsIntoRows }

