/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {Fragment, useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router';
import ConfirmationDialog from 'web/components/dialog/ConfirmationDialog';
import Button from 'web/components/form/Button';
import {credentialAwareApi, type GroupSummary} from 'web/credential-aware/api';
import CombinedGroupReport from 'web/credential-aware/CombinedGroupReport';
import useSessionToken from 'web/hooks/useSessionToken';
import {ROUTES} from 'web/route-paths';

interface Props {
  mode?: 'tasks' | 'reports';
}

const TaskGroups = ({mode = 'tasks'}: Props) => {
  const token = useSessionToken();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState<string>();
  const [pendingGroup, setPendingGroup] = useState<GroupSummary>();
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<GroupSummary>();
  const [recovering, setRecovering] = useState<string>();
  const [deleting, setDeleting] = useState<string>();
  const [publishing, setPublishing] = useState<string>();
  const [openReportId, setOpenReportId] = useState<string>();
  const visibleGroups =
    mode === 'reports'
      ? groups.filter(group => group.report_count > 0)
      : groups;

  const refresh = useCallback(async () => {
    try {
      const data = await credentialAwareApi<GroupSummary[]>(
        token,
        'groups/summary',
      );
      setGroups(data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const onChanged = () => {
      void refresh();
    };
    queueMicrotask(onChanged);
    const interval = window.setInterval(onChanged, 30000);
    window.addEventListener('credential-aware-groups-changed', onChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('credential-aware-groups-changed', onChanged);
    };
  }, [refresh]);

  const start = async (group: GroupSummary) => {
    setStarting(group.id);
    try {
      const result = await credentialAwareApi<{failed: Array<{error: string}>}>(
        token,
        `groups/${encodeURIComponent(group.id)}/start`,
        {},
      );
      await refresh();
      if (result.failed.length) {
        setError(result.failed.map(item => item.error).join('; '));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(undefined);
    }
  };

  const recover = async (group: GroupSummary) => {
    setRecovering(group.id);
    setError('');
    try {
      await credentialAwareApi(
        token,
        `groups/${encodeURIComponent(group.id)}/recover`,
        {},
      );
      await refresh();
      window.dispatchEvent(new Event('credential-aware-groups-changed'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRecovering(undefined);
    }
  };

  const deleteGroup = async (group: GroupSummary) => {
    setDeleting(group.id);
    setError('');
    try {
      await credentialAwareApi(
        token,
        `groups/${encodeURIComponent(group.id)}/delete`,
        {},
      );
      await refresh();
      window.dispatchEvent(new Event('credential-aware-groups-changed'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(undefined);
    }
  };

  const publish = async (group: GroupSummary) => {
    setPublishing(group.id);
    setError('');
    try {
      const result = await credentialAwareApi<{
        state?: 'pending' | 'failed' | 'blocked';
        error?: string;
      }>(token, `groups/${encodeURIComponent(group.id)}/publish`, {});
      await refresh();
      if (result.state === 'failed' || result.state === 'blocked') {
        setError(
          result.error || 'Combined report publication needs attention.',
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPublishing(undefined);
    }
  };

  return (
    <section
      aria-label={
        mode === 'tasks'
          ? 'Multi-target scan groups'
          : 'Combined scan group reports'
      }
      style={{
        padding: '1rem',
        marginBottom: '1rem',
        border: '1px solid #ccc',
        borderRadius: 6,
      }}
    >
      <h2>
        {mode === 'tasks'
          ? 'Multi-target scan groups'
          : 'Combined scan group reports'}
      </h2>
      <p>
        {mode === 'tasks'
          ? 'Run and monitor multi-target scans here. Expand a scan to see its hosts. Managed child scans stay in the background.'
          : 'Open results across all hosts in a multi-target scan. Individual host reports also appear in the Reports list below.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {!loading && !visibleGroups.length && !error && (
        <p>
          {mode === 'tasks'
            ? 'No multi-target scans created yet.'
            : 'No multi-target scan reports yet.'}
        </p>
      )}
      {visibleGroups.length > 0 && (
        <table style={{width: '100%', textAlign: 'left'}}>
          <thead>
            <tr>
              <th>Scan</th>
              <th>Status</th>
              <th>Hosts completed</th>
              <th>Reports available</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map(group => (
              <Fragment key={group.id}>
                <tr>
                  <td>
                    <details>
                      <summary>
                        <strong>{group.name}</strong> — {group.host_count} hosts
                      </summary>
                      <ul>
                        {group.children.map(child => (
                          <li key={child.task_id}>
                            {child.host} · {child.status} ·{' '}
                            <Link to={ROUTES.task.url(child.task_id)}>
                              Open host task
                            </Link>
                            {child.report_id && (
                              <>
                                {' '}
                                ·{' '}
                                <Link to={ROUTES.report.url(child.report_id)}>
                                  Open host report
                                </Link>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td>
                    {group.status}
                    {group.native_error && (
                      <p role="alert">{group.native_error}</p>
                    )}
                    {group.native_import_state === 'pending' && (
                      <p>Combined report is being published.</p>
                    )}
                    {group.native_import_state === 'creating' && (
                      <p>Preparing combined report.</p>
                    )}
                    {group.native_import_state === 'failed' && (
                      <p role="alert">Combined report publication failed.</p>
                    )}
                    {group.native_import_state === 'blocked' && (
                      <p role="alert">
                        Combined report publication needs operator attention.
                      </p>
                    )}
                  </td>
                  <td>
                    {group.done_count}/{group.host_count}
                  </td>
                  <td>
                    {group.report_count}/{group.host_count}
                  </td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      {(group.report_count > 0 || group.status !== 'New') && (
                        <Button
                          type="button"
                          onClick={() =>
                            setOpenReportId(
                              openReportId === group.id ? undefined : group.id,
                            )
                          }
                        >
                          {openReportId === group.id
                            ? 'Hide scan details'
                            : group.report_count > 0
                              ? 'Open combined report'
                              : 'View scan progress'}
                        </Button>
                      )}
                      {mode === 'tasks' &&
                        (group.status === 'New' || group.status === 'Done') && (
                          <Button
                            disabled={starting === group.id}
                            type="button"
                            variant={
                              group.status === 'Done' ? 'outline' : 'filled'
                            }
                            onClick={() => setPendingGroup(group)}
                          >
                            {group.status === 'Done'
                              ? 'Run again'
                              : 'Start scan'}
                          </Button>
                        )}
                      {mode === 'tasks' &&
                        group.status !== 'New' &&
                        group.status !== 'Done' && (
                          <span>
                            Expand the scan to manage individual hosts.
                          </span>
                        )}
                      {mode === 'tasks' &&
                        group.status === 'Attention needed' && (
                          <Button
                            disabled={recovering === group.id}
                            type="button"
                            onClick={() => void recover(group)}
                          >
                            Recover scan
                          </Button>
                        )}
                      {mode === 'tasks' &&
                        (group.native_import_state === 'failed' ||
                          group.native_import_state === 'blocked') && (
                          <Button
                            disabled={publishing === group.id}
                            type="button"
                            onClick={() => void publish(group)}
                          >
                            Retry combined report
                          </Button>
                        )}
                      {mode === 'tasks' && (
                        <Button
                          disabled={deleting === group.id}
                          type="button"
                          variant="outline"
                          onClick={() => setPendingDeleteGroup(group)}
                        >
                          Delete scan group
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {openReportId === group.id && (
                  <tr>
                    <td colSpan={5} style={{background: '#f7f9f8'}}>
                      <CombinedGroupReport groupId={group.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {pendingGroup && (
        <ConfirmationDialog
          content={
            pendingGroup.status === 'Done'
              ? `Run ${pendingGroup.name} again across ${pendingGroup.host_count} hosts in ${pendingGroup.children.length} background scans? The scans will be queued and run as capacity permits. New reports will be created for each scan.`
              : `Start ${pendingGroup.name} across ${pendingGroup.host_count} hosts in ${pendingGroup.children.length} background scans? The scans will be queued and run as capacity permits.`
          }
          rightButtonTitle={
            pendingGroup.status === 'Done' ? 'Run again' : 'Start scan'
          }
          title={
            pendingGroup.status === 'Done'
              ? 'Run multi-target scan again'
              : 'Start multi-target scan'
          }
          onClose={() => setPendingGroup(undefined)}
          onResumeClick={() => {
            const group = pendingGroup;
            setPendingGroup(undefined);
            void start(group);
          }}
        />
      )}
      {pendingDeleteGroup && (
        <ConfirmationDialog
          content={`Delete ${pendingDeleteGroup.name} and its managed scans? Active or unreconciled scans cannot be deleted. If recovery is required, inspect the native child task, then use Recover scan before retrying.`}
          rightButtonTitle="Delete scan group"
          title="Delete multi-target scan group"
          onClose={() => setPendingDeleteGroup(undefined)}
          onResumeClick={() => {
            const group = pendingDeleteGroup;
            setPendingDeleteGroup(undefined);
            void deleteGroup(group);
          }}
        />
      )}
    </section>
  );
};

export default TaskGroups;
