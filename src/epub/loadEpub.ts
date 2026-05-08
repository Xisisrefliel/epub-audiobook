import JSZip from 'jszip'
import type { Book, Chapter, Paragraph, TocItem } from '../types'
import { splitSentences } from './splitSentences'

const BLOCK_SELECTOR = [
  'p',
  'blockquote',
  'li',
  'dd',
  'dt',
  'pre',
].join(',')

export async function loadEpub(file: File): Promise<Book> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const parser = new DOMParser()

  const containerXml = await readZipText(zip, 'META-INF/container.xml')
  const container = parser.parseFromString(containerXml, 'application/xml')
  assertNoParserError(container, 'container.xml')

  const opfPath = container
    .querySelector('rootfile[media-type="application/oebps-package+xml"], rootfile')
    ?.getAttribute('full-path')

  if (!opfPath) throw new Error('This EPUB is missing its package document.')

  const opfXml = await readZipText(zip, opfPath)
  const opf = parser.parseFromString(opfXml, 'application/xml')
  assertNoParserError(opf, opfPath)

  const opfDir = dirname(opfPath)
  const metadata = readMetadata(opf)
  const manifest = readManifest(opf)
  const coverUrl = await readCover(zip, opf, opfDir, manifest)
  const spineIds: string[] = []
  for (const item of opf.querySelectorAll('spine itemref')) {
    const id = item.getAttribute('idref')
    if (item.getAttribute('linear') !== 'no' && id) spineIds.push(id)
  }

  const spineHrefToChapterIndex = new Map<string, number>()
  const chapterSources = spineIds.flatMap((id) => {
    const manifestItem = manifest.get(id)
    if (!manifestItem || !isDocumentMediaType(manifestItem.mediaType, manifestItem.href)) return []
    const chapterPath = normalizePath(joinPath(opfDir, manifestItem.href))
    return [{ manifestItem, chapterPath }]
  })
  const chapterDocuments = await Promise.all(
    chapterSources.map(async ({ manifestItem, chapterPath }) => ({
      manifestItem,
      chapterPath,
      doc: parseContentDocument(parser, await readZipText(zip, chapterPath)),
    })),
  )
  const chapters: Chapter[] = []

  for (const { manifestItem, chapterPath, doc } of chapterDocuments) {
    const chapter = documentToChapter(doc, chapters.length, manifestItem.href)
    if (chapter.paragraphs.length > 0) {
      spineHrefToChapterIndex.set(normalizeHref(manifestItem.href), chapters.length)
      spineHrefToChapterIndex.set(normalizeHref(chapterPath), chapters.length)
      chapters.push(chapter)
    }
  }

  return {
    id: `epub-${stableId(file.name)}`,
    title: metadata.title || file.name.replace(/\.epub$/i, '') || 'Untitled',
    author: metadata.creator || 'Unknown author',
    chapters,
    toc: await readToc(zip, opfDir, manifest, spineHrefToChapterIndex, chapters),
    coverUrl,
  }
}

function readMetadata(opf: Document) {
  const pick = (name: string) =>
    opf.querySelector(name)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

  return {
    title: pick('metadata title, title'),
    creator: pick('metadata creator, creator'),
  }
}

function readManifest(opf: Document) {
  const manifest = new Map<string, { href: string; mediaType: string; properties?: string }>()
  opf.querySelectorAll('manifest item').forEach((item) => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) return
    manifest.set(id, {
      href,
      mediaType: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? undefined,
    })
  })
  return manifest
}

