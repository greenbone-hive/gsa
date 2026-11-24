/* SPDX-FileCopyrightText: 2026 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  CredentialAwareApiError,
  credentialAwareApi,
  lookupGroupSummaries,
  lookupManagedTaskIds,
  type GroupSummary,
} from 'web/credential-aware/api';
import useSessionToken from 'web/hooks/useSessionToken';

interface MultiTargetTaskState {
  byTaskId: Record<string, GroupSummary>;
  managedTaskIds: Set<string>;
  ownershipKnown: boolean;
  operatorDenied: boolean;
  initialLoading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  start: (group: GroupSummary) => Promise<void>;
  stop: (group: GroupSummary) => Promise<void>;
}

const emptyState: MultiTargetTaskState = {
  byTaskId: {},
  managedTaskIds: new Set(),
  ownershipKnown: true,
  operatorDenied: false,
  initialLoading: false,
  refresh: async () => {},
  start: async () => {},
  stop: async () => {},
};

const Context = createContext<MultiTargetTaskState>(emptyState);

export const useMultiTargetTasks = () => useContext(Context);

export const MultiTargetTasksProvider = ({
  children,
  taskIds = [],
}: {
  children: ReactNode;
  taskIds?: string[];
}) => {
  const token = useSessionToken();
  const candidateKey = taskIds.join(',');
  const [byTaskId, setByTaskId] = useState<Record<string, GroupSummary>>({});
  const [managedTaskIds, setManagedTaskIds] = useState<Set<string>>(new Set());
  const [ownershipKnown, setOwnershipKnown] = useState(false);
  const [operatorDenied, setOperatorDenied] = useState(false);
  const [verifiedCandidateKey, setVerifiedCandidateKey] = useState<string>();
  const [verifiedToken, setVerifiedToken] = useState<string>();
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const candidates = candidateKey ? candidateKey.split(',') : [];
    try {
      const summaries = await lookupGroupSummaries(token, candidates);
      setByTaskId(
        Object.fromEntries(
          summaries
            .filter(group => group.native_task_id)
            .map(group => [group.native_task_id as string, group]),
        ),
      );
      setManagedTaskIds(
        new Set(
          summaries.flatMap(group => [
            ...(group.native_task_id ? [group.native_task_id] : []),
            ...group.children.map(child => child.task_id),
          ]),
        ),
      );
      setVerifiedCandidateKey(candidateKey);
      setVerifiedToken(token);
      setOwnershipKnown(true);
      setOperatorDenied(false);
      setError(undefined);
    } catch (reason) {
      setError((reason as Error).message);
      if (reason instanceof CredentialAwareApiError && reason.status === 403) {
        // The controller permits only its configured operator account.
        // GSAD task comments still identify managed tasks in other users'
        // lists; ordinary task controls remain available to those users.
        setByTaskId({});
        setManagedTaskIds(new Set());
        setVerifiedCandidateKey(candidateKey);
        setVerifiedToken(token);
        setOwnershipKnown(true);
        setOperatorDenied(true);
        return;
      }
      setOwnershipKnown(false);
      setOperatorDenied(false);
      setVerifiedCandidateKey(undefined);
      setVerifiedToken(undefined);
      try {
        if (!candidates.length) {
          throw new Error('No task IDs to verify');
        }
        const ids = await lookupManagedTaskIds(token, candidates);
        setManagedTaskIds(new Set(ids));
        setVerifiedCandidateKey(candidateKey);
        setVerifiedToken(token);
        setOwnershipKnown(true);
        setOperatorDenied(false);
      } catch {
        setOwnershipKnown(false);
      }
    } finally {
      setInitialLoading(false);
    }
  }, [candidateKey, token]);

  useEffect(() => {
    const update = () => void refresh();
    queueMicrotask(() => void refresh());
    window.addEventListener('credential-aware-groups-changed', update);
    return () => {
      window.removeEventListener('credential-aware-groups-changed', update);
    };
  }, [refresh]);

  const pollManaged =
    ownershipKnown &&
    verifiedCandidateKey === candidateKey &&
    verifiedToken === token &&
    managedTaskIds.size > 0;
  useEffect(() => {
    if (!pollManaged) {
      return;
    }
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [pollManaged, refresh]);

  const run = async (group: GroupSummary, action: 'start' | 'stop') => {
    const result = await credentialAwareApi<{
      failed: Array<{task_id: string; error: string}>;
    }>(token, `groups/${encodeURIComponent(group.id)}/${action}`, {});
    await refresh();
    window.dispatchEvent(new Event('credential-aware-groups-changed'));
    if (result.failed.length) {
      throw new Error(result.failed.map(item => item.error).join('; '));
    }
  };

  return (
    <Context.Provider
      value={{
        byTaskId,
        managedTaskIds,
        ownershipKnown:
          ownershipKnown &&
          verifiedCandidateKey === candidateKey &&
          verifiedToken === token,
        operatorDenied,
        initialLoading,
        error,
        refresh,
        start: group => run(group, 'start'),
        stop: group => run(group, 'stop'),
      }}
    >
      {children}
    </Context.Provider>
  );
};
