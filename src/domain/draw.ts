import type { DrawAssignment, Exclusion } from '../types.js';

export class DrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawError';
  }
}

function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

/**
 * Generates a valid Secret Santa assignment where:
 * - Every participant gives to and receives from exactly one other participant.
 * - Nobody gives to themselves.
 * - No (giverId -> receiverId) exclusion is violated.
 */
export function generateDraw(
  participantIds: number[],
  exclusions: Pick<Exclusion, 'giverId' | 'receiverId'>[],
  rng: () => number = Math.random,
): DrawAssignment[] {
  const uniqueIds = Array.from(new Set(participantIds));
  if (uniqueIds.length < 2) {
    throw new DrawError('Для жеребьёвки нужно минимум 2 участника.');
  }

  const excludedSet = new Set<string>();
  for (const ex of exclusions) {
    excludedSet.add(`${ex.giverId}:${ex.receiverId}`);
  }

  const allowed = new Map<number, number[]>();
  for (const giverId of uniqueIds) {
    const candidates = uniqueIds.filter(
      (receiverId) =>
        receiverId !== giverId && !excludedSet.has(`${giverId}:${receiverId}`),
    );
    if (candidates.length === 0) {
      throw new DrawError(
        'Жеребьёвка невозможна: у одного из участников не осталось допустимых получателей из-за исключений.',
      );
    }
    allowed.set(giverId, candidates);
  }

  const unassignedGivers = new Set<number>(uniqueIds);
  const usedReceivers = new Set<number>();
  const assignment = new Map<number, number>();
  let steps = 0;
  const maxSteps = 250_000;

  function backtrack(): boolean {
    if (unassignedGivers.size === 0) {
      return true;
    }
    if (++steps > maxSteps) {
      return false;
    }

    // MRV: choose the unassigned giver with the fewest currently available receivers
    let bestGiver: number | null = null;
    let bestCandidates: number[] = [];

    for (const giverId of unassignedGivers) {
      const avail = (allowed.get(giverId) ?? []).filter(
        (r) => !usedReceivers.has(r),
      );
      if (avail.length === 0) {
        return false;
      }
      if (bestGiver === null || avail.length < bestCandidates.length) {
        bestGiver = giverId;
        bestCandidates = avail;
        if (avail.length === 1) break;
      }
    }

    if (bestGiver === null) {
      return false;
    }

    shuffleInPlace(bestCandidates, rng);

    unassignedGivers.delete(bestGiver);
    for (const receiverId of bestCandidates) {
      usedReceivers.add(receiverId);
      assignment.set(bestGiver, receiverId);

      if (backtrack()) {
        return true;
      }

      assignment.delete(bestGiver);
      usedReceivers.delete(receiverId);
    }
    unassignedGivers.add(bestGiver);

    return false;
  }

  const ok = backtrack();
  if (!ok) {
    throw new DrawError(
      'Не удалось составить пары с текущими исключениями. Попробуй удалить часть ограничений.',
    );
  }

  return uniqueIds.map((giverId) => ({
    giverId,
    receiverId: assignment.get(giverId)!,
  }));
}
