import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import type { ProfileInput, ProfileMeta } from '@shared/types'
import { profileStore } from '../store'
import { secrets } from '../secrets'
import { CAPS, normalizeEndpoint } from './provider'
import { fail } from './errors'

/** Resolved credentials, held only inside the main process. */
interface ResolvedCreds {
  accessKeyId: string
  secretAccessKey: string
}

const MAX_CACHED_CLIENTS = 8

/**
 * Cache S3Clients per profile. Each client owns a connection pool, so
 * rebuilding one on every call would defeat keep-alive and slow down
 * browsing noticeably on high-latency endpoints.
 */
const clientCache = new Map<string, S3Client>()

function evictIfNeeded(): void {
  while (clientCache.size > MAX_CACHED_CLIENTS) {
    const oldest = clientCache.keys().next().value
    if (oldest === undefined) break
    const client = clientCache.get(oldest)
    clientCache.delete(oldest)
    client?.destroy()
  }
}

export function invalidateClient(profileId: string): void {
  const client = clientCache.get(profileId)
  clientCache.delete(profileId)
  client?.destroy()
}

export function invalidateAllClients(): void {
  for (const client of clientCache.values()) client.destroy()
  clientCache.clear()
}

/**
 * Shared client configuration tuned for S3-compatible services rather than
 * AWS specifically:
 *
 * - `requestChecksumCalculation: 'WHEN_REQUIRED'` — SDK versions from 3.729
 *   default to WHEN_SUPPORTED, which appends checksum headers that several
 *   non-AWS providers reject with SignatureDoesNotMatch.
 * - `responseChecksumValidation: 'WHEN_REQUIRED'` — same reasoning inbound.
 * - `streamCollector`/`byteDecoder` left at defaults; `Upload` from
 *   lib-storage handles multipart buffering.
 */
function baseConfig(): S3ClientConfig {
  return {
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 3,
    // Adaptive retry honours Retry-After from throttling providers.
    retryMode: 'adaptive'
  }
}

/** Build a client straight from user input, used by the "test draft" path. */
export function buildDraftClient(input: ProfileInput): S3Client {
  const endpoint = normalizeEndpoint(input.endpoint)
  const config: S3ClientConfig = {
    ...baseConfig(),
    region: input.region.trim() || 'us-east-1',
    credentials: {
      accessKeyId: input.accessKeyId.trim(),
      secretAccessKey: input.secretAccessKey
    },
    forcePathStyle: input.forcePathStyle ?? false
  }
  // An empty endpoint means "use the provider default" (real AWS).
  if (endpoint) config.endpoint = endpoint
  return new S3Client(config)
}

/**
 * Resolve a stored profile plus its decrypted secret into a client.
 * Throws an IpcError with a human-readable message when the profile is gone
 * or its secret is missing.
 */
export function getClient(profileId: string): S3Client {
  const cached = clientCache.get(profileId)
  if (cached) {
    // Refresh LRU position.
    clientCache.delete(profileId)
    clientCache.set(profileId, cached)
    return cached
  }

  const profile = profileStore.find(profileId)
  if (!profile) fail(new Error('That profile no longer exists.'))

  const secret = secrets.get(profileId)
  if (!secret) {
    fail(
      Object.assign(new Error('No credentials stored for this profile.'), {
        name: 'NoCredentials'
      })
    )
  }

  const input: ProfileInput = {
    label: profile.label,
    provider: profile.provider,
    endpoint: profile.endpoint,
    region: profile.region,
    accessKeyId: profile.accessKeyId,
    secretAccessKey: secret as string,
    forcePathStyle: profile.forcePathStyle,
    defaultBucket: profile.defaultBucket
  }

  const client = buildDraftClient(input)
  clientCache.set(profileId, client)
  evictIfNeeded()
  return client
}

/** Public metadata only — strips anything sensitive before it reaches the UI. */
export function toProfileMeta(profile: ProfileMeta): ProfileMeta {
  return {
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    endpoint: profile.endpoint,
    region: profile.region,
    accessKeyId: profile.accessKeyId,
    forcePathStyle: profile.forcePathStyle,
    pathPrefix: profile.pathPrefix,
    defaultBucket: profile.defaultBucket,
    createdAt: profile.createdAt,
    secretPersisted: secrets.isPersistent()
  }
}

export function capsForProfile(profile: ProfileMeta) {
  return CAPS[profile.provider]
}

export type { ResolvedCreds }
