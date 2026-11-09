/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {afterEach, describe, expect, test, testing} from '@gsa/testing';
import {fireEvent, rendererWith, screen, wait} from 'web/testing';
import {createSession} from 'gmp/testing';
import MultiTargetTaskDialog from 'web/credential-aware/MultiTargetTaskDialog';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('MultiTargetTaskDialog preview', () => {
  test('does not create from an obsolete preview response', async () => {
    let resolvePreview: (response: Response) => void = () => {};
    const pendingPreview = new Promise<Response>(resolve => {
      resolvePreview = resolve;
    });
    const fetchMock = testing.fn(async (input: string) => {
      const path = String(input);
      if (path.endsWith('/inventory')) {
        return new Response(
          JSON.stringify({
            targets: [{id: 'target-a', name: 'A', hosts: '192.0.2.1'}],
            credentials: [],
            configs: [{id: 'config-a', name: 'Full and fast'}],
            scanners: [{id: 'scanner-a', name: 'OpenVAS Default'}],
            assets: [],
          }),
          {status: 200},
        );
      }
      if (path.endsWith('/preview')) {
        return pendingPreview;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    rendererWith({gmp: {session: createSession({token: 'test-token'})}}).render(
      <MultiTargetTaskDialog
        initial={{
          name: 'Original',
          targetId: 'target-a',
          configId: 'config-a',
          scannerId: 'scanner-a',
        }}
        onClose={testing.fn()}
        onCreated={testing.fn()}
        onUseStandard={testing.fn()}
      />,
    );
    await screen.findByText(
      'Preview effective credentials',
      {},
      {timeout: 10000},
    );
    fireEvent.click(screen.getByText('Preview effective credentials'));
    fireEvent.change(screen.getByDisplayValue('Original'), {
      target: {value: 'Changed'},
    });
    resolvePreview(
      new Response(
        JSON.stringify({
          name: 'Original',
          units: [{host: '192.0.2.1', credentials: {}}],
          scan_units: [{hosts: ['192.0.2.1'], credentials: {}}],
        }),
        {status: 200},
      ),
    );
    await wait();
    expect(
      screen.getByText('Preview is required before creating this task.'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {name: 'Create multi-target task'}),
    );
    await wait();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/credential-api/groups',
      expect.anything(),
    );
    expect(
      screen.getByText(/Select the source targets and click Preview/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-button'));
    expect(
      screen.queryByText(/Select the source targets and click Preview/),
    ).not.toBeInTheDocument();
  }, 15000);
});
