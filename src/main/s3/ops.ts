import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
  type ObjectIdentifier
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type {
  Bucket,
  CopyReq,
  CreateBucketReq,
  DeleteReq,
  HeadReq,
  ListObjectsReq,
  ObjectItem,
  ObjectMeta,
  Page,
  PresignReq,
  RenameReq
} from '@shared/types'
import { getClient } from './client'
import { CAPS } from './provider'
import { fail, isAccessDeniedError } from './errors'
import { profileStore } from '../store'

const DEFAULT_PAGE = 500
const MAX_PAGE = 1000

/** Deletion is capped at 1000 keys per request by the S3 DeleteObjects API. */
const MAX_BATCH_DELETE = 1000

function requireProfile(profileId: string) {
  const profile = profileStore.find(profileId)
  if (!profile) fail(new Error('That profile no longer exists.'))
  return profile
}

/**
 * List the buckets visible to these credentials.
 *
 * Cloudflare R2 tokens can be scoped to specific buckets instead of the whole
 * account. Such a token carries the "Bucket Item Read/Write" permission groups,
 * which permit object operations but NOT the account-level ListBuckets call —
 * so it returns AccessDenied even though every object operation would work.
 *
 * When that happens we fall back to probing the buckets named on the profile,
 * which keeps a bucket-scoped token fully usable instead of dead-ending the
 * user with a permissions error they cannot fix without minting a new token.
 */
export async function listBuckets(profileId: string): Promise<Page<Bucket>> {
  const profile = requireProfile(profileId)
  const client = getClient(profileId)

  try {
    const response = await client.send(new ListBucketsCommand({}))
    const items: Bucket[] = (response.Buckets ?? [])
      .map((b) => ({ name: b.Name ?? '', createdAt: b.CreationDate?.getTime() }))
      .sort((a, b) => a.name.localeCompare(b.name))
    // No provider we target paginates ListBuckets; ContinuationToken is ignored.
    return { items: items.filter((b) => b.name), done: true }
  } catch (error) {
    if (!isAccessDeniedError(error)) throw error

    const candidates = knownBucketsFor(profile)
    const reachable: Bucket[] = []
    for (const name of candidates) {
      const ok = await probeBucket(client, name)
      if (ok) reachable.push({ name })
    }

    if (reachable.length === 0) throw error

    return { items: reachable, done: true }
  }
}

/** Bucket names we can probe when account-wide listing is denied. */
export function knownBucketsFor(profile: { defaultBucket?: string }): string[] {
  const name = profile.defaultBucket?.trim()
  return name ? [name] : []
}

/** HeadBucket is the cheapest call that proves access without listing anything. */
async function probeBucket(client: S3Client, bucket: string): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return true
  } catch {
    return false
  }
}



export async function createBucket(req: CreateBucketReq): Promise<Bucket> {
  const profile = requireProfile(req.profileId)
  if (!CAPS[profile.provider].bucketCreation) {
    fail(new Error(`${profile.provider} does not support creating buckets through this API.`))
  }
  const client = getClient(req.profileId)
  // R2 rejects CreateBucketConfiguration, so only send it where it is needed.
  const needsLocation = profile.provider === 'aws'
  await client.send(
    new CreateBucketCommand({
      Bucket: req.bucket,
      ...(needsLocation && req.region
        ? { CreateBucketConfiguration: { LocationConstraint: req.region as never } }
        : {})
    })
  )
  return { name: req.bucket, createdAt: Date.now() }
}

export async function deleteBucket(profileId: string, bucket: string): Promise<void> {
  const client = getClient(profileId)
  await client.send(new DeleteBucketCommand({ Bucket: bucket }))
}
/**
 * List one "page" of a folder. Uses ListObjectsV2 with a delimiter so we get
 * CommonPrefixes (sub-folders) alongside objects at this level.
 */
export async function listObjects(req: ListObjectsReq): Promise<Page<ObjectItem>> {
  const client = getClient(req.profileId)
  const limit = Math.min(Math.max(req.limit ?? DEFAULT_PAGE, 1), MAX_PAGE)

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: req.bucket,
      Prefix: req.prefix,
      Delimiter: '/',
      MaxKeys: limit,
      ContinuationToken: req.cursor
    })
  )

  const prefixes: ObjectItem[] = (response.CommonPrefixes ?? [])
    .map((p) => p.Prefix)
    .filter((p): p is string => Boolean(p))
    .map((p) => ({ key: p, size: 0, isPrefix: true }))

  const objects: ObjectItem[] = (response.Contents ?? [])
    .filter((o) => o.Key && o.Key !== req.prefix)
    .map((o) => ({
      key: o.Key as string,
      size: o.Size ?? 0,
      lastModified: o.LastModified?.getTime(),
      etag: o.ETag,
      storageClass: o.StorageClass
    }))

  return {
    // Folders first, then objects — matching how every file manager behaves.
    items: [...prefixes, ...objects],
    cursor: response.IsTruncated ? response.NextContinuationToken : undefined,
    done: !response.IsTruncated
  }
}

