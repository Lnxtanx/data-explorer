---
title: Projects, Library & Team Collaboration
section: 13
area: collaboration
sources: 20
status: rough
---

# 13. Projects, Library & Team Collaboration

Scope: AI project CRUD and detail view, the AI Library surface, and the whole
team-collaboration stack (teams, members, invitations, agent shares, shared
connections, cross-tab sync, logout sweep). Artifact rendering internals are
Section 09; billing and seat purchase UI are Section 14. Those are referenced
here only where a collaboration hook reaches into them.

---

## Component / File Map

| File | Role in this section |
| --- | --- |
| `src/components/ai/AIChatProjects.tsx` | Projects grid + inline create form + delete; 249 lines |
| `src/components/ai/ProjectDetailView.tsx` | Single-project chat list; 225 lines |
| `src/components/ai/AIChatLibrary.tsx` | Library view (saved charts + connections); 225 lines |
| `src/components/ai/api/projects.ts` | `AIProject`/`ProjectChat` types + 6 project endpoints; 92 lines |
| `src/components/ai/hooks/useProjects.ts` | Project query keys + 5 hooks; 110 lines |
| `src/components/ai/hooks/useAIChats.ts` | Chat/messages/artifact keys; project-key invalidation; 188 lines |
| `src/components/ai/chat/hooks/usePinnedArtifacts.ts` | localStorage `sw_pinned_*` pin store; 114 lines |
| `src/components/collaboration/useTeamData.ts` | The whole collaboration data layer (queries, mutations, derivations); 480 lines |
| `src/components/collaboration/api/collaboration.ts` | Team/member/invite/billing/agent-share endpoints; 286 lines |
| `src/components/collaboration/types.ts` | `queryKeys`, `EMAIL_REGEX`, `SharedConn`, `LastInvite`, `AgentEntry`; 38 lines |
| `src/components/collaboration/primitives.tsx` | `SectionLabel`, `RoleBadge`, `ConfirmAction`; 70 lines |
| `src/components/collaboration/MembersPanel.tsx` | Invite form, member rows, pending invites, team settings; 413 lines |
| `src/components/collaboration/ProjectsPanel.tsx` | Share/unshare projects with team; 133 lines |
| `src/components/collaboration/AgentSharesPanel.tsx` | Share/unshare SW-Agent connectors; 136 lines |
| `src/components/collaboration/ConnectionsPanel.tsx` | Read-only shared-database list; 81 lines |
| `src/components/collaboration/InvitationReviewModal.tsx` | Accept/decline/sign-in invite dialog; 164 lines |
| `src/components/settings/CollaborationSettings.tsx` | Settings shell: team switcher, role badge, 4 tabs; 304 lines |
| `src/components/auth/inviteToken.ts` | `sessionStorage` `sw.pendingInvite` persistence; 41 lines |
| `src/components/auth/crossTab.ts` | localStorage-broadcast cross-tab sync; 68 lines |
| `src/components/auth/clearAllClientData.ts` | Logout/expiry data sweep; 130 lines |

Supporting files read to verify cross-references (not part of the assigned
set): `src/components/ai/api/charts.ts`, `src/components/ai/hooks/useCharts.ts`,
`src/components/ai/artifacts/ArtifactView.tsx`,
`src/components/ai/ArtifactHistory.tsx`, `src/components/ai/api/index.ts`,
`src/components/ai/AIChatMain.tsx`, `src/components/ai/AIChatSidebar.tsx`,
`src/components/auth/AuthProvider.tsx`, `src/components/auth/cookies.ts`,
`src/components/auth/context.ts`, `src/components/connector/api/types.ts`,
`src/components/connector/api/connectionTypes.ts`,
`src/components/connector/api/connectionKeys.ts`,
`src/components/connector/api/useConnections.ts`,
`src/components/connector/api/hooks.ts`,
`src/components/data-explorer/DataExplorerLayout.tsx`,
`src/pages/DataExplorerPage.tsx`, `src/shared/storage/registry.ts`,
`src/components/ai/storage/chatDrafts.ts`.

---

## 1. Projects

### 1.1 Data model — `AIProject`

Every field on the interface, with the dual camelCase/snake_case duplication the
code defends against (`src/components/ai/api/projects.ts:5-33`):

| Field | Type | Read at | Notes |
| --- | --- | --- | --- |
| `id` | `string` | `AIChatProjects.tsx:125`, `ProjectDetailView.tsx:41` | Primary key. |
| `userId` / `user_id` | `string \| null` (both optional) | `useTeamData.ts:141` | `useTeamData` and `ProjectsPanel` read only `user_id`. |
| `title` | `string` | `AIChatProjects.tsx:154`, `ProjectDetailView.tsx:66,84` | Non-optional in the type; create form refuses empty titles (`AIChatProjects.tsx:40`). |
| `description` | `string \| null` | `AIChatProjects.tsx:155-157`, `ProjectDetailView.tsx:97-101` | Rendered `line-clamp-2` on the card. |
| `connectionId` / `connection_id` | `string \| null` | `useTeamData.ts:202`, `ProjectsPanel.tsx:84` | `useTeamData` reads `connection_id` first then falls back to `(project as any).connectionId`; `ProjectsPanel` reads `connection_id` then `connectionId`. |
| `teamId` / `team_id` | `string \| null` | `AIChatProjects.tsx:111`, `ProjectDetailView.tsx:51`, `useTeamData.ts:140` | Presence is the *only* signal that a project is team-shared. |
| `teamName` / `team_name` | `string \| null` | `AIChatProjects.tsx:112`, `ProjectDetailView.tsx:52` | Falls back to the literal string `'Team Shared'`. |
| `ownerName` / `owner_name` | `string \| null` | `AIChatProjects.tsx:170-172`, `ProjectDetailView.tsx:92-96` | Shown as "Shared by …" only when `!isOwner`. |
| `ownerEmail` / `owner_email` | `string \| null` | same | Fallback display identity. |
| `isMine` / `is_mine` | `boolean` (both optional) | `AIChatProjects.tsx:113`, `ProjectDetailView.tsx:53` | **Defaults to `true` when absent** (`?? true`). Gates the delete button. |
| `context` | `string \| null` | nowhere in `src/` | Accepted by `updateProject` and `createProject`; no reader. |
| `color` | `'orange' \| 'purple' \| 'blue' \| 'green'` | `AIChatProjects.tsx:120-129`, `ProjectDetailView.tsx:62` | Non-optional in the type. |
| `fileCount` / `file_count` | `number` | nowhere in `src/` | Zero readers. See § Dead code. |
| `chatCount` / `chat_count` | `number` | `AIChatProjects.tsx:167` | Card subtitle, with singular/plural. |
| `createdAt` / `created_at` | `string` | nowhere in `src/` | Zero readers. |
| `updatedAt` / `updated_at` | `string` | `AIChatProjects.tsx:163` | Rendered via `formatTimeAgo`. |

`ProjectChat` (`src/components/ai/api/projects.ts:35-47`), the row shape the
detail view consumes:

| Field | Type | Read at |
| --- | --- | --- |
| `id` | `string` | `ProjectDetailView.tsx:143,176` |
| `title` | `string \| null` | `ProjectDetailView.tsx:151` (falls back `'New chat'`) |
| `messageCount` | `number` | `ProjectDetailView.tsx:163-165` (hidden when `0`) |
| `modelUsed` | `string \| null` | nowhere |
| `updatedAt` | `string` | `ProjectDetailView.tsx:161` |
| `contextTable` | `string \| null` | nowhere |
| `userId` | `string \| null` | nowhere |
| `authorName` / `authorEmail` / `authorAvatarUrl` | optional `string \| null` | name+email at `ProjectDetailView.tsx:166-169`; avatar never read |
| `isMine` | `boolean` (required) | `ProjectDetailView.tsx:152,166,173` — drives the "TEAM" badge, the "by <author>" line and the delete button |

### 1.2 Project metadata

* **Colour** — exactly four values: `['orange', 'purple', 'blue', 'green']`
  (`AIChatProjects.tsx:13`). Duplicated as two `Record`s of Tailwind classes:
  `colorClass` (`AIChatProjects.tsx:15-20`) for the icon tile, `dotClass`
  (`AIChatProjects.tsx:22-27`) for the picker swatches. Both records are copied
  verbatim into `ProjectDetailView.tsx:27-32`. Default on create is `'blue'`
  (`AIChatProjects.tsx:35`; `AIChatSidebar.tsx:781`). The card's hover border
  falls through to blue for any unrecognised value
  (`AIChatProjects.tsx:120-123`).
* **Icon** — not selectable. `FolderKanban` is hard-coded in both surfaces
  (`AIChatProjects.tsx:130`, `ProjectDetailView.tsx:63`).
* `updateProject` types `color` as plain `string`, not the four-value union
  (`src/components/ai/api/projects.ts:74`).

### 1.3 Endpoints

| Method | Path | Function | Caller |
| --- | --- | --- | --- |
| GET | `/api/ai/projects` | `listProjects` (`api/projects.ts:54-56`) | `useProjects` (`useProjects.ts:33`), `useTeamData` (`useTeamData.ts:131`) |
| POST | `/api/ai/projects` | `createProject` (`api/projects.ts:58-70`) | `useCreateProject` (`useProjects.ts:52`) |
| PUT | `/api/ai/projects/{projectId}` | `updateProject` (`api/projects.ts:72-80`) | `useTeamData.handleToggleProjectTeam` (`useTeamData.ts:442`) — **only** caller |
| DELETE | `/api/ai/projects/{projectId}` | `deleteProject` (`api/projects.ts:82-84`) | `useDeleteProject` (`useProjects.ts:86`) |
| GET | `/api/ai/projects/{projectId}/chats` | `getProjectChats` (`api/projects.ts:86-88`) | `useProjectChats` (`useProjects.ts:100`) |
| POST | `/api/ai/projects/{projectId}/chats/{chatId}` | `assignChatToProject` (`api/projects.ts:90-92`) | **none** — see § Dead code |

