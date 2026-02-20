-- Release channels and policy normalization
-- Adds first-class channel support for stable/beta/alpha style release tracks
-- and a deterministic storage key namespace per version.

-- 1) Add channel and policy columns to versions
alter table application.versions
  add column if not exists release_channel varchar(20) not null default 'stable',
  add column if not exists min_supported_version varchar(50),
  add column if not exists rollout_percentage integer not null default 100,
  add column if not exists rollout_start_at timestamptz,
  add column if not exists rollout_end_at timestamptz,
  add column if not exists storage_key_prefix text;

-- Channel constraints
alter table application.versions
  drop constraint if exists versions_release_channel_check;

alter table application.versions
  add constraint versions_release_channel_check
  check (release_channel in ('stable', 'beta', 'alpha'));

-- Rollout constraints
alter table application.versions
  drop constraint if exists versions_rollout_percentage_check;

alter table application.versions
  add constraint versions_rollout_percentage_check
  check (rollout_percentage >= 0 and rollout_percentage <= 100);

alter table application.versions
  drop constraint if exists versions_rollout_window_check;

alter table application.versions
  add constraint versions_rollout_window_check
  check (rollout_end_at is null or rollout_start_at is null or rollout_end_at >= rollout_start_at);

-- 2) Replace global unique version with channel-scoped unique version
alter table application.versions
  drop constraint if exists versions_version_name_key;

alter table application.versions
  drop constraint if exists versions_version_channel_unique;

alter table application.versions
  add constraint versions_version_channel_unique unique (version_name, release_channel);

-- 3) Backfill deterministic storage prefix for existing rows
update application.versions
set storage_key_prefix = format('releases/%s/%s', release_channel, version_name)
where storage_key_prefix is null;

alter table application.versions
  alter column storage_key_prefix set not null;

-- 4) Optional data hygiene: infer channel from semver pre-release if missing explicit intent
--    (only updates rows still marked as stable)
update application.versions
set release_channel = case
  when version_name ~* '-beta(\.|$)' then 'beta'
  when version_name ~* '-alpha(\.|$)' then 'alpha'
  else release_channel
end
where release_channel = 'stable';

-- 5) Indexes for update checks and channel lookups
drop index if exists idx_versions_version_name;
create unique index if not exists idx_versions_version_channel
  on application.versions(version_name, release_channel);

create index if not exists idx_versions_channel_published
  on application.versions(release_channel, is_published, created_at desc);

create index if not exists idx_versions_min_supported
  on application.versions(min_supported_version)
  where min_supported_version is not null;

comment on column application.versions.release_channel is 'Release lane: stable, beta, alpha';
comment on column application.versions.storage_key_prefix is 'Storage namespace prefix (e.g. releases/stable/1.2.0)';
