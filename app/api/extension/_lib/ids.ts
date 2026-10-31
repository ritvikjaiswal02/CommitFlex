const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Route ids are UUIDs; anything else can never exist, so callers answer 404 without a query. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}
