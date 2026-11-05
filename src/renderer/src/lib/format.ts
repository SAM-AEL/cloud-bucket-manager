type ClassValue = string | number | false | null | undefined

/** Tiny class-name joiner; avoids pulling in clsx for a handful of call sites. */
export function cn(...parts: ClassValue[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ')
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/**
 * Human-readable byte size. Uses 1024-based units, matching how object
 * storage consoles report sizes.
 */
export function formatBytes(bytes: number, precision?: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  const digits = precision ?? (exponent === 0 ? 0 : value < 10 ? 1 : 0)
  return `${value.toFixed(digits)} ${UNITS[exponent]}`
}

/** Compact form for tight table cells: 1.2 GB, 340 kB. */
export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  if (exponent === 0) return `${bytes} B`
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value < 10 ? 1 : 0)} ${UNITS[exponent]}`
}

export function formatCount(count: number): string {
  return new Intl.NumberFormat().format(count)
}

export function formatDate(timestamp?: number): string {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

export function formatRelative(timestamp?: number): string {
  if (!timestamp) return '—'
  const diff = Date.now() - timestamp
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 1000],
    ['minute', 60_000],
    ['hour', 3_600_000],
    ['day', 86_400_000],
    ['month', 2_592_000_000],
    ['year', 31_536_000_000]
  ]
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  let chosen: [Intl.RelativeTimeFormatUnit, number] = units[0]
  for (const unit of units) {
    if (Math.abs(diff) >= unit[1]) chosen = unit
  }
  return formatter.format(-Math.round(diff / chosen[1]), chosen[0])
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${rest}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

/** Strip quotes from an ETag and drop the "-<partcount>" multipart suffix. */
export function cleanEtag(etag?: string): string | undefined {
  if (!etag) return undefined
  return etag.replace(/^"|"$/g, '').replace(/-\d+$/, '')
}

/** Last segment of a key, minus the trailing slash used for prefixes. */
export function baseName(key: string): string {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key
  const index = trimmed.lastIndexOf('/')
  return index === -1 ? trimmed : trimmed.slice(index + 1)
}

/** Every folder segment of a key, e.g. "a/b/c.txt" -> ["a", "b"]. */
export function keySegments(key: string): string[] {
  return key.split('/').filter(Boolean)
}

/** Best-effort MIME guess so previews and icons have something to work with. */
export function guessContentType(key: string): string {
  const name = baseName(key).toLowerCase()
  const table: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    pdf: 'application/pdf',
    json: 'application/json',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    xml: 'application/xml',
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar'
  }
  const ext = name.split('.').pop() ?? ''
  return table[ext] ?? 'application/octet-stream'
}

export function isImage(key: string): boolean {
  return guessContentType(key).startsWith('image/')
}

export function isVideo(key: string): boolean {
  return guessContentType(key).startsWith('video/')
}

export function isAudio(key: string): boolean {
  return guessContentType(key).startsWith('audio/')
}

/** Whether the filename looks hidden (dotfile) — used by the show-hidden toggle. */
export function isHidden(key: string): boolean {
  return baseName(key).startsWith('.')
}

/** Guard for text-ish files small enough to preview safely. */
export function isPreviewableText(key: string, size: number): boolean {
  const type = guessContentType(key)
  const textLike =
    type.startsWith('text/') ||
    type === 'application/json' ||
    type === 'application/xml' ||
    type === 'image/svg+xml'
  return textLike && size <= 512 * 1024
}
