-- Build variants: support multiple builds per platform/arch/type for the same version
-- (e.g., opengl vs d3d11 for Windows, or arm vs thumb for Android)
--
-- The variant column is a short freeform label (default: 'default').
-- Uniqueness is now (version_id, os, arch, type, distribution, variant).

begin;

alter table application.builds
  add column if not exists variant varchar(50) not null default 'default';

alter table application.builds
  drop constraint if exists builds_version_id_os_arch_type_distribution_key;

alter table application.builds
  add constraint builds_version_id_os_arch_type_distribution_variant_key
  unique (version_id, os, arch, type, distribution, variant);

drop index if exists idx_builds_os_arch_type_distribution;
create index if not exists idx_builds_os_arch_type_dist_variant
  on application.builds(os, arch, type, distribution, variant);

comment on column application.builds.variant is 'Build variant label, e.g. default, opengl, d3d11, arm, thumb';

commit;
