/* SPDX-FileCopyrightText: 2025 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {describe, test, expect, testing} from '@gsa/testing';
import {
  rendererWith,
  screen,
  waitFor,
  userEvent,
  fireEvent,
  wait,
} from 'web/testing';
import {type FilterType} from 'gmp/models/filter';
import QueryFilter from 'gmp/models/filter/query-filter';
import PortList from 'gmp/models/port-list';
import {createSession} from 'gmp/testing';
import EntitiesContainer from 'web/entities/EntitiesContainer';
import {visibleTaskFilter} from 'web/store/entities/tasks';
import SelectionType from 'web/utils/selection-type';

const currentSettingsResponse = {
  data: {
    listexportfilename: {
      id: 'a6ac88c5-729c-41ba-ac0a-deea4a3441f2',
      name: 'List Export File Name',
      value: '%T-%U',
    },
  },
};

const onDownloaded = testing.fn();
const notify = testing.fn();
const updateFilter = testing.fn();
const reload = testing.fn();
const showError = testing.fn();
const showErrorMessage = testing.fn();
const showSuccessMessage = testing.fn();
const onDownload = testing.fn();

const setup = (gmp, bulkFilter?: (filter: FilterType) => FilterType) => {
  const {render} = rendererWith({gmp, store: true, router: true});
  const initialFilter = new QueryFilter();
  render(
    <EntitiesContainer
      bulkFilter={bulkFilter}
      entities={[new PortList({id: '1', name: 'Port List 1'})]}
      filter={initialFilter}
      gmp={gmp}
      gmpName="portlist"
      isLoading={false}
      loadedFilter={initialFilter}
      notify={notify}
      reload={reload}
      showError={showError}
      showErrorMessage={showErrorMessage}
      showSuccessMessage={showSuccessMessage}
      updateFilter={updateFilter}
      onDownload={onDownload}
    >
      {({onDownloadBulk, onSelectionTypeChange, onTagsBulk}) => (
        <>
          <button
            data-testid="download-button"
            onClick={() => onDownloadBulk()}
          >
            Download Bulk
          </button>
          <button data-testid="tags-button" onClick={() => onTagsBulk()}>
            Open Tags
          </button>
          <button
            onClick={() =>
              onSelectionTypeChange(SelectionType.SELECTION_FILTER)
            }
          >
            Select all filtered
          </button>
        </>
      )}
    </EntitiesContainer>,
  );
  return {
    downloadButton: screen.getByRole('button', {name: /Download Bulk/i}),
    tagsButton: screen.getByRole('button', {name: /Open Tags/i}),
  };
};

const createGmp = ({
  exportEntities = testing.fn().mockResolvedValue({data: {id: '123'}}),
  exportByFilter = testing.fn().mockResolvedValue({data: {id: '123'}}),
  currentSettings = testing.fn().mockResolvedValue(currentSettingsResponse),
  getAllTags = testing.fn().mockResolvedValue({data: []}),
} = {}) => ({
  portlists: {
    export: exportEntities,
    exportByFilter,
  },
  tags: {
    getAll: getAllTags,
  },
  user: {currentSettings},
  session: createSession(),
});

describe('EntitiesContainer', () => {
  test('bulk page export uses displayed IDs and all-filtered export excludes children', async () => {
    const exportEntities = testing.fn().mockResolvedValue({data: 'page'});
    const exportByFilter = testing.fn().mockResolvedValue({data: 'filtered'});
    const gmp = createGmp({exportEntities, exportByFilter});
    const {downloadButton} = setup(gmp, filter =>
      QueryFilter.fromString(visibleTaskFilter(filter)),
    );
    await userEvent.click(downloadButton);
    expect(exportEntities).toHaveBeenCalledWith([
      expect.objectContaining({id: '1'}),
    ]);
    expect(exportByFilter).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', {name: 'Select all filtered'}),
    );
    await userEvent.click(downloadButton);
    expect(exportByFilter).toHaveBeenCalledTimes(1);
    const exportedFilter = exportByFilter.mock.calls[0][0];
    expect(exportedFilter.toFilterCriteriaString()).toContain(
      'not comment~"Credential review group "',
    );
  });
  test('should allow downloading entities in bulk', async () => {
    const gmp = createGmp();
    const {downloadButton} = setup(gmp);
    await userEvent.click(downloadButton);

    await waitFor(() => expect(screen.getByText('Bulk download started.')));
    expect(onDownload).toHaveBeenCalledWith({
      filename: 'portlists-list.xml',
      data: {id: '123'},
    });
    await waitFor(() => expect(screen.getByText('Bulk download completed.')));
  });

  test('should call onDownloadError when downloading entities in bulk fails', async () => {
    const error = 'mock error';
    const gmp = createGmp({
      exportByFilter: testing.fn().mockRejectedValue(error),
    });
    const originalConsoleError = console.error;
    console.error = testing.fn();

    const {downloadButton} = setup(gmp);
    fireEvent.click(downloadButton);

    await wait();

    expect(showError).toHaveBeenCalledWith(error);
    expect(onDownloaded).not.toHaveBeenCalled();

    console.error = originalConsoleError;
  });

  test('should open tags dialog when onTagsBulk is triggered', async () => {
    const getAllTags = testing.fn().mockResolvedValue({data: []});
    const gmp = createGmp({getAllTags});
    const {tagsButton} = setup(gmp);

    await userEvent.click(tagsButton);

    await waitFor(() => {
      expect(getAllTags).toHaveBeenCalledWith({
        filter: 'resource_type=port_list',
      });
    });

    await waitFor(() => {
      expect(screen.getDialogTitle()).toHaveTextContent(
        'Add Tag to Page Contents',
      );
    });
  });
});
