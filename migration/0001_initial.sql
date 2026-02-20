-- App Versions Management (Simplified - managed by CLI)
-- 
-- Storage Bucket: archive
-- Structure:
--   - archive/manifest.json (latest builds per platform)
--   - archive/{version}/manifest.json (version-specific manifest)
--   - archive/{version}/{os}/{arch}/spacerun-{version}-{arch}-{os}.{ext}
--
-- Supported platforms: macos, windows, linux, ios, android
-- Supported architectures: arm64, x64, x86
-- Patch files: .tar.gz, .zip
-- Installer files: .dmg, .msi, .AppImage, .deb, .rpm, .apk

-- Create app_publisher role for CLI authentication
do $$
begin
  if not exists (select from pg_catalog.pg_roles where rolname = 'app_publisher') then
    create role app_publisher nologin;
  end if;
end
$$;

-- Grant role to authenticator
grant app_publisher to authenticator;
grant anon to app_publisher;

-- Application schema
create schema if not exists application;

-- Versions table
create table if not exists application.versions (
  id uuid primary key default gen_random_uuid(),
  version_name varchar(50) not null unique,
  manifest_version integer not null default 1,
  release_date timestamptz not null default now(),
  is_published boolean not null default false,
  is_mandatory boolean not null default false,
  release_notes text,
  changelog text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Builds table
create table if not exists application.builds (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references application.versions(id) on delete cascade,
  os varchar(50) not null, -- macos, windows, linux, ios, android
  arch varchar(50) not null, -- arm64, x64, x86
  type varchar(20) not null, -- patch, installer
  package_name varchar(255),
  url text,
  size bigint,
  sha256_checksum varchar(64),
  sha512_checksum varchar(128),
  platform_metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(version_id, os, arch, type)
);

-- Enable Row Level Security
alter table application.versions enable row level security;
alter table application.builds enable row level security;

-- RLS Policies
drop policy if exists "Public read published versions" on application.versions;
create policy "Public read published versions"
  on application.versions
  for select
  to public
  using (is_published = true);

drop policy if exists "Service role full access to versions" on application.versions;
create policy "Service role full access to versions"
  on application.versions
  for all
  to service_role, app_publisher
  using (true)
  with check (true);

drop policy if exists "Public read published builds" on application.builds;
create policy "Public read published builds"
  on application.builds
  for select
  to public
  using (exists (
    select 1 from application.versions v
    where v.id = builds.version_id and v.is_published = true
  ));

drop policy if exists "Service role full access to builds" on application.builds;
create policy "Service role full access to builds"
  on application.builds
  for all
  to service_role, app_publisher
  using (true)
  with check (true);

-- Indexes
create unique index if not exists idx_versions_version_name on application.versions(version_name);
create index if not exists idx_versions_release_date on application.versions(release_date desc);
create index if not exists idx_versions_created_at on application.versions(created_at desc);
create index if not exists idx_versions_is_published on application.versions(is_published) where is_published = true;

create index if not exists idx_builds_version_id on application.builds(version_id);
create index if not exists idx_builds_os on application.builds(os);
create index if not exists idx_builds_arch on application.builds(arch);
create index if not exists idx_builds_type on application.builds(type);
create index if not exists idx_builds_os_arch on application.builds(os, arch);

grant usage on schema application to anon, authenticated, service_role, app_publisher;
grant all on all tables in schema application to anon, authenticated, service_role, app_publisher;
grant all on all routines in schema application to anon, authenticated, service_role, app_publisher;
grant all on all sequences in schema application to anon, authenticated, service_role, app_publisher;
alter default privileges for role postgres in schema application grant all on tables to anon, authenticated, service_role, app_publisher;
alter default privileges for role postgres in schema application grant all on routines to anon, authenticated, service_role, app_publisher;
alter default privileges for role postgres in schema application grant all on sequences to anon, authenticated, service_role, app_publisher;

-- Auto-update timestamps function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Triggers for auto-updating updated_at
drop trigger if exists trg_versions_set_updated_at on application.versions;
create trigger trg_versions_set_updated_at
before update on application.versions
for each row execute function public.set_updated_at();

drop trigger if exists trg_builds_set_updated_at on application.builds;
create trigger trg_builds_set_updated_at
before update on application.builds
for each row execute function public.set_updated_at();

-- Comments
comment on table application.versions is 'App version metadata - managed by CLI';
comment on table application.builds is 'Platform-specific build info - managed by CLI';

-- Create storage bucket for app versions
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'archive',
  'archive',
  true,
  524288000, -- 500MB limit per file
  array[
    'application/json',
    'application/gzip',
    'application/x-gzip',
    'application/x-tar',
    'application/x-compressed-tar',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'application/x-apple-diskimage',
    'application/x-msi',
    'application/x-msdownload',
    'application/vnd.microsoft.portable-executable',
    'application/x-executable',
    'application/x-appimage',
    'application/vnd.android.package-archive'
  ]
)
on conflict (id) do nothing;

-- Storage policies for archive bucket
drop policy if exists "Public read access for archive" on storage.objects;
create policy "Public read access for archive"
  on storage.objects
  for select
  to public
  using (bucket_id = 'archive');

drop policy if exists "Service role can manage archive" on storage.objects;
create policy "Service role can manage archive"
  on storage.objects
  for all
  to service_role, app_publisher
  using (bucket_id = 'archive')
  with check (bucket_id = 'archive');
