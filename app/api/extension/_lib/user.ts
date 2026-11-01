import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export interface ExtensionUser {
  id: string
  name: string | null
  email: string
  image: string | null
}

/** The account a token belongs to, or null when the user was deleted. */
export async function getExtensionUser(userId: string): Promise<ExtensionUser | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row ?? null
}