async function readCover(
  zip: JSZip,
  opf: Document,
  opfDir: string,
  manifest: Map<string, { href: string; mediaType: string; properties?: string }>,
) {
  const coverId = opf.querySelector('metadata meta[name="cover"]')?.getAttribute('content')
  const coverItem =
    (coverId ? manifest.get(coverId) : undefined) ??
    Array.from(manifest.values()).find((item) => item.properties?.split(/\s+/).includes('cover-image')) ??
    Array.from(manifest.values()).find((item) => /^image\//.test(item.mediaType) && /cover/i.test(item.href))

  if (!coverItem || !/^image\//.test(coverItem.mediaType)) return undefined

  try {
    const coverPath = normalizePath(joinPath(opfDir, coverItem.href))
    const data = await zip.file(coverPath)?.async('base64')
    return data ? `data:${coverItem.mediaType};base64,${data}` : undefined
  } catch {
    return undefined
  }
}

async function readToc(
  zip: JSZip,
  opfDir: string,
  manifest: Map<string, { href: string; mediaType: string }>,
  hrefToChapterIndex: Map<string, number>,
  chapters: Chapter[],
): Promise<TocItem[]> {
  const navItem = Array.from(manifest.values()).find(
    (item) => item.mediaType === 'application/xhtml+xml' && /nav/i.test(item.href),
  )
  if (navItem) {
    try {
      const navPath = normalizePath(joinPath(opfDir, navItem.href))
      const navDoc = parseContentDocument(new DOMParser(), await readZipText(zip, navPath))
      const nav = navDoc.querySelector('nav[epub\\:type="toc"], nav[type="toc"], nav')
      const list = nav?.querySelector('ol,ul')
      if (list) {
        const toc = parseHtmlTocList(list, hrefToChapterIndex)
        if (toc.length > 0) return toc
      }
    } catch {
      // Fall through to NCX/generated TOC.
    }
  }

  const ncxItem = Array.from(manifest.values()).find(
    (item) => item.mediaType === 'application/x-dtbncx+xml' || /\.ncx$/i.test(item.href),
  )
  if (ncxItem) {
    try {
      const ncxPath = normalizePath(joinPath(opfDir, ncxItem.href))
      const ncx = new DOMParser().parseFromString(
        await readZipText(zip, ncxPath),
        'application/xml',
      )
      const toc = parseNcxToc(Array.from(ncx.querySelectorAll('navMap > navPoint')), hrefToChapterIndex)
      if (toc.length > 0) return toc
    } catch {
      // Fall through to generated TOC.
    }
  }

  return chapters.map((chapter, index) => ({
    id: `generated-toc-${index}`,
    label: chapter.title,
    chapterIndex: index,
  }))
}

function parseHtmlTocList(list: Element, hrefToChapterIndex: Map<string, number>): TocItem[] {
  const items: TocItem[] = []
  let index = 0
  for (const li of list.children) {
    if (li.tagName.toLowerCase() !== 'li') continue
    const anchor = li.querySelector(':scope > a, :scope > span')
    const href = anchor?.getAttribute('href') ?? ''
    const nested = li.querySelector(':scope > ol, :scope > ul')
    const children = nested ? parseHtmlTocList(nested, hrefToChapterIndex) : []
    const chapterIndex = chapterIndexForHref(href, hrefToChapterIndex) ?? children[0]?.chapterIndex ?? 0
    const label = anchor?.textContent?.replace(/\s+/g, ' ').trim() || `Chapter ${chapterIndex + 1}`
    if (label) {
      items.push({
        id: `toc-html-${chapterIndex}-${index}-${stableId(anchor?.textContent ?? href)}`,
        label,
        chapterIndex,
        children: children.length > 0 ? children : undefined,
      })
    }
    index++
  }
  return items
}

function parseNcxToc(points: Element[], hrefToChapterIndex: Map<string, number>): TocItem[] {
  return points.map((point, index) => {
    const label = point.querySelector(':scope > navLabel text')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const src = point.querySelector(':scope > content')?.getAttribute('src') ?? ''
    const children = parseNcxToc(Array.from(point.querySelectorAll(':scope > navPoint')), hrefToChapterIndex)
    const chapterIndex = chapterIndexForHref(src, hrefToChapterIndex) ?? children[0]?.chapterIndex ?? 0
    return {
      id: `toc-ncx-${chapterIndex}-${index}-${stableId(label || src)}`,
      label: label || `Chapter ${chapterIndex + 1}`,
      chapterIndex,
      children: children.length > 0 ? children : undefined,
    }
  })
}

function chapterIndexForHref(href: string, hrefToChapterIndex: Map<string, number>) {
  const normalized = normalizeHref(href)
  return hrefToChapterIndex.get(normalized) ?? hrefToChapterIndex.get(normalizePath(normalized))
}

function normalizeHref(href: string) {
  return decodeURIComponent(href.split('#')[0]).replace(/^\.\//, '')
}

function documentToChapter(doc: Document, chapterIndex: number, fallbackTitle: string): Chapter {
  const body = doc.querySelector('body')
  const title =
    body?.querySelector('h1,h2,h3')?.textContent?.replace(/\s+/g, ' ').trim() ||
    doc.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() ||
    fallbackTitle ||
    `Chapter ${chapterIndex + 1}`

  const blocks = Array.from(body?.querySelectorAll(BLOCK_SELECTOR) ?? [])
  const paragraphs: Paragraph[] = []

  blocks.forEach((el, paragraphIndex) => {
    if (isInsideAnotherBlock(el)) return
    const text = normalizeExtractedText(el.textContent ?? '')
    if (!text) return

    const sentences = splitSentences(text).map((sentence, sentenceIndex) => ({
      id: `c${chapterIndex}-p${paragraphIndex}-s${sentenceIndex}`,
      text: sentence,
    }))

    if (sentences.length > 0) {
      paragraphs.push({ id: `c${chapterIndex}-p${paragraphIndex}`, sentences })
    }
  })

  if (paragraphs.length === 0) {
    const text = normalizeExtractedText(body?.textContent ?? '')
    const sentences = splitSentences(text).map((sentence, sentenceIndex) => ({
      id: `c${chapterIndex}-p0-s${sentenceIndex}`,
      text: sentence,
    }))
    if (sentences.length > 0) paragraphs.push({ id: `c${chapterIndex}-p0`, sentences })
  }

  return { id: `c${chapterIndex}`, title, paragraphs }
}

async function readZipText(zip: JSZip, path: string) {
  const file = zip.file(path)
  if (!file) throw new Error(`Missing EPUB file: ${path}`)
  return file.async('text')
}

function parseContentDocument(parser: DOMParser, html: string) {
  const doc = parser.parseFromString(html, 'application/xhtml+xml')
  return hasParserError(doc) ? parser.parseFromString(html, 'text/html') : doc
}

function assertNoParserError(doc: Document, label: string) {
  const error = getParserError(doc)
  if (error) throw new Error(`Could not parse ${label}: ${error.textContent ?? ''}`)
}

function hasParserError(doc: Document) {
  return Boolean(getParserError(doc))
}

function getParserError(doc: Document) {
  return doc.querySelector('parsererror')
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([!?])(?=[\p{L}\p{N}])/gu, '$1 ')
    .replace(/(?<![\d.])\.(?=(?!\.)[\p{Lu}\p{N}])/gu, '. ')
    .trim()
}

function isDocumentMediaType(mediaType: string, href: string) {
  return (
    mediaType === 'application/xhtml+xml' ||
    mediaType === 'text/html' ||
    /\.(xhtml|html|htm)$/i.test(href)
  )
}

function isInsideAnotherBlock(el: Element) {
  return Boolean(el.parentElement?.closest(BLOCK_SELECTOR))
}

function dirname(path: string) {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index + 1)
}

function joinPath(base: string, path: string) {
  return path.startsWith('/') ? path.slice(1) : `${base}${path}`
}

function normalizePath(path: string) {
  const parts: string[] = []
  path.split('/').forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') parts.pop()
    else parts.push(part)
  })
  return parts.join('/')
}

function stableId(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
