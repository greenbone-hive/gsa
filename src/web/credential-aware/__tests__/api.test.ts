/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {afterEach, describe, expect, test, testing} from '@gsa/testing';
import {
  clearCredentialAwareSession,
  credentialAwareApi,
  downloadCombinedReport,
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
});
