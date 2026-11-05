import type { ProviderCaps, ProviderId } from '@shared/types'

export interface ProviderPreset {
  id: ProviderId
  label: string
  /** Documentation link shown in the connect dialog. */
  docsUrl: string
  /** Placeholder endpoint; R2 fills in a template from the account id. */
  endpointPlaceholder: string
  regionPlaceholder: string
  defaultRegion: string
  forcePathStyle: boolean
  keyPlaceholder: string
  secretPlaceholder: string
  /** Extra hint rendered under the form. */
  hint: string
  /** R2 needs the account id; generic providers do not. */
  requiresAccountId: boolean
}

export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  'cloudflare-r2': {
    id: 'cloudflare-r2',
    label: 'Cloudflare R2',
    docsUrl: 'https://developers.cloudflare.com/r2/api/s3/tokens/',
    endpointPlaceholder: 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com',
    regionPlaceholder: 'auto',
    defaultRegion: 'auto',
    forcePathStyle: false,
    keyPlaceholder: 'Access Key ID',
    secretPlaceholder: 'Secret Access Key',
    hint: 'Find your Account ID and create an R2 API token in the Cloudflare dashboard. The region is always "auto".',
    requiresAccountId: true
  },
  aws: {
    id: 'aws',
    label: 'Amazon S3',
    docsUrl: 'https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html',
    endpointPlaceholder: 'https://s3.<REGION>.amazonaws.com',
    regionPlaceholder: 'us-east-1',
    defaultRegion: 'us-east-1',
    forcePathStyle: false,
    keyPlaceholder: 'Access Key ID',
    secretPlaceholder: 'Secret Access Key',
    hint: 'Leave the endpoint blank to use the default AWS endpoint for the region.',
    requiresAccountId: false
  },
  minio: {
    id: 'minio',
    label: 'MinIO',
    docsUrl: 'https://min.io/docs/minio/linux/integrations/aws-cli-with-minio.html',
    endpointPlaceholder: 'https://minio.example.com:9000',
    regionPlaceholder: 'us-east-1',
    defaultRegion: 'us-east-1',
    forcePathStyle: true,
    keyPlaceholder: 'Access Key',
    secretPlaceholder: 'Secret Key',
    hint: 'Self-hosted MinIO usually works best with path-style addressing.',
    requiresAccountId: false
  },
  'backblaze-b2': {
    id: 'backblaze-b2',
    label: 'Backblaze B2',
    docsUrl: 'https://www.backblaze.com/docs/cloud-storage.html',
    endpointPlaceholder: 'https://s3.<REGION>.backblazeb2.com',
    regionPlaceholder: 'us-west-004',
    defaultRegion: 'us-west-004',
    forcePathStyle: false,
    keyPlaceholder: 'Application Key ID',
    secretPlaceholder: 'Application Key',
    hint: 'Use the S3-compatible endpoint shown in your B2 bucket details.',
    requiresAccountId: false
  },
  wasabi: {
    id: 'wasabi',
    label: 'Wasabi',
    docsUrl: 'https://wasabi.com/docs/',
    endpointPlaceholder: 'https://s3.<REGION>.wasabisys.com',
    regionPlaceholder: 'us-east-1',
    defaultRegion: 'us-east-1',
    forcePathStyle: false,
    keyPlaceholder: 'Access Key',
    secretPlaceholder: 'Secret Key',
    hint: 'Pick the endpoint that matches your bucket region.',
    requiresAccountId: false
  },
  digitalocean: {
    id: 'digitalocean',
    label: 'DigitalOcean Spaces',
    docsUrl: 'https://docs.digitalocean.com/products/spaces/',
    endpointPlaceholder: 'https://<REGION>.digitaloceanspaces.com',
    regionPlaceholder: 'nyc3',
    defaultRegion: 'nyc3',
    forcePathStyle: false,
    keyPlaceholder: 'Access Key',
    secretPlaceholder: 'Secret Key',
    hint: 'Region is the Spaces location, e.g. nyc3, ams3, sfo3.',
    requiresAccountId: false
  },
  generic: {
    id: 'generic',
    label: 'Other S3-compatible',
    docsUrl: 'https://docs.aws.amazon.com/general/latest/gr/s3.html',
    endpointPlaceholder: 'https://s3.example.com',
    regionPlaceholder: 'us-east-1',
    defaultRegion: 'us-east-1',
    forcePathStyle: true,
    keyPlaceholder: 'Access Key ID',
    secretPlaceholder: 'Secret Access Key',
    hint: 'Works with most S3-compatible providers. Path-style addressing is the safest default.',
    requiresAccountId: false
  }
}

