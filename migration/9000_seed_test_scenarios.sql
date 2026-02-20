-- Seed test scenarios for app versioning flows
-- Safe to re-run: uses upserts and deterministic version/channel keys
-- Requires migrations:
--   - 0001_initial.sql
--   - 0002_release_channels.sql

begin;

with seed_versions as (
  select * from (values
    -- Stable channel scenarios
    ('8.9.0',  'stable', true,  false, null::varchar, 100, null::timestamptz, null::timestamptz, 'Legacy stable baseline', 'Legacy rollout baseline'),
    ('9.0.0',  'stable', true,  false, null::varchar, 100, null::timestamptz, null::timestamptz, 'First major stable', 'Initial major stable release'),
    ('9.1.0',  'stable', true,  false, '8.9.0',       100, null::timestamptz, null::timestamptz, 'Performance and bug fixes', 'Adds min supported version gate'),
    ('9.2.0',  'stable', true,  true,  '9.0.0',       100, null::timestamptz, null::timestamptz, 'Critical security fixes', 'Mandatory security update scenario'),
    ('9.3.0',  'stable', true,  false, '9.1.0',        25, now() - interval '2 days', now() + interval '10 days', 'Phased rollout to 25% users', 'Staged rollout window scenario'),
    ('9.4.0',  'stable', false, false, '9.1.0',       100, null::timestamptz, null::timestamptz, 'Draft release candidate', 'Unpublished draft scenario'),

    -- Beta channel scenarios
    ('9.3.0-beta.1', 'beta', true, false, '9.0.0', 100, null::timestamptz, null::timestamptz, 'Public beta wave 1', 'Beta channel published scenario'),
    ('9.4.0-beta.2', 'beta', true, false, '9.1.0',  50, now() - interval '1 day', now() + interval '14 days', 'Public beta wave 2', 'Beta phased rollout scenario'),

    -- Alpha channel scenario
    ('10.0.0-alpha.1', 'alpha', true, false, null::varchar, 10, now() - interval '12 hours', now() + interval '7 days', 'Experimental alpha', 'Alpha channel limited rollout')
  ) as t(
    version_name,
    release_channel,
    is_published,
    is_mandatory,
    min_supported_version,
    rollout_percentage,
    rollout_start_at,
    rollout_end_at,
    release_notes,
    changelog
  )
), upsert_versions as (
  insert into application.versions (
    version_name,
    release_channel,
    is_published,
    is_mandatory,
    min_supported_version,
    rollout_percentage,
    rollout_start_at,
    rollout_end_at,
    storage_key_prefix,
    release_notes,
    changelog,
    metadata,
    release_date
  )
  select
    sv.version_name,
    sv.release_channel,
    sv.is_published,
    sv.is_mandatory,
    sv.min_supported_version,
    sv.rollout_percentage,
    sv.rollout_start_at,
    sv.rollout_end_at,
    format('releases/%s/%s', sv.release_channel, sv.version_name),
    sv.release_notes,
    sv.changelog,
    jsonb_build_object(
      'seed', true,
      'scenario', sv.release_channel || ':' || sv.version_name,
      'updatePolicy', jsonb_build_object(
        'channel', sv.release_channel,
        'minSupportedVersion', sv.min_supported_version,
        'rolloutPercentage', sv.rollout_percentage,
        'rolloutStartAt', sv.rollout_start_at,
        'rolloutEndAt', sv.rollout_end_at
      )
    ),
    now() - interval '30 days'
  from seed_versions sv
  on conflict (version_name, release_channel)
  do update set
    is_published = excluded.is_published,
    is_mandatory = excluded.is_mandatory,
    min_supported_version = excluded.min_supported_version,
    rollout_percentage = excluded.rollout_percentage,
    rollout_start_at = excluded.rollout_start_at,
    rollout_end_at = excluded.rollout_end_at,
    storage_key_prefix = excluded.storage_key_prefix,
    release_notes = excluded.release_notes,
    changelog = excluded.changelog,
    metadata = excluded.metadata,
    release_date = excluded.release_date,
    updated_at = now()
  returning id, version_name, release_channel
), build_rows as (
  select * from (values
    -- Stable 9.2.0: full desktop + external mobile installers
    ('9.2.0','stable','macos','arm64','installer','direct','spacerun-9.2.0-arm64-macos.dmg','https://cdn.example.com/archive/releases/stable/9.2.0/macos/arm64/spacerun-9.2.0-arm64-macos.dmg',110000000::bigint, repeat('a',64), repeat('b',128), '{}'::jsonb),
    ('9.2.0','stable','macos','x64','installer','direct','spacerun-9.2.0-x64-macos.dmg','https://cdn.example.com/archive/releases/stable/9.2.0/macos/x64/spacerun-9.2.0-x64-macos.dmg',115000000::bigint, repeat('c',64), repeat('d',128), '{}'::jsonb),
    ('9.2.0','stable','windows','x64','installer','direct','spacerun-9.2.0-x64-windows.msi','https://cdn.example.com/archive/releases/stable/9.2.0/windows/x64/spacerun-9.2.0-x64-windows.msi',130000000::bigint, repeat('e',64), repeat('f',128), '{}'::jsonb),
    ('9.2.0','stable','linux','x64','installer','direct','spacerun-9.2.0-x64-linux.AppImage','https://cdn.example.com/archive/releases/stable/9.2.0/linux/x64/spacerun-9.2.0-x64-linux.AppImage',125000000::bigint, repeat('1',64), repeat('2',128), '{}'::jsonb),
    ('9.2.0','stable','ios','arm64','installer','store','ios-testflight-9.2.0','https://testflight.apple.com/join/SEED920',52000000::bigint, repeat('3',64), repeat('4',128), '{"external": true, "source": "testflight"}'::jsonb),
    ('9.2.0','stable','android','arm64','installer','store','android-play-9.2.0','https://play.google.com/store/apps/details?id=com.spacerun.seed920',49000000::bigint, repeat('5',64), repeat('6',128), '{"external": true, "source": "play_store"}'::jsonb),
    ('9.2.0','stable','android','arm64','installer','direct','spacerun-9.2.0-arm64-android.apk','https://cdn.example.com/archive/releases/stable/9.2.0/android/arm64/spacerun-9.2.0-arm64-android.apk',47000000::bigint, repeat('7',64), repeat('8',128), '{}'::jsonb),
    ('9.2.0','stable','ios','arm64','installer','direct','spacerun-9.2.0-arm64-ios.ipa','https://cdn.example.com/archive/releases/stable/9.2.0/ios/arm64/spacerun-9.2.0-arm64-ios.ipa',50000000::bigint, repeat('9',64), repeat('0',128), '{}'::jsonb),

    -- Stable 9.3.0: staged rollout with patch and fallback installer for linux
    ('9.3.0','stable','macos','arm64','patch','direct','spacerun-9.3.0-arm64-macos.tar.gz','https://cdn.example.com/archive/releases/stable/9.3.0/macos/arm64/spacerun-9.3.0-arm64-macos.tar.gz',52000000::bigint, repeat('7',64), repeat('8',128), '{}'::jsonb),
    ('9.3.0','stable','macos','arm64','installer','direct','spacerun-9.3.0-arm64-macos.dmg','https://cdn.example.com/archive/releases/stable/9.3.0/macos/arm64/spacerun-9.3.0-arm64-macos.dmg',112000000::bigint, repeat('9',64), repeat('0',128), '{}'::jsonb),
    ('9.3.0','stable','windows','x64','patch','direct','spacerun-9.3.0-x64-windows.zip','https://cdn.example.com/archive/releases/stable/9.3.0/windows/x64/spacerun-9.3.0-x64-windows.zip',54000000::bigint, repeat('a',64), repeat('c',128), '{}'::jsonb),
    ('9.3.0','stable','windows','x64','installer','direct','spacerun-9.3.0-x64-windows.msi','https://cdn.example.com/archive/releases/stable/9.3.0/windows/x64/spacerun-9.3.0-x64-windows.msi',132000000::bigint, repeat('d',64), repeat('e',128), '{}'::jsonb),
    ('9.3.0','stable','linux','x64','installer','direct','spacerun-9.2.0-x64-linux.AppImage','https://cdn.example.com/archive/releases/stable/9.2.0/linux/x64/spacerun-9.2.0-x64-linux.AppImage',125000000::bigint, repeat('f',64), repeat('1',128), '{"fallback_from": "9.2.0"}'::jsonb),

    -- Beta 9.4.0-beta.2
    ('9.4.0-beta.2','beta','macos','arm64','installer','direct','spacerun-9.4.0-beta.2-arm64-macos.dmg','https://cdn.example.com/archive/releases/beta/9.4.0-beta.2/macos/arm64/spacerun-9.4.0-beta.2-arm64-macos.dmg',118000000::bigint, repeat('2',64), repeat('3',128), '{}'::jsonb),
    ('9.4.0-beta.2','beta','windows','x64','installer','direct','spacerun-9.4.0-beta.2-x64-windows.msi','https://cdn.example.com/archive/releases/beta/9.4.0-beta.2/windows/x64/spacerun-9.4.0-beta.2-x64-windows.msi',136000000::bigint, repeat('4',64), repeat('5',128), '{}'::jsonb),

    -- Alpha 10.0.0-alpha.1 (intentionally minimal build coverage)
    ('10.0.0-alpha.1','alpha','macos','arm64','installer','direct','spacerun-10.0.0-alpha.1-arm64-macos.dmg','https://cdn.example.com/archive/releases/alpha/10.0.0-alpha.1/macos/arm64/spacerun-10.0.0-alpha.1-arm64-macos.dmg',121000000::bigint, repeat('6',64), repeat('7',128), '{}'::jsonb)
  ) as b(
    version_name,
    release_channel,
    os,
    arch,
    type,
    distribution,
    package_name,
    url,
    size,
    sha256_checksum,
    sha512_checksum,
    platform_metadata
  )
)
insert into application.builds (
  version_id,
  os,
  arch,
  type,
  distribution,
  package_name,
  url,
  size,
  sha256_checksum,
  sha512_checksum,
  platform_metadata
)
select
  av.id,
  br.os,
  br.arch,
  br.type,
  br.distribution,
  br.package_name,
  br.url,
  br.size,
  br.sha256_checksum,
  br.sha512_checksum,
  br.platform_metadata
from build_rows br
join application.versions av
  on av.version_name = br.version_name
 and av.release_channel = br.release_channel
on conflict (version_id, os, arch, type, distribution)
do update set
  package_name = excluded.package_name,
  url = excluded.url,
  size = excluded.size,
  sha256_checksum = excluded.sha256_checksum,
  sha512_checksum = excluded.sha512_checksum,
  platform_metadata = excluded.platform_metadata,
  updated_at = now();

commit;

-- Quick checks:
-- select version_name, release_channel, is_published, is_mandatory, min_supported_version, rollout_percentage
-- from application.versions
-- where metadata->>'seed' = 'true'
-- order by release_channel, version_name;
--
-- select av.version_name, av.release_channel, pb.os, pb.arch, pb.type, pb.package_name
-- from application.builds pb
-- join application.versions av on av.id = pb.version_id
-- where av.metadata->>'seed' = 'true'
-- order by av.release_channel, av.version_name, pb.os, pb.arch, pb.type;
