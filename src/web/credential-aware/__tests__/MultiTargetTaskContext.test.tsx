/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {afterEach, describe, expect, test, testing} from '@gsa/testing';
import {rendererWith, screen, waitFor} from 'web/testing';
import {createSession} from 'gmp/testing';
import {
  MultiTargetTasksProvider,
  useMultiTargetTasks,
} from 'web/credential-aware/MultiTargetTaskContext';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  testing.restoreAllMocks();
});

const State = () => {
  const {ownershipKnown, managedTaskIds} = useMultiTargetTasks();
  return (
    <div>
      {ownershipKnown ? 'ownership known' : 'ownership pending'};
      {managedTaskIds.size ? ' managed' : ' ordinary'}
    </div>
  );
};

describe('multi-target ownership polling', () => {
  test('non-operator users retain ordinary task controls without membership lookup', async () => {
    const interval = testing.spyOn(window, 'setInterval');
    const fetchMock = testing.fn(async () => new Response(null, {status: 403}));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    rendererWith({
      gmp: {session: createSession({token: 'test-token-denied'})},
    }).render(
      <MultiTargetTasksProvider taskIds={['ordinary-1']}>
        <State />
      </MultiTargetTasksProvider>,
    );
    expect(
      await screen.findByText(/ownership known; ordinary/),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(interval).not.toHaveBeenCalledWith(expect.any(Function), 15000);
  });

  test('ordinary-only task pages do not start periodic group polling', async () => {
    const interval = testing.spyOn(window, 'setInterval');
    const fetchMock = testing.fn(
      async () => new Response(JSON.stringify([]), {status: 200}),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    rendererWith({
      gmp: {session: createSession({token: 'test-token-ordinary'})},
    }).render(
      <MultiTargetTasksProvider taskIds={['ordinary-1']}>
        <State />
      </MultiTargetTasksProvider>,
    );
    expect(
      await screen.findByText(/ownership known; ordinary/),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(interval).not.toHaveBeenCalledWith(expect.any(Function), 15000);
  });

  test('managed task pages retain periodic status polling', async () => {
    const interval = testing.spyOn(window, 'setInterval');
    globalThis.fetch = testing.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 'group-1',
              native_task_id: 'managed-1',
              children: [],
            },
          ]),
          {status: 200},
        ),
    ) as typeof globalThis.fetch;
    rendererWith({
      gmp: {session: createSession({token: 'test-token-managed'})},
    }).render(
      <MultiTargetTasksProvider taskIds={['managed-1']}>
        <State />
      </MultiTargetTasksProvider>,
    );
    expect(
      await screen.findByText(/ownership known; managed/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(interval).toHaveBeenCalledWith(expect.any(Function), 15000),
    );
  });
});