export const CAPS: Record<ProviderId, ProviderCaps> = {
  'cloudflare-r2': {
    objectTagging: false,
    bucketAcl: false,
    objectLock: false,
    lifecycleRules: true,
    presignedUrls: true,
    multipart: true,
    batchDelete: true,
    serverSideEncryption: false,
    bucketCreation: true
  },
  aws: {
    objectTagging: true,
    bucketAcl: true,
    objectLock: true,
    lifecycleRules: true,
    presignedUrls: true,
    multipart: true,
    batchDelete: true,
    serverSideEncryption: true,
    bucketCreation: true
  },
  minio: {
    objectTagging: true,
    bucketAcl: false,
    objectLock: false,
    lifecycleRules: true,
    presignedUrls: true,
    multipart: true,
    batchDelete: true,
    serverSideEncryption: true,
    bucketCreation: true
  },
  'backblaze-b2': {
    objectTagging: false,
    bucketAcl: false,
    objectLock: false,
    lifecycleRules: true,
    presignedUrls: true,
    multipart: true,
    batchDelete: true,
    serverSideEncryption: false,
    bucketCreation: true
  },
  wasabi: {
    objectTagging: false,
    bucketAcl: false,
    objectLock: false,
    lifecycleRules: true,
    presignedUrls: true,
    multipart: true,
    batchDelete: true,
    serverSideEncryption: false,
    bucketCreation: true
  },
  digitalocean: {
    objectTagging: false,
    bucketAcl: false,
    objectLock: false,
    lifecycleRules: false,
    presignedUrls: true,
    multipart: true,
    batchDelete: true,
    serverSideEncryption: false,
    bucketCreation: true
  },
  generic: {
    objectTagging: false,
    bucketAcl: false,
    objectLock: false,
    lifecycleRules: false,
    presignedUrls: true,
    multipart: true,
    batchDelete: true,
    serverSideEncryption: false,
    bucketCreation: true
  }
}

/**
 * Build an endpoint URL from the user's input. Accepts bare hosts
 * ("abc.r2.cloudflarestorage.com") and adds https:// when missing.
 *
 * A URL that already carries a non-http scheme is left untouched so that
 * validateEndpoint can report it as an error, rather than being silently
 * rewritten into a nonsense "https://ftp://host" value.
 */
export function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (trimmed.includes('://')) return trimmed
  return `https://${trimmed}`
}

/** Validate the endpoint before we ever attempt a network call. */
export function validateEndpoint(raw: string): string | null {
  const value = normalizeEndpoint(raw)
  if (!value) return 'Endpoint is required'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'Endpoint is not a valid URL'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'Endpoint must use http or https'
  }
  if (!url.hostname) return 'Endpoint is missing a hostname'
  // Guard against "https://ftp://host" style input that parses but is nonsense.
  if (url.pathname.includes('://')) return 'Endpoint is not a valid URL'
  return null
}

/** AWS bucket names: 3-63 chars, lowercase, no underscores, not IP-shaped. */
export function validateBucketName(name: string): string | null {
  const value = name.trim()
  if (!value) return 'Bucket name is required'
  if (value.length < 3 || value.length > 63) return 'Bucket name must be 3-63 characters'
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value)) {
    return 'Only lowercase letters, numbers, dots and hyphens are allowed'
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return 'Bucket name cannot be an IP address'
  if (value.includes('..')) return 'Bucket name cannot contain consecutive dots'
  return null
}

/** Object keys must be non-empty and must not start with a slash. */
export function validateKey(key: string): string | null {
  if (!key) return 'Key is required'
  if (key.startsWith('/')) return 'Key cannot start with a slash'
  return null
}

/**
 * Normalize a user-supplied sub-path so it can be prepended to an S3 prefix.
 * "assets/images", "/assets/images/" and "assets\\images" all become
 * "assets/images/". An empty result means "bucket root".
 */
export function normalizePrefix(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const cleaned = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!cleaned) return undefined
  // Reject traversal-style input rather than silently normalising it away.
  if (cleaned.split('/').some((segment) => segment === '..')) return undefined
  return `${cleaned}/`
}

