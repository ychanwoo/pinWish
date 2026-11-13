import { getSession } from './cloud-auth'

export function requireOwner(owner: string | undefined) {
  if (!owner || getSession()?.sub !== owner)
    throw new Error('Your account changed. Please try again.')
}
