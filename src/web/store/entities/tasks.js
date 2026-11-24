/* SPDX-FileCopyrightText: 2024 Greenbone AG
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {parseFilterTermsFromString} from 'gmp/models/filter/filter-term';
import QueryFilter from 'gmp/models/filter/query-filter';
import {createAll} from 'web/store/entities/utils/main';

const {
  loadAllEntities,
  loadEntities,
  loadEntity,
  reducer,
  selector,
  entitiesLoadingActions,
  entityLoadingActions,
} = createAll('task');

export {
  loadAllEntities,
  loadEntities,
  loadEntity,
  reducer,
  selector,
  entitiesLoadingActions,
  entityLoadingActions,
};

const MANAGED_CHILD_EXCLUSION = 'not comment~"Credential review group "';

// gvmd gives AND precedence over OR and does not group filter clauses with
// parentheses. Apply the exclusion to every OR clause before pagination.
export const visibleTaskFilter = filter => {
  const query =
    typeof filter === 'string' ? QueryFilter.fromString(filter) : filter;
  const terms = parseFilterTermsFromString(
    query?.toFilterCriteriaString() || '',
  ).map(term => term.toString());
  const clauses = [[]];
  for (const term of terms) {
    if (term === 'or') {
      clauses.push([]);
    } else {
      clauses[clauses.length - 1].push(term);
    }
  }
  const criteria = clauses
    .map(clause =>
      clause.length
        ? `${clause.join(' ')} and ${MANAGED_CHILD_EXCLUSION}`
        : MANAGED_CHILD_EXCLUSION,
    )
    .join(' or ');
  return [criteria, query?.toFilterExtraString()].filter(Boolean).join(' ');
};

// Keep managed child scans out of the ordinary Tasks list at the GMP query
// boundary so the server's page and filtered counts match the visible rows.
export const loadVisibleEntities = gmp => filter => (dispatch, getState) => {
  if (!gmp.settings?.enableCredentialAwareTasks) {
    return dispatch(loadEntities(gmp)(filter));
  }
  if (selector(getState()).isLoadingEntities(filter)) {
    return Promise.resolve();
  }
  dispatch(entitiesLoadingActions.request(filter));
  const query =
    typeof filter === 'string' ? QueryFilter.fromString(filter) : filter;
  const visible = gmp.tasks.get({filter: visibleTaskFilter(filter)});
  const total = query?.toFilterCriteriaString()
    ? gmp.tasks.get({filter: visibleTaskFilter('first=1 rows=1')})
    : visible;
  return Promise.all([visible, total]).then(
    ([response, totalResponse]) => {
      const counts = response.meta.counts.clone({
        all: totalResponse.meta.counts.filtered,
      });
      return dispatch(
        entitiesLoadingActions.success(
          response.data,
          filter,
          (query ?? QueryFilter.fromString()).mergeExtraKeywords(
            response.meta.filter,
          ),
          counts,
        ),
      );
    },
    error => dispatch(entitiesLoadingActions.error(error, filter)),
  );
};
