import type { Book } from '../types'

const LIBRARY_DB_NAME = 'audiobook-ui'
const LIBRARY_DB_STORE = 'books'
const LIBRARY_DB_KEY = 'library'

function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(LIBRARY_DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(LIBRARY_DB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readLibraryFromDb() {
  if (!('indexedDB' in window)) return null
  const db = await openLibraryDb()
  return new Promise<Book[] | null>((resolve, reject) => {
    const request = db.transaction(LIBRARY_DB_STORE, 'readonly').objectStore(LIBRARY_DB_STORE).get(LIBRARY_DB_KEY)
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : null)
    request.onerror = () => reject(request.error)
  }).finally(() => db.close())
}

export async function writeLibraryToDb(library: Book[]) {
  if (!('indexedDB' in window)) return
  const db = await openLibraryDb()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(LIBRARY_DB_STORE, 'readwrite').objectStore(LIBRARY_DB_STORE).put(library, LIBRARY_DB_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  }).finally(() => db.close())
}
