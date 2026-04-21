"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANIFEST_CONTENT_TYPE = exports.MANIFEST_FILENAME = exports.MANIFEST_SCHEMA_VERSION = void 0;
exports.mapBuildRow = mapBuildRow;
exports.buildPlatforms = buildPlatforms;
exports.assembleVersionManifest = assembleVersionManifest;
exports.assembleChannelLatestManifest = assembleChannelLatestManifest;
exports.manifestToXml = manifestToXml;
const fast_xml_parser_1 = require("fast-xml-parser");
const versioning_js_1 = require("./versioning.js");
exports.MANIFEST_SCHEMA_VERSION = 2;
exports.MANIFEST_FILENAME = 'manifest.xml';
exports.MANIFEST_CONTENT_TYPE = 'application/xml';
function mapBuildRow(build) {
    return {
        os: build.os,
        arch: build.arch,
        type: build.type,
        variant: build.variant || 'default',
        distribution: build.distribution,
        packageName: build.package_name,
        url: build.url,
        size: build.size,
        platformMetadata: build.platform_metadata,
        createdAt: build.created_at,
        sha256Checksum: build.sha256_checksum,
        sha512Checksum: build.sha512_checksum,
    };
}
function resolveDistribution(build) {
    if (build.distribution === 'store' || build.distribution === 'direct') {
        return build.distribution;
    }
    return build.platformMetadata?.external ? 'store' : 'direct';
}
function rankDistribution(d) {
    return d === 'store' ? 0 : 1;
}
function toBuildSource(build) {
    return {
        url: build.url,
        size: build.size ?? null,
        packageName: build.packageName ?? null,
        releaseDate: build.createdAt,
        type: build.type,
        distribution: resolveDistribution(build),
        version: build.sourceVersion ?? null,
        sha256: build.sha256Checksum ?? null,
        sha512: build.sha512Checksum ?? null,
        fallbackFrom: build.platformMetadata?.fallback_from ?? null,
        external: build.platformMetadata?.external ?? false,
    };
}
function buildPlatforms(rawBuilds) {
    // os -> arch -> variant -> type -> sources[]
    const tree = new Map();
    for (const build of rawBuilds) {
        if (!tree.has(build.os))
            tree.set(build.os, new Map());
        const archMap = tree.get(build.os);
        if (!archMap.has(build.arch))
            archMap.set(build.arch, new Map());
        const variantMap = archMap.get(build.arch);
        const variantName = build.variant || 'default';
        if (!variantMap.has(variantName))
            variantMap.set(variantName, new Map());
        const typeMap = variantMap.get(variantName);
        if (!typeMap.has(build.type))
            typeMap.set(build.type, []);
        typeMap.get(build.type).push(toBuildSource(build));
    }
    const platforms = [];
    for (const [os, archMap] of tree) {
        const archs = [];
        for (const [archName, variantMap] of archMap) {
            const variants = [];
            for (const [variantName, typeMap] of variantMap) {
                const builds = {};
                for (const [type, sources] of typeMap) {
                    const sorted = [...sources].sort((a, b) => {
                        const byDist = rankDistribution(a.distribution) - rankDistribution(b.distribution);
                        if (byDist !== 0)
                            return byDist;
                        return new Date(b.releaseDate || 0).getTime() - new Date(a.releaseDate || 0).getTime();
                    });
                    const primary = sorted[0];
                    builds[type] = sorted.length > 1 ? { ...primary, sources: sorted } : { ...primary };
                }
                variants.push({ name: variantName, builds });
            }
            archs.push({ name: archName, variants });
        }
        platforms.push({ os, archs });
    }
    return platforms;
}
function assembleVersionManifest(versionData, builds) {
    const platforms = buildPlatforms((builds || []).map(mapBuildRow));
    return {
        schemaVersion: exports.MANIFEST_SCHEMA_VERSION,
        name: 'App',
        version: versionData.version_name,
        channel: versionData.release_channel,
        releaseDate: versionData.release_date,
        mandatory: !!versionData.is_mandatory,
        releaseNotes: versionData.release_notes ?? null,
        changelog: versionData.changelog ?? null,
        updatePolicy: (0, versioning_js_1.getUpdatePolicyFromVersion)(versionData),
        platforms,
    };
}
function assembleChannelLatestManifest(versions, buildsByVersionId) {
    const versionsWithBuilds = versions.map((v) => ({
        ...v,
        rawBuilds: (buildsByVersionId.get(v.id) || []).map(mapBuildRow),
    }));
    const ordered = (0, versioning_js_1.sortVersionsDesc)(versionsWithBuilds, (v) => v.version_name);
    const latest = ordered[0];
    // Pick latest build per (os, arch, variant, type, distribution)
    const picked = new Map();
    for (const version of ordered) {
        for (const build of version.rawBuilds) {
            const dist = resolveDistribution(build);
            const key = `${build.os}::${build.arch}::${build.variant || 'default'}::${build.type}::${dist}`;
            if (!picked.has(key)) {
                picked.set(key, { ...build, sourceVersion: version.version_name });
            }
        }
    }
    return {
        schemaVersion: exports.MANIFEST_SCHEMA_VERSION,
        name: 'App',
        version: latest.version_name,
        channel: latest.release_channel,
        releaseDate: latest.release_date,
        mandatory: !!latest.is_mandatory,
        releaseNotes: latest.release_notes ?? null,
        changelog: latest.changelog ?? null,
        updatePolicy: (0, versioning_js_1.getUpdatePolicyFromVersion)(latest),
        platforms: buildPlatforms(Array.from(picked.values())),
    };
}
// XML serialization
function attrIfPresent(value, key, out) {
    if (value === null || value === undefined)
        return;
    if (typeof value === 'string' && value.length === 0)
        return;
    out['@_' + key] = value;
}
function buildSourceAttrs(src) {
    const obj = {};
    attrIfPresent(src.type, 'type', obj);
    attrIfPresent(src.distribution, 'distribution', obj);
    attrIfPresent(src.url, 'url', obj);
    attrIfPresent(src.size, 'size', obj);
    attrIfPresent(src.packageName, 'packageName', obj);
    attrIfPresent(src.releaseDate, 'releaseDate', obj);
    attrIfPresent(src.version, 'version', obj);
    attrIfPresent(src.sha256, 'sha256', obj);
    attrIfPresent(src.sha512, 'sha512', obj);
    attrIfPresent(src.fallbackFrom, 'fallbackFrom', obj);
    if (src.external)
        obj['@_external'] = true;
    return obj;
}
function manifestToBuilderObject(m) {
    const root = {
        '@_schemaVersion': m.schemaVersion,
        '@_name': m.name,
        '@_version': m.version,
        '@_channel': m.channel,
        '@_releaseDate': m.releaseDate,
        '@_mandatory': m.mandatory,
    };
    if (m.releaseNotes)
        root.releaseNotes = { '#text': m.releaseNotes };
    if (m.changelog)
        root.changelog = { '#text': m.changelog };
    const policyAttrs = {};
    attrIfPresent(m.updatePolicy.channel, 'channel', policyAttrs);
    policyAttrs['@_rolloutPercentage'] = m.updatePolicy.rolloutPercentage;
    attrIfPresent(m.updatePolicy.minSupportedVersion, 'minSupportedVersion', policyAttrs);
    attrIfPresent(m.updatePolicy.rolloutStartAt, 'rolloutStartAt', policyAttrs);
    attrIfPresent(m.updatePolicy.rolloutEndAt, 'rolloutEndAt', policyAttrs);
    root.updatePolicy = policyAttrs;
    root.platforms = {
        platform: m.platforms.map((p) => ({
            '@_os': p.os,
            arch: p.archs.map((a) => ({
                '@_name': a.name,
                variant: a.variants.map((v) => ({
                    '@_name': v.name,
                    build: Object.entries(v.builds).map(([_, entry]) => {
                        const obj = buildSourceAttrs(entry);
                        if (entry.sources && entry.sources.length > 0) {
                            obj.source = entry.sources.map((s) => buildSourceAttrs(s));
                        }
                        return obj;
                    }),
                })),
            })),
        })),
    };
    return { manifest: root };
}
const xmlBuilder = new fast_xml_parser_1.XMLBuilder({
    format: true,
    indentBy: '  ',
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    suppressEmptyNode: true,
    cdataPropName: '#cdata',
    textNodeName: '#text',
    processEntities: true,
});
function manifestToXml(manifest) {
    const builderObj = manifestToBuilderObject(manifest);
    // Re-shape releaseNotes / changelog to use CDATA so multi-line text is safe.
    if (builderObj.manifest.releaseNotes) {
        builderObj.manifest.releaseNotes = { '#cdata': manifest.releaseNotes };
    }
    if (builderObj.manifest.changelog) {
        builderObj.manifest.changelog = { '#cdata': manifest.changelog };
    }
    const body = xmlBuilder.build(builderObj);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}
//# sourceMappingURL=manifest.js.map