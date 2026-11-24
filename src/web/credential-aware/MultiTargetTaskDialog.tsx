/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {useEffect, useRef, useState} from 'react';
import SaveDialog from 'web/components/dialog/SaveDialog';
import Button from 'web/components/form/Button';
import Checkbox from 'web/components/form/Checkbox';
import FormGroup from 'web/components/form/FormGroup';
import MultiSelect from 'web/components/form/MultiSelect';
import Select from 'web/components/form/Select';
import TextField from 'web/components/form/TextField';
import {
  CredentialAwareApiError,
  credentialAwareApi,
  type Inventory,
  type TaskGroup,
  type TaskPlan,
  type TaskRequest,
} from 'web/credential-aware/api';
import useSessionToken from 'web/hooks/useSessionToken';

interface Props {
  initial?: {
    name?: string;
    targetId?: string;
    configId?: string;
    scannerId?: string;
  };
  onClose: () => void;
  onCreated: (group: TaskGroup) => void;
  onUseStandard: (draft: TaskRequest) => void;
}

const MAX_BACKGROUND_SCANS = 16;

const MultiTargetTaskDialog = ({
  initial,
  onClose,
  onCreated,
  onUseStandard,
}: Props) => {
  const token = useSessionToken();
  const [inventory, setInventory] = useState<Inventory>();
  const [name, setName] = useState(initial?.name || '');
  const [targetIds, setTargetIds] = useState<string[]>(
    initial?.targetId ? [initial.targetId] : [],
  );
  const [configId, setConfigId] = useState(initial?.configId || '');
  const [scannerId, setScannerId] = useState(initial?.scannerId || '');
  const [plan, setPlan] = useState<TaskPlan>();
  const revision = useRef(0);
  const [previewRevision, setPreviewRevision] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    let active = true;
    credentialAwareApi<Inventory>(token, 'inventory')
      .then(data => {
        if (active) {
          setInventory(data);
          setConfigId(
            current =>
              current ||
              data.configs.find(item => item.name === 'Full and fast')?.id ||
              data.configs[0]?.id ||
              '',
          );
          setScannerId(
            current =>
              current ||
              data.scanners.find(item => item.name === 'OpenVAS Default')?.id ||
              data.scanners[0]?.id ||
              '',
          );
        }
      })
      .catch(err => active && setError((err as Error).message));
    return () => {
      active = false;
    };
  }, [token]);

  const request = (): TaskRequest => ({
    backend_mode: 'enhanced',
    name: name.trim(),
    target_ids: targetIds,
    config_id: configId,
    scanner_id: scannerId,
    overrides: [],
  });

  const change = <T,>(setter: (value: T) => void, value: T) => {
    revision.current += 1;
    setter(value);
    setPlan(undefined);
    setPreviewRevision(undefined);
    setLoading(false);
    setError('');
    setPreviewError('');
  };

  const preview = async () => {
    const currentRevision = ++revision.current;
    setPlan(undefined);
    setPreviewRevision(undefined);
    setPreviewError('');
    if (!name.trim() || !targetIds.length || !configId || !scannerId) {
      setPlan(undefined);
      setPreviewError(
        'Enter a name, select at least one source target, and choose a scan configuration and scanner.',
      );
      return;
    }
    setLoading(true);
    try {
      const result = await credentialAwareApi<TaskPlan>(
        token,
        'preview',
        request(),
      );
      if (revision.current === currentRevision) {
        const scanCount = result.scan_units?.length ?? result.units.length;
        if (!/^[0-9a-f]{64}$/.test(result.plan_fingerprint || '')) {
          setPreviewError(
            'Scan plan verification is unavailable. Update the controller and preview again.',
          );
        } else if (scanCount > MAX_BACKGROUND_SCANS) {
          setPreviewError(
            `This plan needs ${scanCount} background scans; the limit is ${MAX_BACKGROUND_SCANS}. Reduce the source targets or distinct credential sets.`,
          );
        } else {
          setPlan(result);
          setPreviewRevision(currentRevision);
        }
      }
    } catch (err) {
      if (revision.current === currentRevision) {
        setPreviewError((err as Error).message);
      }
    } finally {
      if (revision.current === currentRevision) {
        setLoading(false);
      }
    }
  };

  const create = async () => {
    if (!plan || previewRevision !== revision.current) {
      throw new Error(
        'Select the source targets and click Preview effective credentials before creating the task.',
      );
    }
    const scanCount = plan.scan_units?.length ?? plan.units.length;
    if (scanCount > MAX_BACKGROUND_SCANS) {
      throw new Error(`The limit is ${MAX_BACKGROUND_SCANS} background scans.`);
    }
    if (!/^[0-9a-f]{64}$/.test(plan.plan_fingerprint || '')) {
      throw new Error('Scan plan verification is unavailable. Preview again.');
    }
    try {
      const group = await credentialAwareApi<TaskGroup>(token, 'groups', {
        ...request(),
        expected_scan_count: scanCount,
        expected_plan_fingerprint: plan.plan_fingerprint,
      });
      onCreated(group);
      onClose();
    } catch (reason) {
      if (reason instanceof CredentialAwareApiError && reason.status === 409) {
        revision.current += 1;
        setPlan(undefined);
        setPreviewRevision(undefined);
        setPreviewError(
          'The scan plan changed since preview. Preview again to review the new background scan count.',
        );
        return;
      }
      throw reason;
    }
  };

  const credentialName = (id: string) =>
    inventory?.credentials.find(item => item.id === id)?.name || id;

  return (
    <SaveDialog
      buttonTitle="Create multi-target task"
      error={error || undefined}
      isLoading={!inventory || loading}
      title="New multi-target task"
      width="58vw"
      onClose={onClose}
      onError={reason => setError(reason.message)}
      onErrorClose={() => setError('')}
      onSave={create}
    >
      <FormGroup title="Scan mode">
        <Checkbox
          checked
          title="Scan multiple targets"
          onChange={enabled => {
            if (!enabled) {
              onUseStandard(request());
            }
          }}
        />
      </FormGroup>
      <p>
        Select one or more existing targets. Hosts in the same source target
        share a scan when their effective credentials match. A combined report
        appears after all scans finish; source reports remain available.
      </p>
      <FormGroup title="Name">
        <TextField
          name="name"
          value={name}
          onChange={value => change(setName, value)}
        />
      </FormGroup>
      <FormGroup title="Source targets">
        <MultiSelect
          items={
            inventory?.targets
              .filter(item => !item.review_managed)
              .map(item => ({
                value: item.id,
                label: `${item.name} — ${item.hosts || ''}`,
              })) || []
          }
          value={targetIds}
          onChange={value => change(setTargetIds, value)}
        />
      </FormGroup>
      <FormGroup title="Scan configuration">
        <Select
          items={
            inventory?.configs.map(item => ({
              value: item.id,
              label: item.name,
            })) || []
          }
          value={configId}
          onChange={value => change(setConfigId, value)}
        />
      </FormGroup>
      <FormGroup title="Scanner">
        <Select
          items={
            inventory?.scanners.map(item => ({
              value: item.id,
              label: item.name,
            })) || []
          }
          value={scannerId}
          onChange={value => change(setScannerId, value)}
        />
      </FormGroup>
      <Button
        disabled={loading || !inventory}
        type="button"
        variant="outline"
        onClick={() => void preview()}
      >
        Preview effective credentials
      </Button>
      {previewError && (
        <p role="alert" style={{color: 'var(--color-error, #b3261e)'}}>
          {previewError}
        </p>
      )}
      {!plan && <p>Preview is required before creating this task.</p>}
      {plan && (
        <div aria-live="polite">
          <p>
            <strong>
              {plan.units.length} hosts in{' '}
              {plan.scan_units?.length ?? plan.units.length} background scans.
            </strong>{' '}
            The task remains stopped until you start it.
          </p>
          <p role="alert">
            Capacity warning: Creating this task creates{' '}
            {plan.scan_units?.length ?? plan.units.length} separate scan tasks.
            When started, they are queued and run as capacity permits, so more
            background scans can increase completion time.
          </p>
          <table style={{width: '100%'}}>
            <thead>
              <tr>
                <th>Host</th>
                <th>Effective credentials</th>
              </tr>
            </thead>
            <tbody>
              {plan.units.map(unit => (
                <tr key={unit.host}>
                  <td>{unit.host}</td>
                  <td>
                    {Object.entries(unit.credentials)
                      .map(
                        ([service, id]) => `${service}: ${credentialName(id)}`,
                      )
                      .join(', ') || 'None'}
                    {unit.applied_overrides?.length
                      ? ' (asset override applied)'
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SaveDialog>
  );
};

export default MultiTargetTaskDialog;
