/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {afterEach, describe, expect, test, testing} from '@gsa/testing';
import {credentialAwareApi} from 'web/credential-aware/api';

const originalFetch = globalThis.fetch;
const originalPrompt = window.prompt;

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.prompt = originalPrompt;
});

describe('scan group operator gate', () => {
  test('retries only after an operator challenge', async () => {
    const prompt = testing.fn(() => 'operator:secret');
    window.prompt = prompt;
    const fetchMock = testing.fn(async (_input: string, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('Authorization');
      return authorization === 'Basic b3BlcmF0b3I6c2VjcmV0'
        ? new Response(JSON.stringify({ready: true}), {status: 200})
        : new Response('', {
            status: 401,
            headers: {'WWW-Authenticate': 'Basic realm="Scan group operator"'},
          });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(credentialAwareApi('token', 'health')).resolves.toEqual({
      ready: true,
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('does not ask for operator credentials on GSAD session failure', async () => {
    const prompt = testing.fn();
    window.prompt = prompt;
    globalThis.fetch = testing.fn(
      async () => new Response('', {status: 401}),
    ) as typeof globalThis.fetch;
    await expect(credentialAwareApi('token', 'health')).rejects.toThrow(
      'Your GSA session has expired',
    );
    expect(prompt).not.toHaveBeenCalled();
  });
});
