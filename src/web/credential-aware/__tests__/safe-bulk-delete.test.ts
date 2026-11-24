/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {describe, expect, test, testing} from '@gsa/testing';
import Task from 'gmp/models/task';
import {CredentialAwareApiError} from 'web/credential-aware/api';
import {
  deleteSelectedOrdinaryTasks,
  lookupManagedIdsForDeletion,
  selectedOwnedByCurrentUser,
} from 'web/credential-aware/safe-bulk-delete';

const managedIds = ['logical-1', 'child-1'];

describe('safe bulk task deletion', () => {
  test('only exact tasks owned by the current user qualify after operator denial', () => {
    const own = new Task({id: 'own', owner: {name: 'user'}});
    const shared = new Task({id: 'shared', owner: {name: 'admin'}});
    expect(selectedOwnedByCurrentUser([own], 'user')).toBe(true);
    expect(selectedOwnedByCurrentUser([own, shared], 'user')).toBe(false);
    expect(selectedOwnedByCurrentUser([own], undefined)).toBe(false);
    expect(selectedOwnedByCurrentUser([], 'user')).toBe(false);
  });

  test('operator denial permits only own selected tasks without a membership reply', async () => {
    const denied = async (): Promise<string[]> => {
      throw new CredentialAwareApiError('Administrator access required', 403);
    };
    const own = new Task({id: 'own', owner: {name: 'user'}});
    const shared = new Task({id: 'shared', owner: {name: 'admin'}});
    expect(await lookupManagedIdsForDeletion([own], 'user', denied)).toEqual(
      [],
    );
    await expect(
      lookupManagedIdsForDeletion([own, shared], 'user', denied),
    ).rejects.toMatchObject({status: 403});
  });

  test('rejects a logical task even when its comment has been edited', async () => {
    const deleteTasks = testing.fn();
    const editedTask = new Task({id: 'logical-1', comment: 'renamed'});
    await expect(
      deleteSelectedOrdinaryTasks(
        [editedTask],
        async () => managedIds,
        deleteTasks,
      ),
    ).rejects.toThrow('managed scan');
    expect(deleteTasks).not.toHaveBeenCalled();
  });

  test('rejects a child task by ID even when its comment has been edited', async () => {
    const deleteTasks = testing.fn();
    await expect(
      deleteSelectedOrdinaryTasks(
        [new Task({id: 'child-1', comment: 'renamed'})],
        async () => managedIds,
        deleteTasks,
      ),
    ).rejects.toThrow('managed scan');
    expect(deleteTasks).not.toHaveBeenCalled();
  });

  test('deletes exact ordinary task IDs only after ownership lookup succeeds', async () => {
    const deleteTasks = testing.fn().mockResolvedValue(undefined);
    const loadIds = testing.fn(async () => managedIds);
    const ordinary = new Task({id: 'ordinary-1'});
    await deleteSelectedOrdinaryTasks([ordinary], loadIds, deleteTasks);
    expect(loadIds).toHaveBeenCalledWith(['ordinary-1']);
    expect(deleteTasks).toHaveBeenCalledWith([ordinary]);
  });

  test('fails closed when controller ownership lookup fails', async () => {
    const deleteTasks = testing.fn();
    await expect(
      deleteSelectedOrdinaryTasks(
        [new Task({id: 'ordinary-1'})],
        async () => {
          throw new Error('Controller unavailable');
        },
        deleteTasks,
      ),
    ).rejects.toThrow('Controller unavailable');
    expect(deleteTasks).not.toHaveBeenCalled();
  });

  test('fails closed on a malformed ownership response', async () => {
    const deleteTasks = testing.fn();
    await expect(
      deleteSelectedOrdinaryTasks(
        [new Task({id: 'ordinary-1'})],
        async () => undefined as unknown as string[],
        deleteTasks,
      ),
    ).rejects.toThrow('Cannot verify managed scan ownership');
    expect(deleteTasks).not.toHaveBeenCalled();
  });
});