`createProject` accepts `connectionId`, `context` and `teamId`
(`api/projects.ts:58-65`) but neither create form ever sends them — both send
exactly `{ title, description?, color }` (`AIChatProjects.tsx:42`;
`AIChatSidebar.tsx:788-793`).

### 1.4 How chats are assigned to a project

The dedicated assignment endpoint is not used. Assignment happens two ways:

1. **At chat creation** — the active project id is threaded into the send path:
   `AIChatMain` receives `projectId` (`AIChatMain.tsx:61,239`), forwards it to the
   orchestrator, which puts it on the request
   (`chat/hooks/useChatSendOrchestrator.ts:307,318`).
2. **After creation** — `PATCH /api/ai/chats/{chatId}` with
   `{ projectId: string | null }` (`api/index.ts:233-251`), driven by
   `useUpdateAIChat` (`useAIChats.ts:110-123`) from the sidebar: detach
   (`AIChatSidebar.tsx:472`), move to another project
   (`AIChatSidebar.tsx:489`), assign from an ungrouped chat
   (`AIChatSidebar.tsx:669`).

Reading a chat back resolves the project as
`projectId || chatHistory?.chat?.project_id` (`AIChatMain.tsx:188`).

### 1.5 What a project scopes

A project is a grouping label over chats plus two optional attachments:

* `connectionId` — the connection the project is pinned to. It drives the
  "Shared Databases" derivation in `useTeamData.ts:200-211` and the connection
  name chip in `ProjectsPanel.tsx:84-110`.
* `context` — free text, accepted by the API, read by nothing
  (`api/projects.ts:62,74`).
* `teamId` — the sharing boundary. Team membership is what makes a project and
  its chats visible to other users.

It does **not** scope saved charts, pinned artifacts, artifact history, or
connections — those are keyed independently by chat id or connection id.

---

## 2. Project detail view

`src/components/ai/ProjectDetailView.tsx`. Reached from
`AIChatProjects.onOpenProject` → `DataExplorerLayout.tsx:631-636` sets
`activeProjectId` and `aiActiveView = 'project_detail'`.

**What it shows**

* Sticky header: back button, colour tile, title, team badge when
  `team_id || teamId` (`ProjectDetailView.tsx:58-74`).
* Hero: title, team badge, "Shared by &lt;owner&gt;" when `!isOwner` and an owner
  identity exists (`ProjectDetailView.tsx:85-96`), description, and a
  "New Chat" button (`ProjectDetailView.tsx:103-106`).
* "Recent Chats" with a count pill of `chats?.length || 0`
  (`ProjectDetailView.tsx:112-117`).
* One row per chat: title or `'New chat'`, a "TEAM" badge when `!chat.isMine`
  (`ProjectDetailView.tsx:152-156`), `formatTimeAgo(chat.updatedAt)`, message
  count when `> 0`, and `by &lt;authorName|authorEmail&gt;` for non-owned chats
  (`ProjectDetailView.tsx:158-171`).
* AlertDialog confirmation before deleting a chat, shown only for
  `chat.isMine` (`ProjectDetailView.tsx:173-185`, `:195-221`).

**Aggregation**

The project record is resolved by *client-side filter over the full list* —
`projects?.find(p => p.id === projectId)` (`ProjectDetailView.tsx:41`) — not by
a by-id fetch. There is no `GET /api/ai/projects/{id}`.

Chats come from a single unpaginated call to
`GET /api/ai/projects/{projectId}/chats`
(`ProjectDetailView.tsx:37` → `useProjects.ts:97-105`).

**Limits**

* `useProjectChats` sets `staleTime: 30_000`, no `gcTime`, `enabled: Boolean(projectId)`
  (`useProjects.ts:99-104`).
* The count pill is the length of the returned array, not a server `total` —
  `ProjectChatListResponse` has no `total` field (`api/projects.ts:50`).
* No pagination, no offset, no search, no sort.
* It aggregates **chats only**. No artifacts, no saved charts, no files.
  `fileCount` is present on the model and unused, so the "files" facet the model
  anticipates is not implemented.
* While `useProjects` is still loading, `project` is `undefined` and the view
  renders a permanent "Loading project…" spinner
  (`ProjectDetailView.tsx:43-49`) — it does not distinguish loading from
  not-found, so an unknown `projectId` spins forever.
* `AIChatProjects.onOpenProject` is optional
  (`AIChatProjects.tsx:183,234`); with no handler the card's `onClick` is a no-op.

---

## 3. Library

`src/components/ai/AIChatLibrary.tsx`. Two sections: **Saved Charts** and
**Connections**. No props (`AIChatLibrary.tsx:140`).

* Charts are fetched with `listCharts({ limit: 50 })` — hard-coded `50`
  (`AIChatLibrary.tsx:27`), `staleTime: 30_000` (`AIChatLibrary.tsx:28`).
* Search is **client-side only**: the query key is
  `chartQueryKeys.library(search)` = `['ai','charts', search]`
  (`AIChatLibrary.tsx:26`, `useCharts.ts:40`) but `queryFn` ignores the term
  entirely (`AIChatLibrary.tsx:27`) and the filter runs in `select` over
  `title` + `chartType` (`AIChatLibrary.tsx:29-36`). Every keystroke therefore
  allocates a fresh cache entry for byte-identical data — documented in the
  source at `useCharts.ts:30-39`.
* Card shows title, `CHART_TYPE_LABEL[chartType] ?? chartType`
  (`AIChatLibrary.tsx:18-20,83`), `formatTimeAgo(createdAt)`, and at most the
  **first 3** tags (`AIChatLibrary.tsx:86-94`), plus a pin glyph when
  `chart.pinned` (`AIChatLibrary.tsx:67`).
* Delete via `DELETE /api/ai/charts/{id}`, invalidating `chartQueryKeys.all`
  (`AIChatLibrary.tsx:40-46`, `charts.ts:96-100`).
* Connections table is **read-only**: name, database, health dot
  (`healthy`→green, `unhealthy`→red, else yellow, `AIChatLibrary.tsx:102-106`),
  `lastUsedAt`, and a `MoreHorizontal` button with **no `onClick`**
  (`AIChatLibrary.tsx:130-133`).

### 3.1 Store comparison — Library vs Pinned vs Artifact History

| | **Library (Saved Charts)** | **Pinned artifacts** | **Artifact History** |
| --- | --- | --- | --- |
| Store | Server, `ai_saved_charts`-style table | `localStorage`, key `sw_pinned_{chatId}` (`usePinnedArtifacts.ts:29,42,55`) | Server, via `GET /api/ai/artifacts` (`api/index.ts:303-317`) |
| Scope | Per user; no connection/chat scoping in the Library call | Per **chat id** | Cross-chat; optionally per connection |
| Producer | `POST /api/ai/charts/save` (`charts.ts:63-76`) via `useSaveChart` (`useCharts.ts:78-95`) — **no reachable UI trigger**, see §3.2 | `handlePinArtifact` (`usePinnedArtifacts.ts:66-91`), wired to `ArtifactView` `onPin` at `AIChatMain.tsx:639` | Implicit: written whenever an artifact is persisted with a chat |
| Reader | `AIChatLibrary.tsx:142` | `DashboardPanel` (`AIChatMain.tsx:702`) | `ArtifactHistory.tsx:141-148` |
| Item shape | `SavedChart` (`charts.ts:26-36`): `id, title, chartType, config, sqlQuery, schemaName, tags[], pinned, createdAt` | `AgentArtifact[]`, raw agent artifacts | `ArtifactHistoryItem` (`api/index.ts:288-296`): `id, messageId, chatId, chatTitle, connectionId, createdAt, artifact` |
| Query key | `['ai','charts', search]` (`useCharts.ts:40`) | none (localStorage) | `['ai','artifacts', connectionId, type]` (`useAIChats.ts:44`) |
| Delete UI | Yes — card trash (`AIChatLibrary.tsx:68-76`) | Yes — remove-by-index from `DashboardPanel` (`AIChatMain.tsx:704`) | No delete UI |
| Survives logout | Yes (server-side, re-fetched by cookie session) | **No** — swept by `clearSwLocalStorage` (`clearAllClientData.ts:34-44`) | Yes (server-side) |
| Fetch limit | `50` (`AIChatLibrary.tsx:27`) | unbounded array in one localStorage value | `50` (`ArtifactHistory.tsx:145`) |
| Pagination | none | n/a | none; `offset` always `0` (`useAIChats.ts:179`) |
| Search | client-side, title + chartType (`AIChatLibrary.tsx:31-36`) | n/a | server-side `search` param (`ArtifactHistory.tsx:144`) — **but** `search` is not part of the query key (`useAIChats.ts:44,173`), so changing it does not re-run the query |

The three are independent: nothing copies from pinned artifacts into the
Library, and the Library's `pinned` boolean (`charts.ts:34`, rendered at
`AIChatLibrary.tsx:67`) is a field on the saved-chart row with no connection to
`sw_pinned_*`.

### 3.2 VERDICT — the Library's saved-charts list has no producer

Section 09's suspicion is **confirmed**. Traced the only write path to
`POST /api/ai/charts/save`:

1. `saveChart` (`charts.ts:63-76`) has exactly one consumer, `useSaveChart`
   (`useCharts.ts:78-95`).
2. `useSaveChart` has exactly one consumer in the tree,
   `src/components/ai/artifacts/ArtifactView.tsx:351`.
