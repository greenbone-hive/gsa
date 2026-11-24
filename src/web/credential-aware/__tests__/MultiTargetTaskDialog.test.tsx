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
  const showPreview = async (
    scanCount: number,
    createResponse?: Response,
    planFingerprint = 'a'.repeat(64),
  ) => {
    const units = Array.from({length: Math.max(scanCount, 6)}, (_, index) => ({
      host: `192.0.2.${index + 1}`,
      credentials: {},
    }));
    const scanUnits = Array.from({length: scanCount}, (_, index) => ({
      hosts: [units[index].host],
      credentials: {},
    }));
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
        return new Response(
          JSON.stringify({
            name: 'Scale check',
            plan_fingerprint: planFingerprint,
            units,
            scan_units: scanUnits,
          }),
          {status: 200},
        );
      }
      if (path.endsWith('/groups') && createResponse) {
        return createResponse;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    rendererWith({gmp: {session: createSession({token: 'test-token'})}}).render(
      <MultiTargetTaskDialog
        initial={{
          name: 'Scale check',
          targetId: 'target-a',
          configId: 'config-a',
          scannerId: 'scanner-a',
        }}
        onClose={testing.fn()}
        onCreated={testing.fn()}
        onUseStandard={testing.fn()}
      />,
    );
    fireEvent.click(await screen.findByText('Preview effective credentials'));
    return fetchMock;
  };

  test('warns about the exact number of queued background scans', async () => {
    await showPreview(3);
    expect(
      await screen.findByText(/6 hosts in 3 background scans/),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Creating this task creates 3 separate scan tasks',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'queued and run as capacity permits',
    );
  });

  test('refuses a preview requiring more than 16 background scans', async () => {
    const fetchMock = await showPreview(17);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This plan needs 17 background scans; the limit is 16',
    );
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
  });

  test('binds creation to the preview even when the scan count stays the same', async () => {
    const fetchMock = await showPreview(
      3,
      new Response(
        JSON.stringify({
          error:
            'Scan plan changed since preview; review the background scan count and try again',
        }),
        {status: 409},
      ),
    );
    await screen.findByText(/6 hosts in 3 background scans/);
    fireEvent.click(
      screen.getByRole('button', {name: 'Create multi-target task'}),
    );
    expect(
      await screen.findByText(/The scan plan changed since preview/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Preview is required before creating this task.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/credential-api/groups',
      expect.objectContaining({
        body: expect.stringContaining('"expected_scan_count":3'),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/credential-api/groups',
      expect.objectContaining({
        body: expect.stringContaining(
          `"expected_plan_fingerprint":"${'a'.repeat(64)}"`,
        ),
      }),
    );
  });

  test('refuses a preview without a plan fingerprint', async () => {
    const fetchMock = await showPreview(3, undefined, '');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Scan plan verification is unavailable',
    );
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
  });

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
