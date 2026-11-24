/* SPDX-FileCopyrightText: 2024 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {useState} from 'react';
import {TASKS_FILTER_FILTER} from 'gmp/models/filter';
import QueryFilter from 'gmp/models/filter/query-filter';
import type Task from 'gmp/models/task';
import DashboardControlsContainer from 'web/components/dashboard/DashboardControlsContainer';
import {TaskIcon} from 'web/components/icon';
import PageTitle from 'web/components/layout/PageTitle';
import {
  USE_DEFAULT_RELOAD_INTERVAL,
  USE_DEFAULT_RELOAD_INTERVAL_ACTIVE,
} from 'web/components/loading/Reload';
import {lookupManagedTaskIds} from 'web/credential-aware/api';
import {MultiTargetTasksProvider} from 'web/credential-aware/MultiTargetTaskContext';
import {
  deleteSelectedOrdinaryTasks,
  lookupManagedIdsForDeletion,
} from 'web/credential-aware/safe-bulk-delete';
import EntitiesPage from 'web/entities/EntitiesPage';
import withEntitiesContainer, {
  type WithEntitiesContainerComponentProps,
} from 'web/entities/withEntitiesContainer';
import useGmp from 'web/hooks/useGmp';
import useSessionToken from 'web/hooks/useSessionToken';
import useTranslation from 'web/hooks/useTranslation';
import TaskDashboard, {TASK_DASHBOARD_ID} from 'web/pages/tasks/dashboard';
import TaskToolBarIcons from 'web/pages/tasks/icons/TaskListPageToolBarIcons';
import TaskComponent from 'web/pages/tasks/TaskComponent';
import TaskFilterDialog from 'web/pages/tasks/TaskFilterDialog';
import TaskTable from 'web/pages/tasks/TaskTable';
import {
  loadVisibleEntities,
  selector as entitiesSelector,
  visibleTaskFilter,
} from 'web/store/entities/tasks';
import SelectionType from 'web/utils/selection-type';

type TaskListPageProps = WithEntitiesContainerComponentProps<Task>;

interface TaskEntitiesPageProps {
  onDeleteBulk?: () => Promise<void>;
  onAdvancedTaskWizardClick?: () => void;
  onImportTaskCreateClick?: () => void;
  onModifyTaskWizardClick?: () => void;
  onNewAgentTaskClick?: () => void;
  onNewContainerImageTaskClick?: () => void;
  onNewWebApplicationTaskClick?: () => void;
  onReportImportClick?: (task: Task) => void;
  onTaskCloneClick?: (task: Task) => void;
  onTaskCreateClick?: () => void;
  onMultiTargetCreateClick?: () => void;
  onTaskDeleteClick?: (task: Task) => void;
  onTaskDownloadClick?: (task: Task) => void;
  onTaskEditClick?: (task: Task) => void;
  onTaskResumeClick?: (task: Task) => void;
  onTaskStartClick?: (task: Task) => void;
  onTaskStopClick?: (task: Task) => void;
  onTaskWizardClick?: () => void;
  showMultiTarget?: boolean;
}

const TaskListPage = ({
  filter,
  onFilterChanged,
  onChanged,
  onDownloaded,
  onError,
  ...props
}: TaskListPageProps) => {
  const [_] = useTranslation();
  const gmp = useGmp();
  const showCredentialAwareTasks = gmp.settings.enableCredentialAwareTasks;
  const token = useSessionToken();
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const deleteBulk = async () => {
    setBulkDeleteError('');
    if (!showCredentialAwareTasks) {
      return props.onDeleteBulk();
    }
    if (props.selectionType !== SelectionType.SELECTION_USER) {
      setBulkDeleteError(
        'Select ordinary tasks individually before deleting. Page and all-filtered deletion are unavailable while multi-target scans are enabled.',
      );
      return;
    }
    const selected = Array.from(props.entitiesSelected ?? []);
    if (!selected.length) {
      setBulkDeleteError('Select at least one ordinary task to delete.');
      return;
    }
    try {
      await deleteSelectedOrdinaryTasks(
        selected,
        ids =>
          lookupManagedIdsForDeletion(selected, gmp.session.username, () =>
            lookupManagedTaskIds(token, ids),
          ),
        tasks => gmp.tasks.delete(tasks),
      );
      onChanged();
    } catch (error) {
      setBulkDeleteError((error as Error).message);
    }
  };
  const taskList = (
    <TaskComponent
      onAdvancedTaskWizardSaved={onChanged}
      onCloneError={onError}
      onCloned={onChanged}
      onCreated={onChanged}
      onDeleteError={onError}
      onDeleted={onChanged}
      onDownloadError={onError}
      onDownloaded={onDownloaded}
      onImportTaskCreated={onChanged}
      onImportTaskSaved={onChanged}
      onModifyTaskWizardSaved={onChanged}
      onReportImported={onChanged}
      onResumeError={onError}
      onResumed={onChanged}
      onSaved={onChanged}
      onStartError={onError}
      onStarted={onChanged}
      onStopError={onError}
      onStopped={onChanged}
      onTaskWizardSaved={onChanged}
    >
      {({
        clone,
        create,
        createMultiTarget,
        createImportTask,
        delete: deleteFunc,
        download,
        edit,
        start,
        stop,
        resume,
        reportImport,
        advancedTaskWizard,
        modifyTaskWizard,
        taskWizard,
        onNewAgentTaskClick,
        onNewContainerImageTaskClick,
        onNewWebApplicationTaskClick,
      }) => (
        <>
          <PageTitle title={_('Tasks')} />
          {bulkDeleteError && <p role="alert">{bulkDeleteError}</p>}
          <EntitiesPage<Task, TaskEntitiesPageProps>
            {...props}
            dashboard={() => (
              <TaskDashboard
                filter={filter}
                onFilterChanged={onFilterChanged}
              />
            )}
            dashboardControls={() => (
              <DashboardControlsContainer dashboardId={TASK_DASHBOARD_ID} />
            )}
            entities={props.entities}
            filter={filter}
            filterEditDialog={TaskFilterDialog}
            filtersFilter={TASKS_FILTER_FILTER}
            sectionIcon={<TaskIcon size="large" />}
            showMultiTarget={showCredentialAwareTasks}
            table={TaskTable}
            title={_('Tasks')}
            toolBarIcons={TaskToolBarIcons}
            onAdvancedTaskWizardClick={advancedTaskWizard}
            onDeleteBulk={deleteBulk}
            onError={onError}
            onFilterChanged={onFilterChanged}
            onImportTaskCreateClick={createImportTask}
            onModifyTaskWizardClick={modifyTaskWizard}
            onMultiTargetCreateClick={createMultiTarget}
            onNewAgentTaskClick={onNewAgentTaskClick}
            onNewContainerImageTaskClick={onNewContainerImageTaskClick}
            onNewWebApplicationTaskClick={onNewWebApplicationTaskClick}
            onReportImportClick={reportImport}
            onTaskCloneClick={clone}
            onTaskCreateClick={create}
            onTaskDeleteClick={deleteFunc}
            onTaskDownloadClick={download}
            onTaskEditClick={edit}
            onTaskResumeClick={resume}
            onTaskStartClick={start}
            onTaskStopClick={stop}
            onTaskWizardClick={taskWizard}
          />
        </>
      )}
    </TaskComponent>
  );
  return showCredentialAwareTasks ? (
    <MultiTargetTasksProvider
      taskIds={props.entities?.map(task => task.id) ?? []}
    >
      {taskList}
    </MultiTargetTasksProvider>
  ) : (
    taskList
  );
};

export const taskReloadInterval = ({entities = []}: {entities: Task[]}) =>
  entities.some(task => task.isActive())
    ? USE_DEFAULT_RELOAD_INTERVAL_ACTIVE
    : USE_DEFAULT_RELOAD_INTERVAL;

export default withEntitiesContainer('task', {
  bulkFilter: gmp =>
    gmp.settings.enableCredentialAwareTasks
      ? filter => QueryFilter.fromString(visibleTaskFilter(filter))
      : undefined,
  entitiesSelector,
  loadEntities: loadVisibleEntities,
  reloadInterval: taskReloadInterval,
})(TaskListPage);
