/* SPDX-FileCopyrightText: 2024 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {afterEach, describe, test, expect, testing} from '@gsa/testing';
import {rendererWithTableRow, fireEvent, screen, waitFor} from 'web/testing';
import Capabilities from 'gmp/capabilities/capabilities';
import Task, {TASK_STATUS} from 'gmp/models/task';
import {createSession} from 'gmp/testing';
import {MultiTargetTasksProvider} from 'web/credential-aware/MultiTargetTaskContext';
import TaskActions from 'web/pages/tasks/TaskActions';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const wrongCaps = new Capabilities(['get_tasks']);

const createGmp = () => ({
  session: createSession(),
});

describe('TaskActions tests', () => {
  test('non-operator keeps ordinary row actions after authorization denial', async () => {
    const task = Task.fromElement({
      _id: 'ordinary-403',
      comment: 'ordinary task',
      owner: {name: 'user'},
      status: TASK_STATUS.done,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });
    const fetchMock = testing.fn(async () => new Response(null, {status: 403}));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: {
        session: createSession({
          token: 'non-operator-test-token',
          username: 'user',
        }),
      },
    });
    render(
      <MultiTargetTasksProvider taskIds={[task.id]}>
        <TaskActions entity={task} onTaskDeleteClick={testing.fn()} />
      </MultiTargetTasksProvider>,
    );
    expect(await screen.findByTestId('trashcan-icon')).toBeInTheDocument();
    expect(screen.getByTestId('start-icon')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('non-operator cannot use shared managed controls after comment edit', async () => {
    const task = Task.fromElement({
      _id: 'managed-403',
      comment: 'edited comment',
      owner: {name: 'admin'},
      status: TASK_STATUS.done,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });
    globalThis.fetch = testing.fn(
      async () => new Response(null, {status: 403}),
    ) as typeof globalThis.fetch;
    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: {
        session: createSession({
          token: 'non-operator-child-token',
          username: 'user',
        }),
      },
    });
    render(
      <MultiTargetTasksProvider taskIds={[task.id]}>
        <TaskActions entity={task} onTaskDeleteClick={testing.fn()} />
      </MultiTargetTasksProvider>,
    );
    expect(
      await screen.findByTitle(
        'Shared task controls require scan group ownership verification',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trashcan-icon')).not.toBeInTheDocument();
  });

  test('hides native controls for a managed child with an edited comment', async () => {
    const task = Task.fromElement({
      _id: 'child-1',
      comment: 'renamed',
      status: TASK_STATUS.done,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });
    globalThis.fetch = testing.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 'group-1',
              native_task_id: 'logical-1',
              children: [{task_id: 'child-1', status: 'Done'}],
            },
          ]),
          {status: 200},
        ),
    ) as typeof globalThis.fetch;
    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: {
        session: createSession({token: 'test-token'}),
        settings: {enableCredentialAwareTasks: true},
      },
    });
    render(
      <MultiTargetTasksProvider taskIds={[task.id]}>
        <TaskActions entity={task} onTaskDeleteClick={testing.fn()} />
      </MultiTargetTasksProvider>,
    );
    expect(
      await screen.findByTitle(
        'Manage this child scan from its multi-target scan group',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trashcan-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('start-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-icon')).not.toBeInTheDocument();
  });

  test('pauses task actions when controller ownership cannot be verified', async () => {
    const task = Task.fromElement({
      _id: 'ordinary-1',
      comment: 'ordinary task',
      status: TASK_STATUS.done,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });
    const fetchMock = testing.fn(async () => {
      throw new Error('Controller unavailable');
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: {session: createSession({token: 'test-token'})},
    });
    render(
      <MultiTargetTasksProvider taskIds={[task.id]}>
        <TaskActions entity={task} onTaskDeleteClick={testing.fn()} />
      </MultiTargetTasksProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      await screen.findByTitle(
        'Task controls unavailable while scan group ownership cannot be verified',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trashcan-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('start-icon')).not.toBeInTheDocument();
  });

  test('keeps ordinary actions when status fails but ownership succeeds', async () => {
    const task = Task.fromElement({
      _id: 'ordinary-1',
      comment: 'ordinary task',
      status: TASK_STATUS.done,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });
    globalThis.fetch = testing.fn(async input =>
      String(input).endsWith('/groups/task-membership')
        ? new Response(JSON.stringify({managed_task_ids: []}), {status: 200})
        : new Response('unavailable', {status: 503}),
    ) as typeof globalThis.fetch;
    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: {session: createSession({token: 'test-token'})},
    });
    render(
      <MultiTargetTasksProvider taskIds={[task.id]}>
        <TaskActions entity={task} onTaskDeleteClick={testing.fn()} />
      </MultiTargetTasksProvider>,
    );
    expect(await screen.findByTestId('trashcan-icon')).toBeInTheDocument();
    expect(screen.getByTestId('start-icon')).toBeInTheDocument();
  });

  test('pauses previously available actions while ownership retry is pending', async () => {
    const task = Task.fromElement({
      _id: 'ordinary-1',
      status: TASK_STATUS.done,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });
    let resolveMembership!: (response: Response) => void;
    let summaryCalls = 0;
    globalThis.fetch = testing.fn(async input => {
      if (String(input).endsWith('/groups/task-membership')) {
        return new Promise<Response>(resolve => {
          resolveMembership = resolve;
        });
      }
      summaryCalls++;
      return summaryCalls === 1
        ? new Response('[]', {status: 200})
        : new Response('unavailable', {status: 503});
    }) as typeof globalThis.fetch;
    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: {session: createSession({token: 'test-token'})},
    });
    render(
      <MultiTargetTasksProvider taskIds={[task.id]}>
        <TaskActions entity={task} onTaskDeleteClick={testing.fn()} />
      </MultiTargetTasksProvider>,
    );
    expect(await screen.findByTestId('trashcan-icon')).toBeInTheDocument();
    fireEvent(window, new Event('credential-aware-groups-changed'));
    await waitFor(() => expect(resolveMembership).toBeDefined());
    expect(screen.queryByTestId('trashcan-icon')).not.toBeInTheDocument();
    resolveMembership(new Response(JSON.stringify({managed_task_ids: []})));
    expect(await screen.findByTestId('trashcan-icon')).toBeInTheDocument();
  });

  test('hides edited managed task actions when status fails but ownership succeeds', async () => {
    const task = Task.fromElement({
      _id: 'managed-1',
      comment: 'edited comment',
      status: TASK_STATUS.done,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });
    globalThis.fetch = testing.fn(async input =>
      String(input).endsWith('/groups/task-membership')
        ? new Response(JSON.stringify({managed_task_ids: ['managed-1']}), {
            status: 200,
          })
        : new Response('unavailable', {status: 503}),
    ) as typeof globalThis.fetch;
    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: {session: createSession({token: 'test-token'})},
    });
    render(
      <MultiTargetTasksProvider taskIds={[task.id]}>
        <TaskActions entity={task} onTaskDeleteClick={testing.fn()} />
      </MultiTargetTasksProvider>,
    );
    expect(
      await screen.findByTitle(
        'Manage this child scan from its multi-target scan group',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trashcan-icon')).not.toBeInTheDocument();
  });

  test('waits for initial ownership lookup before exposing task row actions', async () => {
    const task = Task.fromElement({
      _id: 'ordinary-1',
      status: TASK_STATUS.done,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });
    let resolveLookup!: (response: Response) => void;
    globalThis.fetch = testing.fn(
      () =>
        new Promise<Response>(resolve => {
          resolveLookup = resolve;
        }),
    ) as typeof globalThis.fetch;
    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: {session: createSession({token: 'test-token'})},
    });
    render(
      <MultiTargetTasksProvider taskIds={[task.id]}>
        <TaskActions entity={task} onTaskDeleteClick={testing.fn()} />
      </MultiTargetTasksProvider>,
    );
    expect(screen.queryByTestId('trashcan-icon')).not.toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    resolveLookup(new Response('[]', {status: 200}));
    expect(await screen.findByTestId('trashcan-icon')).toBeInTheDocument();
  });
  test('should render', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      status: TASK_STATUS.new,
      alterable: 0,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: createGmp(),
    });
    const {element} = render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    expect(element).toBeInTheDocument();
  });

  test('should call click handlers', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      status: TASK_STATUS.done,
      alterable: 0,
      last_report: {report: {_id: 'id'}},
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: createGmp(),
    });
    render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    const startIcon = screen.getByTestId('start-icon');
    expect(startIcon).toHaveAttribute('title', 'Start');
    fireEvent.click(startIcon);
    expect(handleTaskStart).toHaveBeenCalledWith(task);

    const resumeIcon = screen.getByTestId('resume-icon');
    expect(resumeIcon).toHaveAttribute('title', 'Task is not stopped');
    fireEvent.click(resumeIcon);
    expect(handleTaskResume).not.toHaveBeenCalled();

    const deleteIcon = screen.getByTestId('trashcan-icon');
    expect(deleteIcon).toHaveAttribute('title', 'Move Task to trashcan');
    fireEvent.click(deleteIcon);
    expect(handleTaskDelete).toHaveBeenCalledWith(task);

    const editIcon = screen.getByTestId('edit-icon');
    expect(editIcon).toHaveAttribute('title', 'Edit Task');
    fireEvent.click(editIcon);
    expect(handleTaskEdit).toHaveBeenCalledWith(task);

    const cloneIcon = screen.getByTestId('clone-icon');
    expect(cloneIcon).toHaveAttribute('title', 'Clone Task');
    fireEvent.click(cloneIcon);
    expect(handleTaskClone).toHaveBeenCalledWith(task);

    const exportIcon = screen.getByTestId('export-icon');
    expect(exportIcon).toHaveAttribute('title', 'Export Task');
    fireEvent.click(exportIcon);
    expect(handleTaskDownload).toHaveBeenCalledWith(task);
  });

  test('should not call click handlers without permissions', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      status: TASK_STATUS.done,
      alterable: 0,
      last_report: {report: {_id: 'id'}},
      permissions: {permission: [{name: 'get_tasks'}]},
      target: {_id: 'id', name: 'target'},
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: wrongCaps,
      gmp: createGmp(),
    });
    render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    const startIcon = screen.getByTestId('start-icon');
    expect(startIcon).toHaveAttribute(
      'title',
      'Permission to start task denied',
    );
    fireEvent.click(startIcon);
    expect(handleTaskStart).not.toHaveBeenCalled();

    const resumeIcon = screen.getByTestId('resume-icon');
    expect(resumeIcon).toHaveAttribute('title', 'Task is not stopped');
    fireEvent.click(resumeIcon);
    expect(handleTaskResume).not.toHaveBeenCalled();

    const deleteIcon = screen.getByTestId('trashcan-icon');
    expect(deleteIcon).toHaveAttribute(
      'title',
      'Permission to move Task to trashcan denied',
    );
    fireEvent.click(deleteIcon);
    expect(handleTaskDelete).not.toHaveBeenCalled();

    const editIcon = screen.getByTestId('edit-icon');
    expect(editIcon).toHaveAttribute('title', 'Permission to edit Task denied');
    fireEvent.click(editIcon);
    expect(handleTaskEdit).not.toHaveBeenCalled();

    const cloneIcon = screen.getByTestId('clone-icon');
    expect(cloneIcon).toHaveAttribute(
      'title',
      'Permission to clone Task denied',
    );
    fireEvent.click(cloneIcon);
    expect(handleTaskClone).not.toHaveBeenCalled();

    const exportIcon = screen.getByTestId('export-icon');
    expect(exportIcon).toHaveAttribute('title', 'Export Task');
    fireEvent.click(exportIcon);
    expect(handleTaskDownload).toHaveBeenCalledWith(task);
  });

  test('should not call click handlers for stopped task without permissions', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      status: TASK_STATUS.stopped,
      alterable: 0,
      last_report: {report: {_id: 'id'}},
      permissions: {permission: [{name: 'get_tasks'}]},
      target: {_id: 'id', name: 'target'},
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: wrongCaps,
      gmp: createGmp(),
    });
    render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    const startIcon = screen.getByTestId('start-icon');
    expect(startIcon).toHaveAttribute(
      'title',
      'Permission to start task denied',
    );
    fireEvent.click(startIcon);
    expect(handleTaskStart).not.toHaveBeenCalled();

    const resumeIcon = screen.getByTestId('resume-icon');
    expect(resumeIcon).toHaveAttribute(
      'title',
      'Permission to resume task denied',
    );
    fireEvent.click(resumeIcon);
    expect(handleTaskResume).not.toHaveBeenCalled();

    const deleteIcon = screen.getByTestId('trashcan-icon');
    expect(deleteIcon).toHaveAttribute(
      'title',
      'Permission to move Task to trashcan denied',
    );
    fireEvent.click(deleteIcon);
    expect(handleTaskDelete).not.toHaveBeenCalled();

    const editIcon = screen.getByTestId('edit-icon');
    expect(editIcon).toHaveAttribute('title', 'Permission to edit Task denied');
    fireEvent.click(editIcon);
    expect(handleTaskEdit).not.toHaveBeenCalled();

    const cloneIcon = screen.getByTestId('clone-icon');
    expect(cloneIcon).toHaveAttribute(
      'title',
      'Permission to clone Task denied',
    );
    fireEvent.click(cloneIcon);
    expect(handleTaskClone).not.toHaveBeenCalled();

    const exportIcon = screen.getByTestId('export-icon');
    expect(exportIcon).toHaveAttribute('title', 'Export Task');
    fireEvent.click(exportIcon);
    expect(handleTaskDownload).toHaveBeenCalledWith(task);
  });

  test('should not call click handlers for running task without permissions', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      status: TASK_STATUS.running,
      alterable: 0,
      last_report: {report: {_id: 'id'}},
      permissions: {permission: [{name: 'get_tasks'}]},
      target: {_id: 'id', name: 'target'},
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: wrongCaps,
      gmp: createGmp(),
    });
    render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    const stopIcon = screen.getByTestId('stop-icon');
    expect(stopIcon).toHaveAttribute('title', 'Permission to stop task denied');
    fireEvent.click(stopIcon);
    expect(handleTaskStart).not.toHaveBeenCalled();

    const resumeIcon = screen.getByTestId('resume-icon');
    expect(resumeIcon).toHaveAttribute('title', 'Task is not stopped');
    fireEvent.click(resumeIcon);
    expect(handleTaskResume).not.toHaveBeenCalled();

    const deleteIcon = screen.getByTestId('trashcan-icon');
    expect(deleteIcon).toHaveAttribute(
      'title',
      'Permission to move Task to trashcan denied',
    );
    fireEvent.click(deleteIcon);
    expect(handleTaskDelete).not.toHaveBeenCalled();

    const editIcon = screen.getByTestId('edit-icon');
    expect(editIcon).toHaveAttribute('title', 'Permission to edit Task denied');
    fireEvent.click(editIcon);
    expect(handleTaskEdit).not.toHaveBeenCalled();

    const cloneIcon = screen.getByTestId('clone-icon');
    expect(cloneIcon).toHaveAttribute(
      'title',
      'Permission to clone Task denied',
    );
    fireEvent.click(cloneIcon);
    expect(handleTaskClone).not.toHaveBeenCalled();

    const exportIcon = screen.getByTestId('export-icon');
    expect(exportIcon).toHaveAttribute('title', 'Export Task');
    fireEvent.click(exportIcon);
    expect(handleTaskDownload).toHaveBeenCalledWith(task);
  });

  test('should call click handlers for running task', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      status: TASK_STATUS.running,
      alterable: 0,
      in_use: 1,
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: createGmp(),
    });
    render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    const stopIcon = screen.getByTestId('stop-icon');
    expect(stopIcon).toHaveAttribute('title', 'Stop');
    fireEvent.click(stopIcon);
    expect(handleTaskStop).toHaveBeenCalledWith(task);

    const resumeIcon = screen.getByTestId('resume-icon');
    expect(resumeIcon).toHaveAttribute('title', 'Task is not stopped');
    fireEvent.click(resumeIcon);
    expect(handleTaskResume).not.toHaveBeenCalled();

    const deleteIcon = screen.getByTestId('trashcan-icon');
    expect(deleteIcon).toHaveAttribute('title', 'Task is still in use');
    fireEvent.click(deleteIcon);
    expect(handleTaskDelete).not.toHaveBeenCalled();

    const editIcon = screen.getByTestId('edit-icon');
    expect(editIcon).toHaveAttribute('title', 'Edit Task');
    fireEvent.click(editIcon);
    expect(handleTaskEdit).toHaveBeenCalledWith(task);

    const cloneIcon = screen.getByTestId('clone-icon');
    expect(cloneIcon).toHaveAttribute('title', 'Clone Task');
    fireEvent.click(cloneIcon);
    expect(handleTaskClone).toHaveBeenCalledWith(task);

    const exportIcon = screen.getByTestId('export-icon');
    expect(exportIcon).toHaveAttribute('title', 'Export Task');
    fireEvent.click(exportIcon);
    expect(handleTaskDownload).toHaveBeenCalledWith(task);
  });

  test('should call click handlers for stopped task', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      status: TASK_STATUS.stopped,
      alterable: 0,
      last_report: {report: {_id: 'id'}},
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: createGmp(),
    });
    render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    const startIcon = screen.getByTestId('start-icon');
    expect(startIcon).toHaveAttribute('title', 'Start');
    fireEvent.click(startIcon);
    expect(handleTaskStart).toHaveBeenCalledWith(task);

    const resumeIcon = screen.getByTestId('resume-icon');
    expect(resumeIcon).toHaveAttribute('title', 'Resume');
    fireEvent.click(resumeIcon);
    expect(handleTaskResume).toHaveBeenCalledWith(task);

    const deleteIcon = screen.getByTestId('trashcan-icon');
    expect(deleteIcon).toHaveAttribute('title', 'Move Task to trashcan');
    fireEvent.click(deleteIcon);
    expect(handleTaskDelete).toHaveBeenCalledWith(task);

    const editIcon = screen.getByTestId('edit-icon');
    expect(editIcon).toHaveAttribute('title', 'Edit Task');
    fireEvent.click(editIcon);
    expect(handleTaskEdit).toHaveBeenCalledWith(task);

    const cloneIcon = screen.getByTestId('clone-icon');
    expect(cloneIcon).toHaveAttribute('title', 'Clone Task');
    fireEvent.click(cloneIcon);
    expect(handleTaskClone).toHaveBeenCalledWith(task);

    const exportIcon = screen.getByTestId('export-icon');
    expect(exportIcon).toHaveAttribute('title', 'Export Task');
    fireEvent.click(exportIcon);
    expect(handleTaskDownload).toHaveBeenCalledWith(task);
  });

  test('should render schedule icon if task is scheduled', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      status: TASK_STATUS.stopped,
      alterable: 0,
      last_report: {report: {_id: 'id'}},
      permissions: {permission: [{name: 'everything'}]},
      target: {_id: 'id', name: 'target'},
      schedule: {
        _id: 'schedule1',
        name: 'schedule1',
        permissions: {permission: [{name: 'everything'}]},
      },
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: createGmp(),
      router: true,
    });
    render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    const detailsLinks = screen.getAllByTestId('details-link');
    fireEvent.click(detailsLinks[0]);
    expect(detailsLinks[0]).toHaveAttribute(
      'title',
      'View Details of Schedule schedule1 (Next due: over)',
    );

    const startIcon = screen.getByTestId('start-icon');
    expect(startIcon).toHaveAttribute('title', 'Start');
    fireEvent.click(startIcon);
    expect(handleTaskStart).toHaveBeenCalledWith(task);

    const resumeIcon = screen.getByTestId('resume-icon');
    expect(resumeIcon).toHaveAttribute('title', 'Resume');
    fireEvent.click(resumeIcon);
    expect(handleTaskResume).toHaveBeenCalledWith(task);

    const deleteIcon = screen.getByTestId('trashcan-icon');
    expect(deleteIcon).toHaveAttribute('title', 'Move Task to trashcan');
    fireEvent.click(deleteIcon);
    expect(handleTaskDelete).toHaveBeenCalledWith(task);

    const editIcon = screen.getByTestId('edit-icon');
    expect(editIcon).toHaveAttribute('title', 'Edit Task');
    fireEvent.click(editIcon);
    expect(handleTaskEdit).toHaveBeenCalledWith(task);

    const cloneIcon = screen.getByTestId('clone-icon');
    expect(cloneIcon).toHaveAttribute('title', 'Clone Task');
    fireEvent.click(cloneIcon);
    expect(handleTaskClone).toHaveBeenCalledWith(task);

    const exportIcon = screen.getByTestId('export-icon');
    expect(exportIcon).toHaveAttribute('title', 'Export Task');
    fireEvent.click(exportIcon);
    expect(handleTaskDownload).toHaveBeenCalledWith(task);
  });

  test('should call click handlers for import task', () => {
    const task = Task.fromElement({
      _id: 'test-id',
      permissions: {permission: [{name: 'everything'}]},
    });

    const handleReportImport = testing.fn();
    const handleTaskClone = testing.fn();
    const handleTaskDelete = testing.fn();
    const handleTaskDownload = testing.fn();
    const handleTaskEdit = testing.fn();
    const handleTaskResume = testing.fn();
    const handleTaskStart = testing.fn();
    const handleTaskStop = testing.fn();

    const {render} = rendererWithTableRow({
      capabilities: true,
      gmp: createGmp(),
    });
    render(
      <TaskActions
        entity={task}
        links={true}
        onReportImportClick={handleReportImport}
        onTaskCloneClick={handleTaskClone}
        onTaskDeleteClick={handleTaskDelete}
        onTaskDownloadClick={handleTaskDownload}
        onTaskEditClick={handleTaskEdit}
        onTaskResumeClick={handleTaskResume}
        onTaskStartClick={handleTaskStart}
        onTaskStopClick={handleTaskStop}
      />,
    );

    const importIcon = screen.getByTestId('import-icon');
    expect(importIcon).toHaveAttribute('title', 'Import Report');
    fireEvent.click(importIcon);
    expect(handleReportImport).toHaveBeenCalledWith(task);

    const resumeIcon = screen.getByTestId('resume-icon');
    expect(resumeIcon).toHaveAttribute('title', 'Task is for import only');
    fireEvent.click(resumeIcon);
    expect(handleTaskResume).not.toHaveBeenCalled();

    const deleteIcon = screen.getByTestId('trashcan-icon');
    expect(deleteIcon).toHaveAttribute('title', 'Move Task to trashcan');
    fireEvent.click(deleteIcon);
    expect(handleTaskDelete).toHaveBeenCalledWith(task);

    const editIcon = screen.getByTestId('edit-icon');
    expect(editIcon).toHaveAttribute('title', 'Edit Task');
    fireEvent.click(editIcon);
    expect(handleTaskEdit).toHaveBeenCalledWith(task);

    const cloneIcon = screen.getByTestId('clone-icon');
    expect(cloneIcon).toHaveAttribute('title', 'Clone Task');
    fireEvent.click(cloneIcon);
    expect(handleTaskClone).toHaveBeenCalledWith(task);

    const exportIcon = screen.getByTestId('export-icon');
    expect(exportIcon).toHaveAttribute('title', 'Export Task');
    fireEvent.click(exportIcon);
    expect(handleTaskDownload).toHaveBeenCalledWith(task);
  });
});
