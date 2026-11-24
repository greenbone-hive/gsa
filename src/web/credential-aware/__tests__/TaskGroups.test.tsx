/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {afterEach, describe, expect, test, testing} from '@gsa/testing';
import {fireEvent, rendererWith, screen, waitFor} from 'web/testing';
import {createSession} from 'gmp/testing';
import {
  clearCredentialAwareSession,
  type GroupSummary,
} from 'web/credential-aware/api';
import TaskGroups from 'web/credential-aware/TaskGroups';

const originalFetch = globalThis.fetch;

const group = {
  id: 'group-1',
  name: 'Review scan',
  status: 'Attention needed',
  native_task_id: 'logical-1',
  native_report_id: null,
  native_error: null,
  host_count: 1,
  done_count: 0,
  report_count: 0,
  children: [],
} as GroupSummary;

afterEach(() => {
  clearCredentialAwareSession();
  globalThis.fetch = originalFetch;
});

describe('multi-target scan group recovery controls', () => {
  test('shows backend recovery guidance without forcing a scan', async () => {
    const fetchMock = testing.fn(async (input: string) => {
      if (String(input).endsWith('/groups/summary')) {
        return new Response(JSON.stringify([group]), {status: 200});
      }
      if (String(input).endsWith('/groups/group-1/recover')) {
        return new Response(
          JSON.stringify({
            error:
              'Inspect and delete the ambiguous native child task, then retry recovery.',
          }),
          {status: 409},
        );
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    rendererWith({
      gmp: {session: createSession({token: 'test-token'})},
      router: true,
    }).render(<TaskGroups />);
    fireEvent.click(await screen.findByRole('button', {name: 'Recover scan'}));
    expect(
      await screen.findByText(
        /Inspect and delete the ambiguous native child task/,
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/credential-api/groups/group-1/recover',
      expect.objectContaining({method: 'POST', body: '{}'}),
    );
  });

  test('deletes a group only after confirmation', async () => {
    let deleted = false;
    const fetchMock = testing.fn(async (input: string) => {
      if (String(input).endsWith('/groups/summary')) {
        return new Response(JSON.stringify(deleted ? [] : [group]), {
          status: 200,
        });
      }
      if (String(input).endsWith('/groups/group-1/delete')) {
        deleted = true;
        return new Response(JSON.stringify({deleted: true}), {status: 200});
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    rendererWith({
      gmp: {session: createSession({token: 'test-token'})},
      router: true,
    }).render(<TaskGroups />);
    fireEvent.click(
      await screen.findByRole('button', {name: 'Delete scan group'}),
    );
    expect(deleted).toBe(false);
    fireEvent.click(
      screen.getAllByRole('button', {name: 'Delete scan group'})[1],
    );
    await waitFor(() => expect(deleted).toBe(true));
    expect(
      await screen.findByText('No multi-target scans created yet.'),
    ).toBeInTheDocument();
  });

  test('shows publication errors from the controller', async () => {
    const fetchMock = testing.fn(async (input: string) => {
      if (String(input).endsWith('/groups/summary')) {
        return new Response(
          JSON.stringify([{...group, native_import_state: 'blocked'}]),
          {status: 200},
        );
      }
      if (String(input).endsWith('/groups/group-1/publish')) {
        return new Response(
          JSON.stringify({
            error: 'Recover the ambiguous native report before retrying.',
          }),
          {status: 409},
        );
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    rendererWith({
      gmp: {session: createSession({token: 'test-token'})},
      router: true,
    }).render(<TaskGroups />);
    fireEvent.click(
      await screen.findByRole('button', {name: 'Retry combined report'}),
    );
    expect(
      await screen.findByText(
        'Recover the ambiguous native report before retrying.',
      ),
    ).toBeInTheDocument();
  });
});
