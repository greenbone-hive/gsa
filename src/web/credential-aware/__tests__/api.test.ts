/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {afterEach, describe, expect, test, testing} from '@gsa/testing';
import {
  clearCredentialAwareSession,
  credentialAwareApi,
  downloadCombinedReport,
  lookupGroupSummaries,
  lookupManagedTaskIds,
} from 'web/credential-aware/api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  clearCredentialAwareSession();
  globalThis.fetch = originalFetch;
});

describe('scan group session authorization', () => {
  test('uses the GSA session without a second password', async () => {
    const fetchMock = testing.fn(async (_input: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('X-GSA-Token')).toBe('token');
      expect(headers.has('Authorization')).toBe(false);
      return new Response(JSON.stringify({ready: true}), {status: 200});
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(credentialAwareApi('token', 'health')).resolves.toEqual({
      ready: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('reports an expired session on 401', async () => {
    globalThis.fetch = testing.fn(
      async () => new Response('', {status: 401}),
    ) as typeof globalThis.fetch;
    await expect(credentialAwareApi('token', 'health')).rejects.toThrow(
      'Your GSA session has expired',
    );
  });

  test('reports administrator access required on 403', async () => {
    globalThis.fetch = testing.fn(
      async () => new Response('', {status: 403}),
    ) as typeof globalThis.fetch;
    await expect(credentialAwareApi('token', 'groups/summary')).rejects.toThrow(
      'Administrator access required',
    );
    await expect(downloadCombinedReport('token', 'group')).rejects.toThrow(
      'Administrator access required',
    );
  });

  test('discard pending responses after logout', async () => {
    let finishRequest!: (response: Response) => void;
    globalThis.fetch = testing.fn(
      () =>
        new Promise<Response>(resolve => {
          finishRequest = resolve;
        }),
    ) as typeof globalThis.fetch;
    const pending = credentialAwareApi('token', 'health');
    clearCredentialAwareSession();
    finishRequest(new Response(JSON.stringify({ready: true}), {status: 200}));
    await expect(pending).rejects.toThrow('GSA session changed');
  });

  test('checks only submitted IDs and rejects an invalid membership reply', async () => {
    const fetchMock = testing.fn(async (_input: string, init?: RequestInit) => {
      expect(_input).toBe('/credential-api/groups/task-membership');
      expect(init?.body).toBe(
        JSON.stringify({task_ids: ['visible-1', 'visible-2']}),
      );
      return new Response(JSON.stringify({managed_task_ids: ['visible-2']}), {
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    await expect(
      lookupManagedTaskIds('token', ['visible-1', 'visible-2', 'visible-1']),
    ).resolves.toEqual(['visible-2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    globalThis.fetch = testing.fn(
      async () =>
        new Response(JSON.stringify({managed_task_ids: ['hidden-1']}), {
          status: 200,
        }),
    ) as typeof globalThis.fetch;
    await expect(lookupManagedTaskIds('token', ['visible-1'])).rejects.toThrow(
      'Cannot verify managed scan ownership',
    );
  });

  test('loads only visible groups in bounded batches', async () => {
    const ids = Array.from({length: 101}, (_, index) => `task-${index}`);
    const fetchMock = testing.fn(async (_input: string, init?: RequestInit) => {
      expect(_input).toBe('/credential-api/groups/summary');
      const body = JSON.parse(init?.body as string) as {task_ids: string[]};
      expect(body.task_ids.length).toBeLessThanOrEqual(100);
      return new Response(
        JSON.stringify([
          {
            id: body.task_ids[0],
            native_task_id: body.task_ids[0],
            children: [],
          },
        ]),
        {status: 200},
      );
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    expect(await lookupGroupSummaries('token', [])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    const groups = await lookupGroupSummaries('token', ids);
    expect(groups.map(group => group.id)).toEqual(['task-0', 'task-100']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    globalThis.fetch = testing.fn(
      async () =>
        new Response(
          JSON.stringify([
            {id: 'foreign', native_task_id: 'foreign', children: []},
          ]),
          {status: 200},
        ),
    ) as typeof globalThis.fetch;
    await expect(lookupGroupSummaries('token', ['task-1'])).rejects.toThrow(
      'Cannot verify managed scan ownership',
    );
  });

  test('caches administrator-only summary denial for one session', async () => {
    const fetchMock = testing.fn(async () => new Response('', {status: 403}));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    await expect(
      lookupGroupSummaries('user-token', ['task-1']),
    ).rejects.toThrow('Administrator access required');
    await expect(
      lookupGroupSummaries('user-token', ['task-1']),
    ).rejects.toThrow('Administrator access required');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await lookupGroupSummaries('user-token', [])).toEqual([]);
    clearCredentialAwareSession();
    await expect(
      lookupGroupSummaries('user-token', ['task-1']),
    ).rejects.toThrow('Administrator access required');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