3. The `.mutate` call is at `ArtifactView.tsx:611`, inside the inline `SaveForm`
   block whose guard is `{saveTarget && connectionId && artifact.sql && ...}`
   (`ArtifactView.tsx:597`).
4. `saveTarget` is initialised to `null` (`ArtifactView.tsx:347`) and the only
   two writes in the file are `setSaveTarget(null)` — `ArtifactView.tsx:602`
   and `ArtifactView.tsx:620`. A grep for `setSaveTarget` in the file returns
   exactly those four hits (declaration, guard, two resets). **Nothing ever
   assigns `'query'` or `'chart'`.**
5. The other candidate entry point, `exportActions`
   (`ArtifactView.tsx:432-454`), contains Excel / CSV / JSON / Copy TSV / PNG /
   HTML Report / PDF / Executive HTML / Executive PDF and **no** save entry.
   The header action row (`ArtifactView.tsx:552-592`) offers export, pin and
   expand only.

Conclusion: `saveTarget` is permanently `null`, the `SaveForm` is unreachable,
and `POST /api/ai/charts/save` is never invoked from the client. The Library's
"Saved Charts" grid is therefore permanently empty for any session that did not
inherit rows written by some other client or a backend-side job. Its empty-state
copy actively misleads: *"No saved charts yet. Ask Resona to generate a chart and
save it."* (`AIChatLibrary.tsx:184`) — there is no way to do the second half of
that sentence.

Corroborating dead-state signal in the same file: `savedLabel` is described in
source as write-only — *"it drives the 'Saved' feedback via setSavedLabel but is
never read back, so only the setter is referenced"* (`ArtifactView.tsx:348-350`),
i.e. the "Saved" badge that the unreachable form would have shown.

### 3.3 Library reachability

Even before the producer question, the Library view is **not navigable from the
UI**. `aiActiveView` accepts `'library'` (`DataExplorerLayout.tsx:159-166`) and
is restored from `localStorage['sw-data-explorer:ai-active-view']`
(`DataExplorerLayout.tsx:132,161-163`). But the sidebar's view switcher only
ever calls `onViewChange('projects')`, `onViewChange('artifacts')`
(`AIChatSidebar.tsx:247,261`) — a repo-wide grep for `onViewChange('library')`
returns nothing. The Library renders only if the persisted key already holds
`'library'` (e.g. written by an older build).

A stale entry point is durable in one direction: once `aiActiveView === 'library'`
is persisted, the effect at `DataExplorerLayout.tsx:314-317` keeps rewriting it,
and nothing in the current UI can leave. `AIChatSidebar.tsx:58-59` still declares
`'library'` in the `activeView` union.

The `useConnections` used by the Library (`AIChatLibrary.tsx:143`) is the shared
hook keyed by `['connections','list',userId]` (`useConnections.ts:26`,
`connectionKeys.ts:32`); a local duplicate under `['connections','list']` was
deleted in an earlier phase and the reason is recorded in-place
(`AIChatLibrary.tsx:48-53`).

---

## 4. Team collaboration model

### 4.1 Entities

**Team** (`api/collaboration.ts:3-14`): `id`, `name`, `slug?`, `owner_id?`,
`avatar_url?`, `settings?: Record<string, unknown>`, `role?`
(`'owner'|'admin'|'member'`), `is_owner?`, `created_at`, `updated_at`.
Only `id`, `name` and `is_owner` are read by the UI
(`CollaborationSettings.tsx:43,157-163`; `useTeamData.ts:93`).

There is no separate "workspace" concept in this codebase — a team *is* the
workspace. `Team.settings` has no reader.

**TeamMember** (`api/collaboration.ts:24-32`): `user_id`, `role`, `joined_at`,
`email`, `full_name`, `avatar_url`, `is_owner`. The members response also carries
`currentRole` — the caller's own role (`api/collaboration.ts:34-37`). Every
permission decision in the UI derives from that one field
(`useTeamData.ts:103`).

**TeamInvitation** (`api/collaboration.ts:39-51`): `id`, `team_id`, `email`,
`role: 'admin' | 'member'`, `status: 'pending' | 'accepted' | 'declined' |
'expired' | 'revoked'`, `token?`, `link?`, `invited_by`, `expires_at`,
`accepted_at?`, `created_at`.

**InvitationInfo** (`api/collaboration.ts:54-67`), the public pre-accept payload:
`id`, `type: 'team' | 'project'`, `projectId?`, `teamId?`, `teamName?`,
`projectName?`, `inviterName`, `role`, `email`, `status`, `expiresAt`,
`expired?`. Note `projectId` / `projectName` / `type: 'project'` exist and
`getInvitationInfo` has a project branch (`api/collaboration.ts:240-245`), but
the only caller always passes `'team'`
(`DataExplorerPage.tsx:244`) and `storePendingInvite` is only ever called with
`'team'` (`DataExplorerPage.tsx:235,312`).

**SharedConn** (`types.ts:13-21`): `id`, `name`, `database`,
`source: 'project' | 'agent'`, `sharedBy: string | null`, `machineLabel?`,
`isOnline?`.

**AgentEntry** (`types.ts:29-38`): `id`, `agent_id`, `machine_label`,
`is_online?`, `is_shared`, `share_id?`, `shared_by_name?`, `is_own`.

**TeamAgentShare** (`api/collaboration.ts:249-262`): `id`, `team_id`,
`team_name?`, `registration_id`, `agent_id`, `machine_label`, `shared_by`,
`shared_by_name`, `shared_by_email`, `shared_at?`, `created_at?`,
`owner_user_id?`.

### 4.2 Roles

Three values only: `'owner' | 'admin' | 'member'`
(`api/collaboration.ts:10,26`). `'owner'` is never assignable — both the invite
`Select` and the role-change API accept only `'admin' | 'member'`
(`MembersPanel.tsx:113-114`; `api/collaboration.ts:101,116`).

Derived flags:

* `currentRole` — `memberData?.currentRole ?? null` (`useTeamData.ts:103`).
* `canManage` — `currentRole === 'owner' || currentRole === 'admin'`
  (`useTeamData.ts:104`).
* `canChangeRoles` — `currentRole === 'owner'` (`MembersPanel.tsx:88`).
* `isOwner` — `selectedTeam?.is_owner ?? currentRole === 'owner'`
  (`CollaborationSettings.tsx:43`). Note the team's own `is_owner` boolean takes
  precedence over `currentRole`.

All four collapse to "hide the button" when no team is selected, because the
members query that supplies `currentRole` is gated on `!!selectedTeamId`
(`useTeamData.ts:98`).

### 4.3 Role × capability matrix

Derived strictly from the client-side checks in the cited files. "Guard" is
what the UI does; nothing here is a server-side authorisation claim.

| Capability | member | admin | owner | Guard / citation |
| --- | --- | --- | --- | --- |
| See team switcher + own role | yes | yes | yes | no role check (`CollaborationSettings.tsx:157-183`) |
| See shared-DB list | yes | yes | yes | no role check — `ConnectionsPanel` takes no `canManage` prop (`ConnectionsPanel.tsx:7-11,13`) |
| See member roster (names/emails) | yes | yes | yes | `enabled: !!selectedTeamId` only (`useTeamData.ts:98`) |
| See seat usage badge | yes | yes | yes | no role check (`CollaborationSettings.tsx:200-214`) |
| Create a team | yes | yes | yes | no role check — `New Team` is unconditional (`CollaborationSettings.tsx:112`); backend `POST /api/teams` is unconstrained from the client |
| Invite as `member` | no (hidden) | yes | yes | `canManage` wraps the whole invite form (`MembersPanel.tsx:92`) |
| Invite as `admin` | no | no (SelectItem `disabled`) | yes | `canManage` **and** `disabled={!isOwner}` (`MembersPanel.tsx:114`) |
| List pending invitations | no (query disabled) | yes | yes | `enabled: !!selectedTeamId && canManage` (`useTeamData.ts:112`) |
| Revoke an invitation | no | yes | yes | rendered inside the `canManage` block (`MembersPanel.tsx:283`); no per-invite ownership check |
| Remove another member | no | yes | yes | `removable = canManage && !member.is_owner && !isSelf` (`MembersPanel.tsx:199`) |
| Change a member's role | no | no | yes | `roleEditable = canChangeRoles && !member.is_owner && !isSelf` (`MembersPanel.tsx:88,200`) |
| Rename team | no | no | yes | `isOwner && selectedTeam` block (`MembersPanel.tsx:359`) |
| Delete team | no | no | yes | same block, plus type-the-name guard (`MembersPanel.tsx:385`) |
| Leave team | yes | yes | **no** | button rendered only when `!isOwner` (`CollaborationSettings.tsx:177`) |
| Share / unshare an SW-Agent connector | no | yes | yes | `{canManage && (<Button …>)}` (`AgentSharesPanel.tsx:106`) |
| Share / unshare a **project** with the team | **yes** | yes | yes | **no role check at all** — see §7.3 |
| Delete a project | — | — | — | `is_mine` from the server payload, defaulting to `true` when absent (`AIChatProjects.tsx:113,139`) |
| Delete a chat inside a project | — | — | — | `chat.isMine` from the server payload (`ProjectDetailView.tsx:173`) |

Two capabilities are **not role-scoped at all**: creating a team, and
toggling a project's team membership. Both are enforced, if at all, by the
backend.

### 4.4 Endpoints

