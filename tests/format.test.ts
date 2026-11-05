import { describe, expect, it } from 'vitest'
import {
  baseName,
  cleanEtag,
  formatBytes,
  formatBytesShort,
  formatDuration,
  guessContentType,
  isHidden,
  isImage,
  keySegments
} from '../src/renderer/src/lib/format'
import { parentPrefix, visibleItems } from '../src/renderer/src/store/objects'

describe('byte formatting', () => {
  it('formats 1024-based units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('returns an em dash for invalid input', () => {
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytesShort(0)).toBe('—')
  })
})

describe('duration formatting', () => {
  it('scales units', () => {
    expect(formatDuration(250)).toBe('250 ms')
    expect(formatDuration(1500)).toBe('1.5 s')
    expect(formatDuration(65_000)).toBe('1m 5s')
  })
})

describe('key helpers', () => {
  it('strips directories and trailing slashes', () => {
    expect(baseName('a/b/c.txt')).toBe('c.txt')
    expect(baseName('folder/')).toBe('folder')
    expect(baseName('solo.txt')).toBe('solo.txt')
  })

  it('splits into segments', () => {
    expect(keySegments('a/b/c.txt')).toEqual(['a', 'b', 'c.txt'])
    expect(keySegments('')).toEqual([])
  })

  it('detects dotfiles', () => {
    expect(isHidden('.env')).toBe(true)
    expect(isHidden('dir/.env')).toBe(true)
    expect(isHidden('env')).toBe(false)
  })

  it('normalises multipart etags', () => {
    expect(cleanEtag('"abc123-4"')).toBe('abc123')
    expect(cleanEtag('"abc123"')).toBe('abc123')
    expect(cleanEtag(undefined)).toBeUndefined()
  })
})

describe('content type inference', () => {
  it('maps known extensions', () => {
    expect(guessContentType('a.png')).toBe('image/png')
    expect(guessContentType('dir/b.json')).toBe('application/json')
    expect(guessContentType('c.unknown')).toBe('application/octet-stream')
    expect(isImage('x.WEBP')).toBe(true)
  })
})

describe('parentPrefix', () => {
  it('walks up one level and terminates at the root', () => {
    expect(parentPrefix('a/b/c')).toBe('a/b/')
    expect(parentPrefix('a/')).toBe('')
    expect(parentPrefix('')).toBe('')
  })
})

describe('visibleItems', () => {
  const items = [
    { key: 'z.txt', size: 10, lastModified: 2 },
    { key: 'a.txt', size: 30, lastModified: 1 },
    { key: 'sub/', size: 0, isPrefix: true },
    { key: '.hidden', size: 5 },
    { key: 'm.txt', size: 20, lastModified: 3 }
  ]
  const base = {
    items,
    query: '',
    showHidden: false,
    sortKey: 'name' as const,
    sortDir: 'asc' as const
  }

  it('puts folders first and sorts names naturally', () => {
    const result = visibleItems(base as never)
    expect(result.map((i) => i.key)).toEqual(['sub/', 'a.txt', 'm.txt', 'z.txt'])
  })

  it('hides dotfiles unless enabled', () => {
    expect(visibleItems({ ...base, showHidden: false } as never).some((i) => i.key === '.hidden')).toBe(
      false
    )
    expect(visibleItems({ ...base, showHidden: true } as never).some((i) => i.key === '.hidden')).toBe(
      true
    )
  })

  it('filters by query and sorts by size descending', () => {
    const result = visibleItems({
      ...base,
      query: '.txt',
      sortKey: 'size',
      sortDir: 'desc'
    } as never)
    expect(result.map((i) => i.size)).toEqual([30, 20, 10])
  })
})