export async function headObject(req: HeadReq): Promise<ObjectMeta | null> {
  const client = getClient(req.profileId)
  try {
    const response = await client.send(new HeadObjectCommand({ Bucket: req.bucket, Key: req.key }))
    return {
      key: req.key,
      size: response.ContentLength ?? 0,
      contentLength: response.ContentLength ?? 0,
      lastModified: response.LastModified?.getTime(),
      etag: response.ETag,
      contentType: response.ContentType,
      cacheControl: response.CacheControl,
      contentDisposition: response.ContentDisposition,
      contentEncoding: response.ContentEncoding,
      storageClass: response.StorageClass,
      metadata: response.Metadata
    }
  } catch (error) {
    const info = (error as { name?: string }).name
    if (info === 'NotFound' || info === 'NoSuchKey') return null
    throw error
  }
}

export async function deleteObjects(req: DeleteReq): Promise<{ deleted: number }> {
  const profile = requireProfile(req.profileId)
  const client = getClient(req.profileId)
  let deleted = 0

  // Fall back to one-by-one when the provider lacks batch delete.
  if (!CAPS[profile.provider].batchDelete) {
    for (const key of req.keys) {
      await client.send(new DeleteObjectCommand({ Bucket: req.bucket, Key: key }))
      deleted++
    }
    return { deleted }
  }

  for (let i = 0; i < req.keys.length; i += MAX_BATCH_DELETE) {
    const chunk = req.keys.slice(i, i + MAX_BATCH_DELETE)
    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: req.bucket,
        Delete: { Objects: chunk.map((Key): ObjectIdentifier => ({ Key })), Quiet: true }
      })
    )
    // S3 reports per-key failures inside a 200 response; surface them.
    const errors = response.Errors ?? []
    if (errors.length) {
      const first = errors[0]
      fail(
        Object.assign(new Error(`${errors.length} could not be deleted: ${first.Key} — ${first.Message}`), {
          name: first.Code ?? 'DeleteFailed'
        })
      )
    }
    deleted += chunk.length
  }
  return { deleted }
}

export async function copyObjects(req: CopyReq): Promise<void> {
  const client = getClient(req.profileId)
  const sameBucket = req.bucket === req.destBucket
  const destPrefix =
    req.destPrefix.endsWith('/') || req.destPrefix === '' ? req.destPrefix : `${req.destPrefix}/`

  for (const key of req.keys) {
    // CopySource must be URL-encoded, but slashes stay literal so the server
    // parses the bucket/key boundary correctly.
    const encodedSource = encodeURI(`${req.bucket}/${key}`).replace(/%2F/g, '/')
    const destKey = `${destPrefix}${key.split('/').pop() ?? key}`
    await client.send(
      new CopyObjectCommand({
        Bucket: req.destBucket,
        Key: destKey,
        CopySource: sameBucket ? `/${encodedSource}` : encodedSource
      })
    )
  }
}

/**
 * Rename is copy-then-delete, which is how S3 models it natively. Copies to
 * the exact target key rather than re-using copyObjects' basename behaviour,
 * so moving an object between folders during a rename works as expected.
 */
export async function renameObject(req: RenameReq): Promise<void> {
  const client = getClient(req.profileId)
  const encodedSource = encodeURI(`${req.bucket}/${req.from}`).replace(/%2F/g, '/')
  await client.send(
    new CopyObjectCommand({
      Bucket: req.bucket,
      Key: req.to,
      CopySource: `/${encodedSource}`
    })
  )
  await deleteObjects({ profileId: req.profileId, bucket: req.bucket, keys: [req.from] })
}

export async function presign(req: PresignReq): Promise<{ url: string; expiresIn: number }> {
  const client = getClient(req.profileId)
  // Clamp to the SigV4 supported range of 60s to 7 days.
  const expiresIn = Math.min(Math.max(req.expiresIn ?? 3600, 60), 604800)
  const command = new GetObjectCommand({
    Bucket: req.bucket,
    Key: req.key,
    ...(req.download
      ? {
          ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
            req.key.split('/').pop() ?? req.key
          )}"`
        }
      : {})
  })
  const url = await getSignedUrl(client, command, { expiresIn })
  return { url, expiresIn }
}

