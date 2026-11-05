import type { S3ErrorInfo } from '@shared/types'

interface AwsErrorLike {
  name?: string
  message?: string
  Code?: string
  code?: string
  $metadata?: { httpStatusCode?: number }
  $fault?: string
}

/** Actionable hints for the codes users actually hit in the wild. */
const HINTS: Record<string, string> = {
  SignatureDoesNotMatch: 'The secret access key looks wrong for this access key id.',
  InvalidAccessKeyId: 'No account matches that access key id.',
  AccessDenied:
    'The credentials are valid but lack permission for this operation. If this is a Cloudflare R2 token scoped to specific buckets, it cannot list them — name a bucket to connect anyway.',
  ExpiredToken: 'These are temporary credentials that have expired.',
  NoSuchBucket: 'The bucket does not exist or the account cannot see it.',
  NoSuchKey: 'The object no longer exists at that key.',
  PermanentRedirect: 'The bucket lives in a different region than the one configured.',
  AuthorizationHeaderMalformed:
    'The region does not match the bucket. Check the region setting for this profile.',
  InvalidBucketName: 'That bucket name is not valid for this provider.',
  NetworkingError: 'Could not reach the endpoint. Check the URL and your network.',
  ENOTFOUND: 'Host not found. Check the endpoint URL.',
  ECONNREFUSED: 'Connection refused. Check the endpoint URL and that the service is running.',
  ETIMEDOUT: 'The connection timed out.',
  CERT_HAS_EXPIRED: 'The endpoint presents an expired TLS certificate.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'The endpoint uses a self-signed certificate.',
  SlowDown: 'The provider is throttling requests. Try again shortly.',
  RequestTimeout: 'The provider timed out handling the request.'
}

/**
 * Normalize anything thrown by the AWS SDK (or by us) into a shape that is
 * safe to serialize across IPC and readable in the UI.
 */
export function toErrorInfo(error: unknown): S3ErrorInfo {
  const err = (error ?? {}) as AwsErrorLike
  const code =
    err.Code ?? err.code ?? (err.$metadata?.httpStatusCode === 403 ? 'AccessDenied' : undefined) ?? err.name
  const name = err.name || 'Error'
  const rawMessage = err.message || 'Something went wrong.'

  // Strip the noisy AWS request-id trailer, it is not actionable for users.
  const message = rawMessage
    .replace(/\s*RequestId:\s*\S+/gi, '')
    .replace(/\s*HostId:\s*\S+/gi, '')
    .trim()

  let hint = code ? HINTS[code] : undefined
  if (!hint && /certificate|self.signed|SSL/i.test(message)) {
    hint = 'This looks like a TLS problem with the endpoint. For self-hosted services on http, try disabling SSL verification.'
  }

  return {
    name,
    message: message || rawMessage,
    code: typeof code === 'string' ? code : undefined,
    status: err.$metadata?.httpStatusCode,
    hint
  }
}

/**
 * True for the many spellings AWS-compatible services use when a request is
 * refused. Deliberately tolerant: R2, MinIO, B2 and AWS all differ here, and a
 * bucket-scoped token denial is the single most common case we handle.
 */
export function isAccessDeniedError(error: unknown): boolean {
  const err = error as {
    name?: string
    Code?: string
    code?: string
    $metadata?: { httpStatusCode?: number }
  }
  const code = err?.Code ?? err?.code ?? err?.name
  return (
    code === 'AccessDenied' ||
    code === 'Forbidden' ||
    code === 'InvalidAccessKeyId' ||
    err?.$metadata?.httpStatusCode === 403
  )
}

/** Errors must cross IPC as plain data, so wrap them in a tagged Error. */
export class IpcError extends Error {
  constructor(public readonly info: S3ErrorInfo) {
    super(info.message)
    this.name = 'IpcError'
  }
}

export function fail(error: unknown): never {
  if (error instanceof IpcError) throw error
  throw new IpcError(toErrorInfo(error))
}
