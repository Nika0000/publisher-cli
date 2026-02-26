-- Fix: drop single-column unique index/constraint on version_name
-- that blocks creating the same version in different release channels.
--
-- Root cause: 0001_initial.sql creates both an inline `unique` constraint
-- (versions_version_name_key) AND an explicit unique index
-- (idx_versions_version_name) on version_name alone. If 0001 is re-run
-- after 0002 has replaced those with the channel-scoped compound index,
-- idx_versions_version_name is silently recreated.
--
-- This migration makes the DB consistent with the intent of 0002.

-- Drop the single-column unique index if it was recreated
drop index if exists application.idx_versions_version_name;

-- Also drop the constraint variant in case it still exists
alter table application.versions
  drop constraint if exists versions_version_name_key;

-- Ensure the channel-scoped compound constraint is in place
alter table application.versions
  drop constraint if exists versions_version_channel_unique;

alter table application.versions
  add constraint versions_version_channel_unique
  unique (version_name, release_channel);

-- Re-create the compound unique index (idempotent)
drop index if exists application.idx_versions_version_channel;
create unique index idx_versions_version_channel
  on application.versions(version_name, release_channel);