| Method | Path | Function | Called from |
| --- | --- | --- | --- |
| GET | `/api/teams` | `listTeams` (`:69-71`) | `useTeamData.ts:59` |
| GET | `/api/teams/{id}` | `getTeam` (`:73-75`) | **none** |
| POST | `/api/teams` | `createTeam` (`:77-83`) | `useTeamData.ts:373`; also `PlansSettings.tsx:361` with `intent: 'team_plan_purchase'` (Section 14) |
| GET | `/api/teams/{id}/members` | `getTeamMembers` (`:85-89`) | `useTeamData.ts:97` |
| POST | `/api/teams/{id}/invites` | `inviteTeamMember` (`:99-104`) | `useTeamData.ts:395` |
| DELETE | `/api/teams/{id}/members/{userId}` | `removeTeamMember` (`:106-111`) | `useTeamData.ts:306` |
| PATCH | `/api/teams/{id}/members/{userId}` | `updateTeamMemberRole` (`:113-122`) | `useTeamData.ts:318` |
| POST | `/api/teams/{id}/leave` | `leaveTeam` (`:124-126`) | `useTeamData.ts:336` |
| DELETE | `/api/teams/{id}` | `deleteTeam` (`:128-130`) | `useTeamData.ts:347` |
| PATCH | `/api/teams/{id}` | `renameTeam` (`:132-140`) | `useTeamData.ts:359` |
| GET | `/api/teams/{id}/seats` | `getTeamSeats` (`:196-198`) | `useTeamData.ts:123` |
| GET | `/api/teams/{id}/billing` | `getTeamBillingStatus` (`:200-202`) | `PlansSettings.tsx:172` (Section 14) |
| POST | `/api/teams/{id}/billing/orders` | `createTeamSeatOrder` (`:204-209`) | `PlansSettings.tsx:367,392` (Section 14) |
| GET | `/api/teams/{id}/invitations` | `getTeamInvitations` (`:211-215`) | `useTeamData.ts:110` |
| DELETE | `/api/teams/{id}/invitations/{inviteId}` | `revokeTeamInvitation` (`:217-222`) | `useTeamData.ts:327` |
| POST | `/api/teams/invitations/accept` | `acceptTeamInvitation` (`:224-228`) | `DataExplorerPage.tsx:277` |
| POST | `/api/teams/{id}/invitations/{inviteId}/decline` | `declineTeamInvitation` (`:230-235`) | `DataExplorerPage.tsx:298` |
| GET | `/api/teams/invitations/info/{token}` | `getInvitationInfo(token,'team')` (`:240-245`) | `DataExplorerPage.tsx:244` |
| GET | `/api/files/projects/invitations/info/{token}` | same fn, `type='project'` branch (`:243`) | **none** |
| GET | `/api/teams/{id}/shares/agents` | `listTeamAgentShares` (`:265-267`) | `useTeamData.ts:162` |
| POST | `/api/teams/{id}/shares/agents` | `shareAgentWithTeam` (`:273-281`) | `useTeamData.ts:286` |
| DELETE | `/api/teams/{id}/shares/agents/{shareId}` | `unshareAgentFromTeam` (`:284-286`) | `useTeamData.ts:296` |

`getInvitationInfo` is a `GET` with the bearer token in the **path**
(`api/collaboration.ts:242`). It is deliberately public — the modal must render
before sign-in (`InvitationReviewModal.tsx:110-118`).

### 4.5 Query keys

All under `['collaboration', …]` (`types.ts:1-9`):

`teams`, `members(teamId)`, `invites(teamId)`, `projects`, `seats(teamId)`,
`teamBilling(teamId)`, `agentShares(teamId)`.

Note `queryKeys.projects = ['collaboration','projects']` is a **second, parallel
cache entry for the same `listProjects()` fetch** as
`projectQueryKeys.list() = ['ai','projects','list']`
(`types.ts:5`, `useProjects.ts:22`). See §11 for the invalidation consequences.

---

## 5. Members

### 5.1 List

Source: `GET /api/teams/{id}/members` (`useTeamData.ts:95-100`), gated on
`!!selectedTeamId`, with `refetchOnWindowFocus: true`. Rendered by
`MembersPanel.tsx:197-277`.

Row: 32px avatar circle showing `<img src={member.avatar_url}>` when present,
else the first character of `full_name || email || '?'`
(`MembersPanel.tsx:205-209`); name falling back to the literal
`'Team Member'` (`MembersPanel.tsx:211`); email (`MembersPanel.tsx:212`); an
amber `OWNER` badge when `member.is_owner` (`MembersPanel.tsx:216-220`); and a
`RoleBadge` — a `Badge variant="secondary"` rendering the raw role string
uppercased (`primitives.tsx:18-24`).

Section header carries the count: `Active Members ({members.length})`
(`MembersPanel.tsx:171`), plus a per-section Refresh that invalidates
`queryKeys.members(selectedTeamId!)` (`MembersPanel.tsx:172-182`). Skeleton
count is `2` (`MembersPanel.tsx:186`).

### 5.2 Status

There is **no per-member status field** in `TeamMember`
(`api/collaboration.ts:24-32`) — no `pending` / `active` distinction. Every row
in `members` is treated as active. "Pending" exists only on the *invitation*
side: `TeamInvitation.status` (`api/collaboration.ts:44`) and the derived
`pendingInvites = invitations.filter(i => i.status === 'pending')`
(`useTeamData.ts:116-119`).

### 5.3 Per-member limits

**None exist.** `TeamMember` carries no credit, quota or seat field
(`api/collaboration.ts:24-32`); there is no per-member limit concept anywhere in
`src/components/collaboration/`. Credit limits in this app are strictly
per-user and live in the billing layer
(`auth/api/index.ts:51-52`, `ai/hooks/useAIUsage.ts:64,70` — Section 14).

The only limit in this section is team-wide seat capacity:
`seatsFull = !!seatsData && seatsData.occupied >= seatsData.seats`
(`useTeamData.ts:126`), where `TeamSeats = { seats: number; occupied: number }`
(`api/collaboration.ts:142-145`). It is used to disable the Invite button
(`MembersPanel.tsx:117`) and to render the amber "Seat limit reached" notice
(`CollaborationSettings.tsx:206-219`). Whether the backend independently
enforces the cap when seats are full is not determinable from the client.

### 5.4 Actions

* **Change role** — owner-only dropdown with two items, "Promote to Admin"
  (`disabled` when already admin) and "Demote to Member" (`disabled` when already
  member) (`MembersPanel.tsx:223-252,238-249`). Hidden for the owner row and for
  self (`MembersPanel.tsx:200`). Single `ConfirmAction` is **not** used here — the
  change fires immediately on menu click.
* **Remove** — `ConfirmAction` dialog titled
  `Remove <name>?` with the description *"They immediately lose access to
  everything shared with this team. Projects they created are automatically
  unshared from the team (their ownership is untouched)."*
  (`MembersPanel.tsx:254-273,257`), confirm label `Remove Member`. Hidden for
  the owner row and for self (`MembersPanel.tsx:199`). **No per-invitation or
  seat accounting is surfaced in the dialog.**
* **Leave team** — from the role card, non-owners only, description: *"You will
  immediately lose access to all projects and databases shared with this team.
  Your own projects are automatically unshared from it."*
  (`CollaborationSettings.tsx:177-195,180`).
* **Rename / delete team** — owner-only; delete requires typing the exact team
  name (`MembersPanel.tsx:385`, input at `:392-398`).

`ConfirmAction` (`primitives.tsx:37-69`) is the shared confirmation primitive: it
calls `e.preventDefault()` on the action and closes itself before invoking
`onConfirm` (`primitives.tsx:56-60`), and the confirm button is disabled while
`processing || !confirmEnabled` (`primitives.tsx:61`). Radix's
`AlertDialogAction` normally closes the dialog on click; the `preventDefault`
here means the dialog is dismissed by `setOpen(false)` instead
(`primitives.tsx:58`).

---

## 6. Invitations

### 6.1 Lifecycle

| Stage | Mechanism | Citation |
| --- | --- | --- |
| **Create** | `POST /api/teams/{id}/invites` with `{ email, role }`. Email validated client-side against `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` before the call. | `api/collaboration.ts:99-104`; `types.ts:11`; `useTeamData.ts:389-395` |
| **List** | `GET /api/teams/{id}/invitations`, admin+ only. | `useTeamData.ts:106-114` |
| **Review** | `GET /api/teams/invitations/info/{token}`, unauthenticated, token in path. | `api/collaboration.ts:240-245`; `DataExplorerPage.tsx:244` |
| **Accept** | `POST /api/teams/invitations/accept` with `{ token }` only — no email, no user id, no invite id. | `api/collaboration.ts:224-228`; `DataExplorerPage.tsx:277` |
| **Decline** | `POST /api/teams/{id}/invitations/{inviteId}/decline`, requires both team id and invite id (both come from the public info endpoint). | `api/collaboration.ts:230-235`; `DataExplorerPage.tsx:297-298` |
| **Revoke** | `DELETE /api/teams/{id}/invitations/{inviteId}`, admin+. | `api/collaboration.ts:217-222`; `useTeamData.ts:327` |

### 6.2 Create-side behaviour

`handleInvite` (`useTeamData.ts:386-424`):

1. Trims the email and rejects it if `EMAIL_REGEX` fails (`:388-392`).
2. Calls the API, then **awaits three invalidations in sequence** — members,
   invites, seats (`:397-399`).
3. Builds the shareable link (`:401-406`): prefers `res.invitation.link`;
   otherwise `res.invitation.token` → `/?teamInvite={token}`; a relative path is
   prefixed with `window.location.origin` (`:404-405`). If a link cannot be
   derived at all, `lastInvite` is set to `null` (`:408-410`).
4. Email status is read from `res.email ?? { configured: true, sent: true }`
   (`:402`) — i.e. **absence of the field is treated as success**. Three toast
   branches: not configured (`:412-413`), configured but unsent (`:414-415`),
   sent (`:416-418`).

`InviteTeamMemberResult` also types `message?: string` (`api/collaboration.ts:92`)
which no caller reads.

