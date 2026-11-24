/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type Task from 'gmp/models/task';
import {CredentialAwareApiError} from 'web/credential-aware/api';

/** Controller-created tasks belong to its operator, never another user. */
export function selectedOwnedByCurrentUser(
  selected: Task[],
  username: string | undefined,
): boolean {
  return (
    Boolean(username) &&
    selected.length > 0 &&
    selected.every(task => task.owner?.name === username)
  );
}

export async function lookupManagedIdsForDeletion(
  selected: Task[],
  username: string | undefined,
  loadManagedTaskIds: (candidateIds: string[]) => Promise<string[]>,
): Promise<string[]> {
  try {
    return await loadManagedTaskIds(selected.map(task => task.id));
  } catch (reason) {
    if (
      reason instanceof CredentialAwareApiError &&
      reason.status === 403 &&
      selectedOwnedByCurrentUser(selected, username)
    ) {
      return [];
    }
    throw reason;
  }
}

/** Resolve controller ownership immediately before deleting exact task IDs. */
export async function deleteSelectedOrdinaryTasks(
  selected: Task[],
  loadManagedTaskIds: (candidateIds: string[]) => Promise<string[]>,
  deleteTasks: (tasks: Task[]) => Promise<unknown>,
): Promise<void> {
  const ids = await loadManagedTaskIds(selected.map(task => task.id));
  if (
    !Array.isArray(ids) ||
    !ids.every(id => typeof id === 'string' && id.length > 0)
  ) {
    throw new Error('Cannot verify managed scan ownership. Try again later.');
  }
  const managedIds = new Set(ids);
  if (selected.some(task => managedIds.has(task.id))) {
    throw new Error(
      'The selection contains a managed scan. Delete scan groups from the multi-target controls.',
    );
  }
  await deleteTasks(selected);
}
