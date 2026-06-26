import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * Extracts all text from a PDF File object, concatenating every page's
 * text content with newlines between text items — close enough to how
 * pdfplumber lays things out for our line-based parser to work the same
 * way it does on Python-extracted text.
 */
export async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    // Group text items by their vertical position (y) to reconstruct lines,
    // since pdf.js gives individual text fragments with x/y coordinates
    // rather than pre-joined lines the way pdfplumber's extract_text() does.
    const lineMap = new Map()
    for (const item of content.items) {
      const y = Math.round(item.transform[5])
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y).push(item)
    }

    // Sort lines top-to-bottom (PDF y-coordinates increase upward, so descending y = reading order)
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a)
    for (const y of sortedY) {
      const items = lineMap.get(y).sort((a, b) => a.transform[4] - b.transform[4])
      const lineText = items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim()
      if (lineText) fullText += lineText + '\n'
    }
  }

  return fullText
}
