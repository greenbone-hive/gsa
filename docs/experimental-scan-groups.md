# Experimental multi-target scan UI with asset credential overrides

When `enableCredentialAwareTasks` is enabled in `config.js`, task creation
includes a multi-target mode. The dialog previews expanded hosts, effective
credentials, and the number of child scans. Task lists and details show one
logical entry, child statuses, and a combined report link. The host details
page can save, pause, resume, and delete per-service credential overrides.
Use this UI with `GVMD_NATIVE_MULTI_TARGET=1`, the matching controller in
`NATIVE_BACKEND=1` mode, and the GSAD-authenticated proxy from these branches.

The backend groups hosts only within the same source target and only when
their full effective credential sets match. Six explicit hosts across two
source targets produce two child scans without overrides, or three when one
host differs. The UI displays the returned plan rather than deciding scan
partitions. Gvmd owns the logical parent, child task identities, durable
queue, and dispatch. The controller retains credential planning, GUI mapping,
and bounded combined-report publication.

The preview warns how many background scan tasks will be created. Plans
requiring more than 16 partitions are rejected before task creation. Creation
requires a fresh preview if targets or credential assignments change after
preview. Starting a group queues its children in gvmd. The native queue
allows one active child per group, two native children globally, and at most
64 outstanding children. These provisional limits do not atomically reserve
capacity against ordinary gvmd scans on the same scanner. A shared-stack
guarantee needs a common gvmd admission path or a dedicated scanner.

Native group deletion and uncertain-run recovery are disabled until gvmd owns
safe cleanup and reconciliation. Ordinary tasks can be
deleted in bulk after selecting their rows individually. Page-wide and
all-filtered bulk deletion are disabled in this experimental mode because
they cannot safely distinguish controller-owned tasks whose comments changed.
Bulk deletion also refuses to run when controller ownership cannot be
verified. After administrator authorization is denied, non-admin users retain
individual controls and selected bulk deletion for their own tasks. Shared
tasks remain guarded because controller-created tasks belong to the operator
and edited comments cannot prove ownership.
Task and report pages request status only for groups represented by their
visible task IDs, in batches of at most 100. This avoids polling all
historical child tasks on every page refresh.
The fallback checks only task IDs on the current page and requires the
configured administrator session. It returns membership, not group details
or scan actions. Ordinary-only pages stop polling the controller after their
initial ownership check.
Combined report publication shows creating, pending, failed, and blocked
states. Failed or blocked publication can be retried from the group controls;
ambiguous native imports require operator review before retry.
