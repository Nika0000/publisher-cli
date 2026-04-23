-- Support multiple build sources per platform/type (e.g., direct APK + Play Store URL)
-- Adds distribution column and updates uniqueness to allow coexistence.

begin;

alter table publisher.builds
  add column if not exists distribution varchar(20) not null default 'direct';

alter table publisher.builds
  drop constraint if exists builds_distribution_check;

alter table publisher.builds
  add constraint builds_distribution_check
  check (distribution in ('direct', 'store'));

-- Backfill existing rows based on existing metadata convention
update publisher.builds
set distribution = case
  when coalesce((platform_metadata->>'external')::boolean, false) then 'store'
  else 'direct'
end
where distribution is null or distribution = '';

-- Replace uniqueness to include distribution source
alter table publisher.builds
  drop constraint if exists builds_version_id_os_arch_type_key;

alter table publisher.builds
  drop constraint if exists builds_version_id_os_arch_type_distribution_key;

alter table publisher.builds
  add constraint builds_version_id_os_arch_type_distribution_key
  unique (version_id, os, arch, type, distribution);

create index if not exists idx_builds_distribution
  on publisher.builds(distribution);

drop index if exists idx_builds_os_arch;
create index if not exists idx_builds_os_arch_type_distribution
  on publisher.builds(os, arch, type, distribution);

comment on column publisher.builds.distribution is 'Build delivery source: direct binary or store listing';

commit;