`copyInviteLink` copies to the clipboard and resets its `copiedLink` flag after
**2000 ms** (`useTeamData.ts:426-437,432`).

### 6.3 The review modal

`src/components/collaboration/InvitationReviewModal.tsx`. Renders `null` when
`invitation` is falsy (`:40`).

* Email comparison is case-insensitive via
  `normalizeEmail = (v) => (v||'').trim().toLowerCase()` (`:26-27`).
* `isExpired = invitation.expired === true` (`:45`).
* `isWrongAccount = !isExpired && isAuthenticated && !!currentUserEmail &&
  normalize(currentUserEmail) !== normalize(invitation.email)` (`:46-50`).
* `canAccept = isAuthenticated && !isExpired && !isWrongAccount` (`:52`).

Three warning banners: expired (`:93-98`), wrong account (`:100-108`), not signed
in (`:110-118`). Footer has four mutually exclusive renderings (`:122-159`):
accept+decline; expired (Close + disabled `Expired`); wrong account (Decline +
disabled `Wrong Account`); unauthenticated (**Later** + **Sign in to Accept**).

`currentUserEmail` is optional (`:21`); when it is absent the wrong-account check
cannot fire, so `canAccept` reduces to "signed in and not expired".

### 6.4 Token mechanics and the OAuth round-trip

`src/components/auth/inviteToken.ts` — one key:

* Storage: **`sessionStorage`**, key **`sw.pendingInvite`** (`inviteToken.ts:5,14`).
* Payload: `StoredInvite = { t: string; k: 'team' | 'project' }`
  (`inviteToken.ts:7-10`) — `t` is the token, `k` the invite kind.
* `storePendingInvite` swallows storage exceptions silently; the inline comment
  notes the invite still works if the user completes login without navigating
  away (`inviteToken.ts:12-19`).
* `getPendingInvite` validates shape at read time — both `t` and `k` must be
  `typeof 'string'`, otherwise `null` (`inviteToken.ts:21-33`).
* `clearPendingInvite` (`:35-41`).

Round-trip sequence (`DataExplorerPage.tsx:229-260`), run **once** on mount
(`:260`):

1. Read `?teamInvite=` from the URL (`:231`).
2. If present, `storePendingInvite(urlToken, 'team')` (`:234-236`).
3. `const teamInviteToken = urlToken || (stored?.k === 'team' ? stored.t : null)`
   (`:238`) — the URL wins; storage is the fallback for the post-OAuth reload
   where the query string is gone.
4. `getInvitationInfo(token, 'team')` → `setPendingInviteInfo` (`:242-255`).
   On failure: toast `Invalid or expired invitation link`, `clearPendingInvite()`,
   and `history.replaceState` to strip the query string (`:246-253`).
5. If no token at all, `clearPendingInvite()` — drops stale storage from previous
   sessions (`:256-259`).

`handleSignInForInvite` re-stores the token immediately before
`signInWithGoogle()` (`:310-315`). It is hard-wired to **Google only**; the
GitHub button in the signed-out collaboration panel (`CollaborationSettings.tsx:74-83`)
is unrelated and cannot carry an invite. `CollaborationSettings.tsx:19`
destructures `signInWithGithub` and uses it only for the signed-out panel.

On success, `handleAcceptInvite` calls `refetchConnections()`,
`clearPendingInvite()`, and strips the URL (`:277-285`).
`handleDeclineInvite` clears local state regardless of whether the backend
decline succeeded — the catch only logs (`logger.warn('Backend decline failed')`,
`:300-302`) and then `clearPendingInvite()` runs (`:303`).

### 6.5 Storage keys touched by this section

| Store | Key | Written | Cleared by |
| --- | --- | --- | --- |
| sessionStorage | `sw.pendingInvite` | `inviteToken.ts:14` | `inviteToken.ts:37`, `clearAllClientData.ts:60`, `DataExplorerPage.tsx:251,258,281,303` |
| localStorage | `sw_active_team_id` | `useTeamData.ts:47` | `useTeamData.ts:49`, `clearAllClientData.ts:34-44` |
| localStorage | `sw_pinned_{chatId}` | `usePinnedArtifacts.ts:55` | `clearAllClientData.ts:34-44` |
| localStorage | `sw-data-explorer:ai-active-view` | `DataExplorerLayout.tsx:316` | `clearAllClientData.ts:34-44` |
| localStorage | `sw-data-explorer:active-project-id` | `DataExplorerLayout.tsx:322,348` | `clearAllClientData.ts:34-44` |

Neither `sw_active_team_id` nor `sw_pinned_*` is registered with
`@/shared/storage/registry` — a repo-wide grep for `registerKey` shows only
`ai/storage/chatDrafts.ts:98` (`'ai-agent'`),
`data-explorer/storage/grid-storage.ts:106,176` and
`data-explorer/storage/explorer-preferences.ts:65,105` (both `'data-explorer'`).
They are removed only by the exhaustive sweep.

---

## 7. Shared connections

### 7.1 Derivation — `useTeamData.sharedConnections`

`src/components/collaboration/useTeamData.ts:199-227`. Two sources, merged and
de-duplicated by connection `id`:

**Source A — via projects** (`:200-211`): take every project whose
`team_id === selectedTeamId`, collect
`p.connection_id || (p as any).connectionId`, drop falsy, `Set`-dedupe, map each
id through `connections?.find(c => c.id === id)`. Missing connections degrade to
`name: 'Shared Connection'`, `database: 'postgres'`, `source: 'project'`,
`sharedBy: null` (`:206-210`).

**Source B — via connectors/agents** (`:212-225`): for each connection,
`isFromSharedAgent = Boolean(conn.agent_id && sharedAgentIds.has(conn.agent_id))`
or `isTeamConnForThisTeam = Boolean(conn.access_type === 'team' &&
(!conn.team_name || (selectedTeam && conn.team_name === selectedTeam.name)))`
(`:213-217`). Note the second clause: a team-tagged connection with **no**
`team_name` is treated as belonging to whatever team is currently selected.
Pushed only if not already present (`:218`).

`sharedAgentIds` is the set of `agent_id`s across
`GET /api/teams/{id}/shares/agents` (`useTeamData.ts:166-169`).

`connections` comes from the shared `useConnections()` hook
(`useTeamData.ts:147` → `useConnections.ts:22-41`), which polls every **8 s**
when any connection reports `is_online`, otherwise every **4 s**
(`useConnections.ts:31-37`), `staleTime: 2_000`.

### 7.2 `access_type` values

`'owner' | 'team'`, optional — declared independently for connections
(`connectionTypes.ts:36`) and for connector registrations
(`connector/api/types.ts:19`, with the comment *"present on shared agents
(`access_type:'team'`), own agents always carry `access_type:'owner'`"*).
`connectionCrud.ts:48-49,67-68` defaults it to `'owner'` when absent.

Consumers in the collaboration layer:

* `myAgents` filter drops any connector that is `status === 'revoked'` **or**
  `access_type === 'team'` (`useTeamData.ts:153`), then dedupes by `agent_id`.
* The `isTeamConnForThisTeam` test above (`useTeamData.ts:215`).

Elsewhere: `DataExplorerLayout.tsx:154` derives
`connectionAccess = selectedConnection?.access_type ?? 'owner'` and passes it
down as `accessType` (`:547`); `DashboardView.tsx:74,290`; `ConnectorList.tsx:118`;
`ConnectorOverview.tsx:197`; `ConnectorSettings.tsx:80`;
`ConnectionSelector.tsx:117,126`.

### 7.3 What the UI permits

`ConnectionsPanel` is **purely read-only**. Its props are
`sharedConnections`, `isRefreshingDbs`, `handleRefreshSharedDbs`
(`ConnectionsPanel.tsx:7-11`) — no `canManage`, no actions. Each row shows name,
an online dot when `isOnline !== undefined` (`ConnectionsPanel.tsx:56-64`),
`database` plus `· machineLabel` when present (`:66-69`), and a badge reading
`Agent` or `Project` from `conn.source` (`:71-73`). The header carries the count
and a Refresh button (`:24-34`). Empty state names the two sharing routes
(`:41-44`).

### 7.4 Cross-check on "team-sharing enforcement may be client-side only"

Section 02's finding holds, and this section adds detail:

* `SharedConn.sharedBy` is typed and populated
  (`types.ts:17`; `useTeamData.ts:209,222`) but **never rendered** —
  `ConnectionsPanel` has no reference to it. Dead field.
* The membership decision in `sharedConnections` is a **client-side filter over
  `/api/connections` data already in the browser**
  (`useTeamData.ts:199-227`). It cannot grant anything; it can only hide.
* The one place the flag is turned into a capability is
  `DataExplorerLayout.tsx:154,547`, passing `accessType` down. Whatever is
  hidden behind that prop is Section 02's territory; from here the only
  observable fact is that the decision is made in the browser from
  `selectedConnection.access_type`.
* `isTeamConnForThisTeam`'s `!conn.team_name` clause (`useTeamData.ts:216`) means
  an untagged team connection is attributed to *every* team the user switches
  to. Whether the backend ever emits `access_type: 'team'` without `team_name`
  cannot be determined from the client.

UNVERIFIED: whether the backend filters `/api/connections` to team-visible rows only, or returns every row with an `access_type` discriminator and relies on client filtering.

---

## 8. Agent shares

### 8.1 What an "agent share" is

A `TeamAgentShare` row (`api/collaboration.ts:249-262`) records that one
registered SW-Agent connector (`agent_id` + `registration_id` + `machine_label`)
has been attached to one team (`team_id`), together with who did it
(`shared_by`, `shared_by_name`, `shared_by_email`, `shared_at`).

The API doc-comment states the grant explicitly: *"Share one of my SW-Agents
(and ALL of its databases) with the team. Owner/admin + paid plan required."*
(`api/collaboration.ts:269-272`) and *"Remove an agent share from the team.
Owner/admin required."* (`:283`).

So the grant is **connector-level, all-inclusive**: every database that
connector hosts becomes visible to the team. There is no per-database or
per-table selection anywhere in this section.

Both of those requirements are **backend assertions only** — no client code
checks for a paid plan or a role beyond `canManage` before firing the request
(`AgentSharesPanel.tsx:106-117`; `useTeamData.ts:285-293`).

### 8.2 The merged list — `allAgentEntries`

`useTeamData.ts:171-197`, `AgentEntry[]` (`types.ts:29-38`):

1. For each of `myAgents`: `is_shared: Boolean(share)` where `share` is found by
   `agent_id`; `share_id: share?.id`; `is_own: true` (`:175-183`).
2. For each share whose `agent_id` is not already covered: synthesise an entry
   with `machine_label: s.machine_label || 'Connector'`, `is_shared: true`,
   `share_id: s.id`, `is_own: false`, and `is_online` looked up from the
   viewer's own `connectors` list (`:184-195`). This is the **other user's
   agent as seen through the share** — it appears in this member's connector
   list even though it is not theirs.

### 8.3 UI

`AgentSharesPanel.tsx`. Section label `Connectors ({allAgentEntries.length})`
(`:36`). Row: machine label, a `Shared` badge when `is_shared`
(`:85-87`), online dot when `is_online !== undefined` (`:88-96`), then the
monospace `agent_id` and `· shared by {shared_by_name}` when
`shared_by_name && !is_own` (`:98-103`).

Action button — the **only** role-gated collaboration action besides member
management — is wrapped in `{canManage && …}` (`:106`). Its handler branches on
`agent.is_shared && agent.share_id`: unshare by **`share_id`** if shared,
otherwise share by **`agent_id`** (`:111-117`). Both buttons disable while either
mutation is pending (`:110`). Label flips `Share with Team` / `Unshare`
(`:124-127`). Panel Refresh invalidates `agentShares(selectedTeamId)` and
`connectorKeys.list` (`:41-42`).

`shareAgentMutation` surfaces the backend's `already_shared` flag as a distinct
toast — `'Agent was already shared'` (`useTeamData.ts:290`).

### 8.4 Downstream effect

Once shared, the agent's databases appear to every team member because
`sharedAgentIds` feeds `sharedConnections` source B
(`useTeamData.ts:213`), and because `listConnectors` returns
`access_type: 'team'` entries which `useConnections` surfaces
(`connectionCrud.ts:48-49,67-68`).

### 8.5 Mechanism summary (security-relevant, factual)

* Create: `POST /api/teams/{teamId}/shares/agents` body `{ agentId }` where
  `agentId` is the connector's `agent_id` string (e.g. `agt_laptop_abc123`, per
  the type comment at `connector/api/types.ts:9`) — **not** the registration id.
