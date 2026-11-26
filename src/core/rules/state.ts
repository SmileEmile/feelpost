/** Interface state machine (design docs 01 DQ3 / 03 §6.1). */

export type InterfaceStatus = 'registered' | 'changed' | 'archived'

export const TRANSITIONS: Record<InterfaceStatus, InterfaceStatus[]> = {
  registered: ['changed', 'archived'],
  changed: ['registered', 'archived'],
  archived: ['registered']
}

export function canTransition(from: InterfaceStatus, to: InterfaceStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function confirmChange(status: InterfaceStatus): InterfaceStatus {
  if (status !== 'changed') throw new Error('only a changed interface can be confirmed')
  return 'registered'
}

export function restoreArchived(status: InterfaceStatus): InterfaceStatus {
  if (status !== 'archived') throw new Error('only an archived interface can be restored')
  return 'registered'
}
