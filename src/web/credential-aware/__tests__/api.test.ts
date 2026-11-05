/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {afterEach, describe, expect, test, testing} from '@gsa/testing';
import {
  clearOperatorAuthorization,
  credentialAwareApi,
  downloadCombinedReport,
} from 'web/credential-aware/api';

const originalFetch = globalThis.fetch;
const originalPrompt = window.prompt;

afterEach(() => {
  clearOperatorAuthorization();
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

  test('shares one operator challenge between concurrent requests', async () => {
    const prompt = testing.fn(() => 'operator:secret');
    window.prompt = prompt;
    globalThis.fetch = testing.fn(async (_input: string, init?: RequestInit) =>
      new Headers(init?.headers).has('Authorization')
        ? new Response(JSON.stringify({ready: true}), {status: 200})
        : new Response('', {
            status: 401,
            headers: {'WWW-Authenticate': 'Basic realm="Scan group operator"'},
          }),
    ) as typeof globalThis.fetch;

    await Promise.all([
      credentialAwareApi('token', 'targets'),
      credentialAwareApi('token', 'credentials'),
    ]);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  test('does not carry operator authorization into another GSA session', async () => {
    const prompt = testing
      .fn()
      .mockReturnValueOnce('operator:first')
      .mockReturnValueOnce('operator:second');
    window.prompt = prompt;
    const seen: Array<[string | null, string | null]> = [];
    globalThis.fetch = testing.fn(
      async (_input: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const token = headers.get('X-GSA-Token');
        const authorization = headers.get('Authorization');
        seen.push([token, authorization]);
        return authorization ===
          `Basic ${btoa(`operator:${token === 'first' ? 'first' : 'second'}`)}`
          ? new Response(JSON.stringify({ready: true}), {status: 200})
          : new Response('', {
              status: 401,
              headers: {
                'WWW-Authenticate': 'Basic realm="Scan group operator"',
              },
            });
      },
    ) as typeof globalThis.fetch;

    await credentialAwareApi('first', 'health');
    await credentialAwareApi('second', 'health');
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(seen).toContainEqual(['second', null]);
    expect(seen).not.toContainEqual([
      'second',
      `Basic ${btoa('operator:first')}`,
    ]);
  });

  test('does not prompt during background polling', async () => {
    const prompt = testing.fn();
    window.prompt = prompt;
    globalThis.fetch = testing.fn(
      async () =>
        new Response('', {
          status: 401,
          headers: {'WWW-Authenticate': 'Basic realm="Scan group operator"'},
        }),
    ) as typeof globalThis.fetch;
    for (let i = 0; i < 2; i += 1) {
      await expect(
        credentialAwareApi('token', 'groups/summary', undefined, {
          interactive: false,
        }),
      ).rejects.toThrow('Scan group operator authorization failed');
    }
    expect(prompt).not.toHaveBeenCalled();
  });

  test('CSV downloads also discard credentials from a previous session', async () => {
    window.prompt = testing
      .fn()
      .mockReturnValueOnce('operator:first')
      .mockReturnValueOnce(null);
    const seen: Array<[string | null, string | null]> = [];
    globalThis.fetch = testing.fn(
      async (_input: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen.push([headers.get('X-GSA-Token'), headers.get('Authorization')]);
        return headers.get('X-GSA-Token') === 'first' &&
          headers.get('Authorization') === `Basic ${btoa('operator:first')}`
          ? new Response(JSON.stringify({ready: true}), {status: 200})
          : new Response('', {
              status: 401,
              headers: {
                'WWW-Authenticate': 'Basic realm="Scan group operator"',
              },
            });
      },
    ) as typeof globalThis.fetch;

    await credentialAwareApi('first', 'health');
    await expect(downloadCombinedReport('second', 'group')).rejects.toThrow(
      'Scan group operator authorization is required',
    );
    expect(seen).toContainEqual(['second', null]);
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
    clearOperatorAuthorization();
    finishRequest(new Response(JSON.stringify({ready: true}), {status: 200}));
    await expect(pending).rejects.toThrow('GSA session changed');
  });
});