* Revoke: `DELETE /api/teams/{teamId}/shares/agents/{shareId}` where `shareId` is
  the share row id.
* Revocation is keyed on the share row, so a member who did not create the share
  can still unshare it, as long as they are admin or owner.
* There is **no scoping granularity**: sharing a connector shares every
  database it hosts.

---

## 9. Cross-tab sync

`src/components/auth/crossTab.ts`.

**Mechanism: `localStorage` used as a broadcast channel, consumed via the
`storage` event.** Not `BroadcastChannel`.

* Channel key: **`sw_sync_channel`** (`crossTab.ts:22`).
* Tab identity: `TAB_ID = \`tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}\``,
  computed **once at module load** (`crossTab.ts:23`).
* Message shape (`crossTab.ts:15-20`):
  `{ type: 'session_changed' | 'logout'; payload?: any; timestamp: number; tabId: string }`.

`broadcastSync(message)` (`:28-44`):
1. Stamps `timestamp` and `tabId` (`:29-33`).
2. `localStorage.setItem(SYNC_CHANNEL_KEY, JSON.stringify(fullMessage))` (`:36`).
3. `setTimeout(..., 100)` → `localStorage.removeItem(SYNC_CHANNEL_KEY)` (`:39-43`).

`subscribeToSync(cb)` (`:49-67`): listens for `storage`; **ignores any event
whose `key !== SYNC_CHANNEL_KEY` or whose `newValue` is falsy** (`:51`); parses
JSON in a try/catch that silently drops malformed messages (`:53-62`); and
**ignores messages whose `tabId === TAB_ID`** (`:57`). Returns an unsubscribe
closure (`:66`).

**What propagates**

| Message | Broadcast at | Handled at | Effect in the receiving tab |
| --- | --- | --- | --- |
| `session_changed` | `AuthProvider.tsx:69-74` (Google), `:124-129` (GitHub), payload `{ userId }` | `AuthProvider.tsx:335-345` | `setUser` with a minimal stub (`email: ''`, empty metadata); profile fetched separately |
| `logout` | `AuthProvider.tsx:216` | `AuthProvider.tsx:324-334` | Only if `getSessionCookie()` returns falsy in this tab: `queryClient.clear()`, `purgeExplorerCacheDb()`, `clearAllClientData()`, `setUser(null)`, toast `Logged out from another tab` |

**What does not propagate**: React Query caches (not shared), team state, the
active-team selection, invitations, or any list data. Teams/members/invites are
reconciled by `refetchOnWindowFocus: true` on the three collaboration queries
(`useTeamData.ts:63,99,113`) rather than by broadcast.

**Edge behaviours worth knowing**

* Because the key is removed 100 ms after being set, **two broadcasts within
  100 ms overwrite each other** — the second `setItem` wins and the first
  message is never delivered. `session_changed` and `logout` both write the same
  key.
* The channel is write-then-delete, so a tab that is backgrounded past the
  100 ms cleanup still receives the `setItem` event; a tab opened *after* the
  write receives nothing. There is no replay.
* The cleanup `removeItem` fires a second `storage` event in other tabs with
  `newValue === null`, which is filtered at `crossTab.ts:51`.
* An earlier phase removed the network-status half of this module (`getNetworkStatus`,
  `subscribeToNetworkStatus`, `getTabId`) as zero-consumer; the reason is
  recorded at `crossTab.ts:5-9`.

---

## 10. Data lifecycle / logout

`src/components/auth/clearAllClientData.ts`. Called from `signOut()`
(`AuthProvider.tsx:213`) and from the cross-tab logout handler
(`AuthProvider.tsx:331`). The doc-comment says it is also called from the
`auth:unauthorized` handler (`:117-119`) — the smart-401 path calls `signOut()`
(`AuthProvider.tsx:242,275`) rather than calling it directly.

### 10.1 What is cleared

| Target | Behaviour | Citation |
| --- | --- | --- |
| **localStorage** | Exhaustive sweep by exclusion: every key not in the allowlist is `removeItem`'d. Iterates `localStorage.length`, collecting first, deleting after, so index mutation is safe. | `clearAllClientData.ts:30-50,34-44` |
| **sessionStorage** | `sessionStorage.clear()` — all entries. Explicitly documented as wiping `sw_ds_*` AI dataset caches and pending invites. | `:57-65,53-56` |
| **Client session cookie** | `deleteSessionCookie()` (cookie `sw_session`, `cookies.ts:112`). | `:74` |
| **CSRF cookie** | `deleteCookie('_csrf')` (httpOnly: false, so client-deletable). | `:77` |
| **In-memory CSRF token** | `clearCsrfToken()`. | `:80` |
| **All other non-httpOnly cookies** | Parses `document.cookie`, and for each name writes two expired cookies — one with `path=/`, one with `path=${window.location.pathname}`. | `:83-93,89-90` |
| **CacheStorage** | `window.caches.keys()` then `Promise.all(delete)` for every entry. | `:102-114,104-106` |
| **Chat drafts** | `clearAllDrafts()` — sweeps the `sw_draft:` namespace (`ai/storage/chatDrafts.ts:18,125`). Called as "redundant with the localStorage sweep" but kept as the namespace-aware path. | `:127`, `:124-126` |
| **React Query cache** | `queryClient.clear()` in `signOut` *before* `clearAllClientData` (and in the cross-tab handler). | `AuthProvider.tsx:201,327` |
| **IndexedDB explorer cache** | `purgeExplorerCacheDb()` in both paths. | `AuthProvider.tsx:205,329` |

httpOnly `session_id` is **not** client-deletable; the comment defers it to
`POST /api/auth/logout` (`clearAllClientData.ts:69-70`), which `signOut` calls
first and whose failure is swallowed with a warning (`AuthProvider.tsx:195-198`).

### 10.2 What is deliberately retained

**Exactly one localStorage key: `theme`.**
`const PRESERVED_LOCAL_STORAGE_KEYS = new Set(['theme'])` (`:12`). Nothing is
retained in sessionStorage, CacheStorage, or cookies.

Consequences for this section: `sw_active_team_id` (`useTeamData.ts:47`) and every
`sw_pinned_{chatId}` value (`usePinnedArtifacts.ts:55`) are destroyed on logout.
So pinned artifacts and the active-team selection do not survive a sign-out /
sign-in cycle.

### 10.3 Gaps and observations

1. **The `theme` key is an unverified assumption.** The allowlist spares the
   literal key `'theme'`, but a repo-wide search for a theme writer
   (`localStorage.setItem(…theme…)`, `THEME_KEY`) finds only
   `dashboard-engine/theme.ts:15` `applyTheme`, which is fed from
   `window.__SW_THEME__` (`dashboard-engine/index.ts:12`) and from a bridge
   message (`bridge.ts:325`). No module in `src/` writes a localStorage key named
   `'theme'`. If the real theme preference lives under another key, the sweep
   deletes it and the allowlist entry is inert.
