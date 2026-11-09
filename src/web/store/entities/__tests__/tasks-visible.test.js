/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {describe, expect, test, testing} from '@gsa/testing';
import CollectionCounts from 'gmp/collection/collection-counts';
import QueryFilter from 'gmp/models/filter/query-filter';
import {
  loadVisibleEntities,
  reducer,
  visibleTaskFilter,
} from 'web/store/entities/tasks';

describe('visible task loading', () => {
  test('excludes children from every OR clause', () => {
    expect(
      visibleTaskFilter(
        QueryFilter.fromString('name~aaa or name~foo first=1 rows=10'),
      ),
    ).toBe(
      'name~aaa and not comment~"Credential review group " or ' +
        'name~foo and not comment~"Credential review group " first=1 rows=10',
    );
  });

  test('filters child scans before pagination and keeps server counts', async () => {
    const counts = new CollectionCounts({
      all: 55,
      filtered: 14,
      first: 1,
      length: 10,
      rows: 10,
    });
    const get = testing.fn().mockResolvedValue({
      data: [{id: 'logical-task'}],
      meta: {filter: QueryFilter.fromString('first=1 rows=10'), counts},
    });
    const gmp = {
      settings: {enableCredentialAwareTasks: true},
      tasks: {get},
    };
    const filter = QueryFilter.fromString('first=1 rows=10');
    const dispatch = testing.fn(action => action);
    const state = {entities: {task: reducer(undefined, {type: 'init'})}};
    await loadVisibleEntities(gmp)(filter)(dispatch, () => state);

    expect(get).toHaveBeenCalledWith({
      filter: 'not comment~"Credential review group " first=1 rows=10',
    });
    const success = dispatch.mock.calls[1][0];
    expect(success.data).toEqual([{id: 'logical-task'}]);
    expect(success.counts.all).toBe(14);
    expect(success.counts.filtered).toBe(14);
    expect(get).toHaveBeenCalledTimes(1);
    expect(success.filter).toBe(filter);
    expect(success.loadedFilter).toBe(filter);
  });

  test('uses the unfiltered visible total in the task heading', async () => {
    const get = testing
      .fn()
      .mockResolvedValueOnce({
        data: [{id: 'logical-task'}],
        meta: {
          filter: QueryFilter.fromString(),
          counts: new CollectionCounts({
            all: 55,
            filtered: 2,
            first: 1,
            length: 1,
            rows: 1,
          }),
        },
      })
      .mockResolvedValueOnce({
        data: [{id: 'logical-task'}],
        meta: {
          filter: QueryFilter.fromString(),
          counts: new CollectionCounts({
            all: 55,
            filtered: 14,
            first: 1,
            length: 1,
            rows: 1,
          }),
        },
      });
    const gmp = {
      settings: {enableCredentialAwareTasks: true},
      tasks: {get},
    };
    const filter = QueryFilter.fromString('name~aaa first=1 rows=1');
    const dispatch = testing.fn(action => action);
    const state = {entities: {task: reducer(undefined, {type: 'init'})}};
    await loadVisibleEntities(gmp)(filter)(dispatch, () => state);

    expect(get).toHaveBeenNthCalledWith(2, {
      filter: 'not comment~"Credential review group " first=1 rows=1',
    });
    const counts = dispatch.mock.calls[1][0].counts;
    expect(counts.filtered).toBe(2);
    expect(counts.all).toBe(14);
  });

  test('keeps server pagination defaults without exposing child criteria', async () => {
    const counts = new CollectionCounts({
      all: 10,
      filtered: 2,
      first: 1,
      length: 2,
      rows: 10,
    });
    const gmp = {
      settings: {enableCredentialAwareTasks: true},
      tasks: {
        get: testing.fn().mockResolvedValue({
          data: [{id: 'visible'}],
          meta: {
            filter: QueryFilter.fromString(
              'name~foo and not comment~"Credential review group " first=1 rows=10',
            ),
            counts,
          },
        }),
      },
    };
    const filter = QueryFilter.fromString('name~foo');
    const dispatch = testing.fn(action => action);
    const state = {entities: {task: reducer(undefined, {type: 'init'})}};
    await loadVisibleEntities(gmp)(filter)(dispatch, () => state);
    const loaded = dispatch.mock.calls[1][0].loadedFilter;
    expect(loaded.toFilterCriteriaString()).toBe('name~foo');
    expect(loaded.get('first')).toBe(1);
    expect(loaded.get('rows')).toBe(10);
    expect(loaded.next().get('first')).toBe(11);
  });
});
