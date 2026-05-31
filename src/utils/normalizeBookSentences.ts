import type { Book, Paragraph } from '../types'

const ORPHAN_CLOSING_MARKS = /^[\p{Pe}"'’”»›]+$/u
const LEADING_CLOSING_MARKS = /^([\p{Pe}"'’”»›]+)\s+(.+)$/u

export function normalizeBookSentences(book: Book): Book {
  let changed = false
  const chapters = book.chapters.map((chapter) => {
    const paragraphs = chapter.paragraphs.map((paragraph) => {
      const normalized = normalizeParagraphSentences(paragraph)
      if (normalized !== paragraph) changed = true
      return normalized
    })
    return paragraphs === chapter.paragraphs ? chapter : { ...chapter, paragraphs }
  })

  return changed ? { ...book, chapters } : book
}

export function normalizeLibrarySentences(books: Book[]) {
  return books.map(normalizeBookSentences)
}

function normalizeParagraphSentences(paragraph: Paragraph): Paragraph {
  let changed = false
  const sentences: Paragraph['sentences'] = []

  for (const sentence of paragraph.sentences) {
    if (ORPHAN_CLOSING_MARKS.test(sentence.text) && sentences.length > 0) {
      const previous = sentences[sentences.length - 1]!
      sentences[sentences.length - 1] = { ...previous, text: `${previous.text}${sentence.text}` }
      changed = true
      continue
    }

    const leadingMarks = sentence.text.match(LEADING_CLOSING_MARKS)
    if (leadingMarks && sentences.length > 0) {
      const previous = sentences[sentences.length - 1]!
      sentences[sentences.length - 1] = { ...previous, text: `${previous.text}${leadingMarks[1]}` }
      sentences.push({ ...sentence, text: leadingMarks[2] })
      changed = true
      continue
    }

    sentences.push(sentence)
  }

  return changed ? { ...paragraph, sentences } : paragraph
}