2. **`@/shared/storage/registry` is not consulted.** `clearAllClientData.ts:24`
   describes the registry as "the forward-looking answer" for namespace
   ownership, but the implementation still sweeps everything. `clearRegistered()`
   (`registry.ts:47-58`) is called from its unit test only
   (`shared/storage/__tests__/store.test.ts:191,201`). The ownership map exists
   and is unused by the sweep.
3. **No clearing of IndexedDB other than the explorer cache.**
   `purgeExplorerCacheDb` is narrowly scoped; other databases are untouched
   (`:203-208`).
4. **The cookie sweep only covers two paths.** `:89-90` writes `path=/` and
   `path=${window.location.pathname}`. A cookie scoped to an intermediate
   directory would survive.
5. **Ordering.** `queryClient.clear()` runs before `clearAllClientData()`
   (`AuthProvider.tsx:201,213`), so in-flight queries may re-populate the cache
   between the two. There is no `cancelQueries()`.
6. **`sw.pendingInvite` is destroyed by logout** (`sessionStorage.clear()`, `:60`),
   so a user who signs out mid-invite flow loses the token — they must re-open
   the link.

---

## 11. React Query invalidation strategy

### 11.1 Keys touched by collaboration

| Mutation | Hook / call site | Invalidated keys | Missed |
| --- | --- | --- | --- |
| `shareAgentWithTeam` | `useTeamData.ts:285-293` | `agentShares(teamId)`, `connectorKeys.list` | `connectionKeys.all` — `sharedConnections` derives from `connections` (`useTeamData.ts:212-225`) and only refreshes on the next 4–8 s poll (`useConnections.ts:31-37`) |
| `unshareAgentFromTeam` | `:295-303` | `agentShares(teamId)`, `connectorKeys.list` | same |
| `removeTeamMember` | `:305-314` | `members(teamId)`, `collaboration.projects`, `seats(teamId)` | `invites(teamId)`, `agentShares(teamId)`, `teams` (if the caller was removed elsewhere) |
| `updateTeamMemberRole` | `:316-324` | `members(teamId)` | — |
| `revokeTeamInvitation` | `:326-333` | `invites(teamId)` | `seats(teamId)` (a revoked pending invite may have held a seat reservation) |
| `leaveTeam` | `:335-344` | `teams`, `collaboration.projects`; then `handleSelectTeam('')` | `members`, `invites`, `seats`, `agentShares` for the left team; `connectorKeys.list`; `connectionKeys.all` |
| `deleteTeam` | `:346-356` | `teams`, `collaboration.projects`, `connectorKeys.list`; then `handleSelectTeam('')` | `members`, `invites`, `seats`, `agentShares`, `connectionKeys.all` |
| `renameTeam` | `:358-365` | `teams` | — (`selectedTeam` derives from `teams`) |
| `createTeam` | `:369-384` | `teams` | — |
| `inviteTeamMember` | `:386-424` | `members(teamId)`, `invites(teamId)`, `seats(teamId)` — awaited sequentially, not `Promise.all` | `teams` |
| `handleToggleProjectTeam` | `:439-451` | `collaboration.projects` **and** `projectQueryKeys.all` (`['ai','projects']`) — correctly covers both project caches | — |
| `deleteChart` (Library card) | `AIChatLibrary.tsx:40-46` | `chartQueryKeys.all` = `['ai','charts']` | — |

### 11.2 Collaboration-scoped invalidation gaps

**The duplicate project cache is the main structural problem.**
`listProjects()` is fetched under two keys: `['collaboration','projects']`
(`types.ts:5`, `useTeamData.ts:130`) and `['ai','projects','list']`
(`useProjects.ts:22`). Only `handleToggleProjectTeam`
(`useTeamData.ts:444-447`) and `handleRefreshAll` (`:245-246`) invalidate both.
The AI-surface project mutations do not:

* `useCreateProject` invalidates `projectQueryKeys.list()` only
  (`useProjects.ts:53-55`) → the Collaboration "Share Projects" tab goes stale.
* `useDeleteProject` likewise (`useProjects.ts:87-89`).
* `useUpdateProject` likewise (`useProjects.ts:72-74`) — though it has no callers.
* `useDeleteAIChat` invalidates `aiQueryKeys.chatsRoot` and
  `projectQueryKeys.all` (`useAIChats.ts:137-138`) but **not**
  `collaboration.projects`, so `chatCount` badges and the Share Projects tab
  stay stale until a manual Refresh.

`useUpdateAIChat` (`useAIChats.ts:115-121`) does invalidate `projectQueryKeys.all`
(which prefix-matches `projectQueryKeys.chats(projectId)`), but still not
`collaboration.projects`.

**Manual refresh surfaces.** `handleRefreshAll` (`:240-265`) invalidates 5 keys
unconditionally — `teams`, `collaboration.projects`, `projectQueryKeys.all`,
`connectorKeys.list`, `connectionKeys.all` — plus 4 team-scoped keys when a team
is selected (`:250-257`). `handleRefreshSharedDbs` (`:267-281`) invalidates only
`agentShares(teamId)`, `connectorKeys.list`, `connectionKeys.all`.

**Stale-by-design notes.** `seats` (`useTeamData.ts:121-125`) has no
`refetchOnWindowFocus` and no `staleTime` override; it is refreshed only by the
three mutations listed above, by `handleRefreshAll`, and by a manual reload.
`invites` and `members` do set `refetchOnWindowFocus: true` (`:99,113`).
`teams` sets it too (`:63`). `projects` (`queryKeys.projects`) does **not**
(`:128-135`) and `agentShares` does **not** (`:160-164`).

**Cache lifetime constants, verbatim**

| Hook | staleTime | gcTime | Polling | Citation |
| --- | --- | --- | --- | --- |
| `useProjects` | `30_000` | `5 * 60_000` | — | `useProjects.ts:34-35` |
| `useProjectChats` | `30_000` | (default) | — | `useProjects.ts:102` |
| `useAIChatList` | `30_000` | `5 * 60_000` | — | `useAIChats.ts:73-74` |
| `useAIChatMessages` | `60_000` | `10 * 60_000` | — | `useAIChats.ts:100-101` |
| `useArtifactHistory` | `30_000` | `5 * 60_000` | — | `useAIChats.ts:181-182` |
| Library `useSavedCharts` | `30_000` | (default) | — | `AIChatLibrary.tsx:28` |
| `useSavedCharts` (hooks) | `30_000` | `5 * 60_000` | — | `useCharts.ts:52-53` |
| `useConnections` | `2_000` | (default) | `8_000` if any online else `4_000` | `useConnections.ts:30-37` |
| `useConnectors` | `5_000` | (default) | `10_000` when signed in | `connector/api/hooks.ts:46-47` |

---

## Security-Relevant Observations

All client-side. None of these is a claim about backend enforcement.

1. **The entire role model is client-side gating.** `canManage`,
   `canChangeRoles` and `isOwner` are derived from one field —
   `currentRole`, returned by `GET /api/teams/{id}/members`
   (`api/collaboration.ts:36`, `useTeamData.ts:103`) — and are used exclusively
   to conditionally render buttons (`MembersPanel.tsx:92,199,200,283,359`;
   `AgentSharesPanel.tsx:106`; `CollaborationSettings.tsx:177`). There is no
   route guard, no capability object, and no client-side assertion before any
   mutation is fired. Every one of the ~22 team endpoints in §4.4 must therefore
   authorise independently.

2. **Project team-membership is not role-gated at all.** `ProjectsPanel`
   declares `canManage: boolean` in its props interface
   (`ProjectsPanel.tsx:18`) but does **not** destructure it
   (`ProjectsPanel.tsx:26-34`), and the Share/Unshare button is rendered
   unconditionally for every row (`ProjectsPanel.tsx:114-125`). Any team member,
   including one who cannot invite members, can call
   `PUT /api/ai/projects/{id}` with `{ teamId }` (`useTeamData.ts:442`) and move
   a project into or out of the team. `CollaborationSettings.tsx:285` does pass
   `canManage` — it is simply unused. This is the one management capability in
   §4.3 with **zero** client-side restriction.

3. **Invite-role restriction is not enforced at the call site.**
   `handleInvite` passes `inviteRole` straight through
   (`useTeamData.ts:395`). The "only owners may invite admins" rule exists solely
   as `disabled={!isOwner}` on the Radix `SelectItem`
   (`MembersPanel.tsx:114`), which is a rendering hint, not a check. `inviteRole`
   state (`:35`) is reachable from any consumer of the hook.

4. **Invitation email binding is a client-side display check.**
   `isWrongAccount` (`InvitationReviewModal.tsx:46-50`) compares
   `currentUserEmail` against `invitation.email` in the browser and merely
   disables the Accept button (`:52,145-147`). `acceptTeamInvitation` sends only
   `{ token }` — no email, no user id (`api/collaboration.ts:227`). If the
   backend does not verify that the authenticated user's email matches the
   invitation, the UI check is the only thing standing between a valid token and
   a wrong-account join.
   UNVERIFIED: whether `POST /api/teams/invitations/accept` validates the
   authenticated user's email against the invitation's `email` server-side.

5. **Invite tokens travel in URL paths and query strings.**
   `GET /api/teams/invitations/info/{token}` (`api/collaboration.ts:242`) embeds
   the token in the path; the shareable link is `/?teamInvite={token}`
   (`useTeamData.ts:403,406`; `MembersPanel.tsx:301`). The token is also rendered
   into the DOM inside a `<code>` element with `select-all`
   (`MembersPanel.tsx:149`), so it is copyable and appears in screenshots. The
   client does strip the query string via `history.replaceState` after use
   (`DataExplorerPage.tsx:252,285,305`), which limits referrer leakage from the
   app's own subsequent navigations only.

