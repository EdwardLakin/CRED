export const DUPLICATE_RELATIONSHIP_MESSAGE = 'This relationship already exists.'

type MaybePostgresError = { code?: unknown; message?: unknown; details?: unknown }

export function isPostgresUniqueViolation(error: unknown): error is MaybePostgresError {
  return Boolean(error && typeof error === 'object' && (error as MaybePostgresError).code === '23505')
}

export function relationshipMutationErrorMessage(error: unknown, fallback: string) {
  if (isPostgresUniqueViolation(error)) return DUPLICATE_RELATIONSHIP_MESSAGE
  return fallback
}

export function throwFriendlyRelationshipMutationError(error: unknown, fallback: string): never {
  throw new Error(relationshipMutationErrorMessage(error, fallback))
}