6. **Agent shares grant every database on the connector, and the grantor need
   not be the sharer.** `shareAgentWithTeam`'s doc-comment states "Owner/admin +
   paid plan required" (`api/collaboration.ts:269-272`) — neither condition is
   checked in the client. `allAgentEntries` includes agents owned by other
   members (`useTeamData.ts:184-195`), and unshare is keyed on `share_id`
   (`AgentSharesPanel.tsx:111-114`), so any admin can revoke a share another
   admin created.

7. **`is_mine` defaults to `true` when the field is absent.**
   `const isOwner = project.is_mine ?? true` (`AIChatProjects.tsx:113`;
   identically `ProjectDetailView.tsx:53`). If the projects payload ever omits
   `is_mine` — or a snake_case-only payload is returned while the camelCase field
   is absent — the delete-project button is shown to everyone. Note that
   `visibleProjects` reads only `user_id` (`useTeamData.ts:141`,
   `ProjectsPanel.tsx:41`), so the two ownership signals are not cross-checked
   anywhere.

8. **`sharedConnections` attributes untagged team connections to any team.**
   `isTeamConnForThisTeam` treats `access_type === 'team' && !conn.team_name` as
   a match for the currently selected team (`useTeamData.ts:215-217`). A
   connection with `access_type: 'team'` and no `team_name` will therefore be
   listed as shared under every team the user belongs to.

9. **The logout sweep is thorough but has a documented-inert allowlist entry.**
   `PRESERVED_LOCAL_STORAGE_KEYS = new Set(['theme'])`
   (`clearAllClientData.ts:12`) is the only retained key; no module in `src/`
   writes that key, so the exemption appears to protect nothing while the comment
   claims it preserves "light/dark theme" (`:11`).

10. **`sw.pendingInvite` is sessionStorage, not localStorage** — it survives a
    page reload but not a new tab or a logout (`inviteToken.ts:5,14`;
    `clearAllClientData.ts:60`). The inline comment at `inviteToken.ts:16-18`
    acknowledges the private-mode case.

11. **Cross-tab logout is conditional on this tab having no session cookie.**
    `if (!localSession && !isSigningOutRef.current)` (`AuthProvider.tsx:326`).
    Because the session cookie is shared across same-origin tabs, this guard
    normally *skips* the remote cleanup when another tab signs out — the
    condition is inverted relative to the likely intent.

---

## Dead / Unused Code

**Unreachable producers**

* `setSaveTarget` is never assigned a truthy value, making the inline `SaveForm`
  and `POST /api/ai/charts/save` unreachable (`ArtifactView.tsx:347,597,602,620`).
  Consequence: the Library's Saved Charts list has no producer (§3.2).
* `savedLabel` is write-only by the source's own admission
  (`ArtifactView.tsx:348-350`).
* `aiActiveView === 'library'` is not reachable from any UI control — no
  `onViewChange('library')` call exists (`DataExplorerLayout.tsx:159,619`;
  `AIChatSidebar.tsx:58-59`).

**Unused functions / endpoints**

* `assignChatToProject` → `POST /api/ai/projects/{id}/chats/{chatId}` — zero
  callers (`api/projects.ts:90-92`). Chat assignment goes through
  `PATCH /api/ai/chats/{id}` instead.
* `useUpdateProject` — zero callers (`useProjects.ts:63-76`). The source comment
  at `:107-108` says it was removed for having zero consumers, but the function
  is still exported.
* `getTeam(id)` → `GET /api/teams/{id}` — zero callers
  (`api/collaboration.ts:73-75`).
* `getInvitationInfo(token, 'project')` → `GET /api/files/projects/invitations/info/{token}`
  — zero callers; the only call site hard-codes `'team'`
  (`api/collaboration.ts:243`; `DataExplorerPage.tsx:244`).
* The whole `type: 'project'` branch of `InvitationInfo` (`projectId`,
  `projectName` — `api/collaboration.ts:56,59`) is never populated or read.
* `storePendingInvite` is only ever called with `'team'`
  (`DataExplorerPage.tsx:235,312`), so `StoredInvite.k`'s `'project'` variant
  (`inviteToken.ts:9`) is dead.
* `clearRegistered()` (`registry.ts:47-58`) — called only from its unit test
  (`shared/storage/__tests__/store.test.ts:191,201`).
* `getNetworkStatus` / `subscribeToNetworkStatus` / `getTabId` were already
  removed from `crossTab.ts`; the removal note remains
  (`crossTab.ts:5-9`).
* `useRunQuery`, `useSaveQuery`, `useAIHealth` were already removed from
  `useAIChats.ts`; their API functions remain (`useAIChats.ts:152-163`).

**Unused props and fields**

* `AIProject.fileCount` / `file_count` — zero readers anywhere in `src/`
  (`api/projects.ts:25-26`).
* `AIProject.createdAt` / `created_at` — zero readers (`api/projects.ts:29-30`).
* `AIProject.context` — accepted by create and update, zero readers
  (`api/projects.ts:62,74`).
* `ProjectChat.modelUsed`, `ProjectChat.contextTable`, `ProjectChat.userId`,
  `ProjectChat.authorAvatarUrl` — zero readers (`api/projects.ts:39,41-42,45`).
* `Team.settings`, `Team.slug`, `Team.owner_id`, `Team.avatar_url`,
  `Team.role`, `Team.created_at`, `Team.updated_at` — no collaboration reader
  (`api/collaboration.ts:6-9,12-13`).
* `TeamInvitation.invited_by`, `TeamInvitation.created_at`,
  `TeamInvitation.accepted_at`, `TeamInvitation.status` beyond the
  `=== 'pending'` filter — `invited_by` / `created_at` / `accepted_at` unread
  (`api/collaboration.ts:47-50`; the only status read is `useTeamData.ts:117`).
* `SharedConn.sharedBy` — populated at `useTeamData.ts:209,222`, never rendered
  (`types.ts:17`).
* `InviteTeamMemberResult.message` — no reader (`api/collaboration.ts:92`).
* `EmailRegEX`-adjacent: `EMAIL_REGEX` has two call sites
  (`CollaborationSettings.tsx:44`, `useTeamData.ts:389`) — both live.
* **`ProjectsPanelProps.canManage`** — declared (`:18`) and passed
  (`CollaborationSettings.tsx:285`) but never destructured (`:26-34`). See
  Security observation 2.
* `SectionLabel`'s children and `RoleBadge` are used; `ConfirmAction`'s
  `extraGuard` is used once (delete-team name check, `MembersPanel.tsx:387-400`).

**Duplicate / redundant computation**

* `visibleProjects` is computed **twice** with identical logic:
  `useTeamData.ts:137-145` and `ProjectsPanel.tsx:37-45`.
  `CollaborationSettings` passes `allProjects` (`CollaborationSettings.tsx:281`)
  and never destructures the hook's `visibleProjects`
  (`useTeamData.ts:465`) → the hook's copy is dead.
* `colorClass` / `dotClass` tables are duplicated between `AIChatProjects.tsx:15-27`
  and `ProjectDetailView.tsx:27-32`.

**Inert UI**

* The `MoreHorizontal` button on every Library connection row has no `onClick`
  (`AIChatLibrary.tsx:130-133`).
* `ProjectDetailView` shows an infinite "Loading project…" spinner for an
  unknown `projectId`, because `project` being `undefined` and the query being
  in-flight are indistinguishable (`ProjectDetailView.tsx:43-49`).
* The role-change dropdown fires the mutation on menu click with no confirmation
  (`MembersPanel.tsx:238-249`), unlike every other destructive action in the
  panel.

---

## Open Questions

- UNVERIFIED: Does the backend filter `GET /api/connections` to team-visible rows only, or return every row with an `access_type` discriminator and rely on the client-side filter in `useTeamData.sharedConnections`?
- UNVERIFIED: Does `POST /api/teams/invitations/accept` verify server-side that the authenticated user's email matches the invitation's `email`, or is the client-side `isWrongAccount` check in `InvitationReviewModal.tsx:46-50` the only binding?
- UNVERIFIED: Does the backend authorise `PUT /api/ai/projects/{id}` with a `teamId` field, i.e. can a plain team member escalate a project into the team despite the missing UI guard?
- UNVERIFIED: Does the backend reject invites and role changes when `occupied >= seats`? The client only disables the Invite button (`MembersPanel.tsx:117`).
- UNVERIFIED: Does the backend enforce the "paid plan required" condition for agent shares asserted only in the doc-comment at `api/collaboration.ts:271`?
- UNVERIFIED: Is `localStorage`'s `'theme'` key (the sole entry in `PRESERVED_LOCAL_STORAGE_KEYS`, `clearAllClientData.ts:12`) actually written anywhere? No writer exists in `src/`, so the exemption may be inert and the theme may in fact be swept.
- UNVERIFIED: Do `GET /api/teams/{id}/invitations` responses include the per-row `token` / `link` fields that `MembersPanel.tsx:300-301` depends on? Both are optional in the type (`api/collaboration.ts:46-47`), and if absent, admins cannot re-copy an invite link from the pending list.
- UNVERIFIED: What `expires_at` interval does the backend apply to invitations? Only the display math is client-side (`Math.ceil((expiresAt - Date.now()) / 86_400_000)`, `MembersPanel.tsx:299`).
- UNVERIFIED: Does the backend emit `access_type: 'team'` connections without a `team_name`? The `!conn.team_name` clause at `useTeamData.ts:216` implies it might.
- UNVERIFIED: What is the retention/cleanup policy for `POST /api/ai/charts/save` rows, given no client code writes them? The Library will show anything a non-client writer left behind.
- UNVERIFIED: Does `sw-data-explorer:ai-active-view` ever hold the value `'library'` in practice for existing sessions? That is the only way the Library currently renders.