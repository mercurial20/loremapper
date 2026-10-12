/**
 * Minimal product analytics for the official hosted app only: anonymous counts
 * of a few actions (a map was created, generated, edited, reopened, exported,
 * imported; which tools, styles and projections were used; what failed).
 *
 * - Enabled only in production builds that carry a PostHog token, served from
 *   the official address, and when the browser sends no Do Not Track or
 *   Global Privacy Control signal. Self-hosted copies and forks build without
 *   a token, and their address doesn't match: nothing is loaded there.
 * - The SDK is loaded lazily, in its smallest build, which contains no
 *   autocapture, replay, heatmap, survey or error-tracking code and cannot
 *   load external scripts.
 * - Nothing is stored on the device: the anonymous ID lives in memory for one
 *   page load. No person profiles, no identify/alias.
 * - Every outgoing event passes `scrub`: only the listed events are allowed,
 *   with the technical fields PostHog needs plus their own properties, whose
 *   values must come from the fixed lists in SCHEMA.
 *   Map contents, names, seeds, coordinates and URLs are never sent.
 * - Failures (blocked requests, offline, a broken SDK) are swallowed: the
 *   editor never waits for analytics.
 */

/**
 * Every event that may be sent, with the only properties it may carry and
 * the only values each property may take. Values come from fixed lists in
 * the app (map types, presets, tools…), never from anything a user types or
 * from a map's contents; anything else becomes 'other'.
 */
const SCHEMA = {
  map_created: { kind: ['planet', 'flat'], start: ['generate', 'builtin', 'empty'] },
  world_generated: {
    preset: ['continents', 'pangaea', 'twoWorlds', 'innerSea', 'polar', 'shattered', 'mainland', 'oceanWorld', 'island', 'archipelago', 'sand', 'snow', 'builtin'],
    realism: ['easy', 'medium', 'high', 'ultra'],
  },
  project_reopened: {},
  first_edit: {},
  map_exported: {
    format: ['image', 'heightmap', 'project'],
    projection: ['flat', 'equirectangular', 'mercator', 'mollweide', 'equalEarth', 'orthographic', 'azimuthal', 'gott'],
  },
  project_imported: {},
  reference_image_added: {},
  share_clicked: {},
  projection_viewed: { projection: ['mercator', 'mollweide', 'equalEarth', 'orthographic', 'azimuthal', 'gott'] },
  style_changed: { style: ['parchment', 'atlas', 'political', 'relief', 'anime', 'strategy', 'pixel', 'antique'] },
  tool_used: {
    tool: ['select', 'info', 'pan', 'raise', 'lower', 'ridge', 'smooth', 'flatten', 'paint', 'erase', 'river', 'road', 'object', 'label', 'territory', 'fog', 'peak', 'measure'],
  },
  operation_failed: { op: ['generate', 'export', 'import'] },
} as const;

type Schema = typeof SCHEMA;
export type ProductEvent = keyof Schema;
/** The properties of an event, typed from its schema (all optional). */
export type EventProps<E extends ProductEvent> = { [K in keyof Schema[E]]?: Schema[E][K] extends readonly (infer V)[] ? V : never };

/** Counted at most once per page load (whatever their properties). */
const ONCE: ReadonlySet<ProductEvent> = new Set<ProductEvent>(['project_reopened', 'first_edit']);
/** Counted at most once per page load for each value (which tools, styles, projections were used in a visit). */
const ONCE_PER_VALUE: ReadonlySet<ProductEvent> = new Set<ProductEvent>(['tool_used', 'style_changed', 'projection_viewed']);
/** Technical fields PostHog needs to accept an anonymous event. */
const KEEP = ['token', 'distinct_id', '$lib', '$lib_version', '$process_person_profile'] as const;

/** An event's own properties, cut down to its schema: unknown keys dropped, unknown values made 'other'. */
export function cleanProps(event: string, props: Record<string, unknown> | undefined): Record<string, string> {
  const schema = (SCHEMA as Record<string, Record<string, readonly string[]>>)[event];
  const out: Record<string, string> = {};
  if (!schema || !props) return out;
  for (const [k, allowed] of Object.entries(schema)) {
    if (!(k in props)) continue;
    const v = props[k];
    out[k] = typeof v === 'string' && allowed.includes(v) ? v : 'other';
  }
  return out;
}

/** Where the official app lives; nothing is tracked anywhere else. */
export const OFFICIAL_SITE = { hostname: 'mercurial20.github.io', path: '/loremapper/' };

export interface AnalyticsEnv {
  prod: boolean;
  token?: string;
  host?: string;
}

/** Whether analytics may run here: the official production build, at its address, without a privacy signal. */
export function analyticsAllowed(env: AnalyticsEnv, loc: Pick<Location, 'hostname' | 'pathname'>, nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean }): boolean {
  if (!env.prod || !env.token || !env.host?.startsWith('https://')) return false;
  if (loc.hostname !== OFFICIAL_SITE.hostname || !loc.pathname.startsWith(OFFICIAL_SITE.path)) return false;
  if (nav.globalPrivacyControl === true || nav.doNotTrack === '1' || nav.doNotTrack === 'yes') return false;
  return true;
}

/** The shape of an event just before it is sent (as PostHog's `before_send` sees it). */
export interface OutgoingEvent {
  event: string;
  properties?: Record<string, unknown>;
  $set?: unknown;
  $set_once?: unknown;
}

/** Last check before anything leaves: unknown events are dropped; properties cut to the technical minimum plus the event's schema. */
export function scrub<T extends OutgoingEvent>(e: T | null): T | null {
  if (!e || !Object.hasOwn(SCHEMA, e.event)) return null;
  const props = e.properties ?? {};
  const kept: Record<string, unknown> = {};
  for (const k of KEEP) if (k in props) kept[k] = props[k];
  Object.assign(kept, cleanProps(e.event, props));
  // never create or update a person
  kept.$process_person_profile = false;
  const out = { ...e, properties: kept } as T;
  delete out.$set;
  delete out.$set_once;
  return out;
}

/** What the tracker needs from the SDK. */
export interface AnalyticsClient {
  capture(event: string, properties?: Record<string, string>): unknown;
}

/** Event counting with a lazily loaded client; repeated events are deduplicated per page load where that's the point. */
export function createTracker(enabled: boolean, load: () => Promise<AnalyticsClient | null>) {
  const fired = new Set<string>();
  let client: Promise<AnalyticsClient | null> | null = null;
  return <E extends ProductEvent>(event: E, props?: EventProps<E>) => {
    const clean = cleanProps(event, props as Record<string, unknown> | undefined);
    if (ONCE.has(event) || ONCE_PER_VALUE.has(event)) {
      const key = ONCE.has(event) ? event : event + JSON.stringify(clean);
      if (fired.has(key)) return;
      fired.add(key);
    }
    if (!enabled) return;
    client ??= load().catch(() => null);
    void client
      .then((c) => (Object.keys(clean).length ? c?.capture(event, clean) : c?.capture(event)))
      .catch(() => {
        // analytics must never affect the editor
      });
  };
}

const env: AnalyticsEnv = { prod: import.meta.env.PROD, token: import.meta.env.VITE_POSTHOG_TOKEN, host: import.meta.env.VITE_POSTHOG_HOST };

async function loadPostHog(): Promise<AnalyticsClient | null> {
  // the slim build without external loading: no autocapture, replay, surveys or remote scripts in the code at all
  const { default: posthog } = await import('posthog-js/dist/module.slim.no-external');
  return posthog.init(env.token!, {
    api_host: env.host!,
    // nothing automatic
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    rageclick: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_web_experiments: true,
    disable_conversations: true,
    // no feature flags, remote config or extra scripts (and the requests they make)
    advanced_disable_flags: true,
    advanced_disable_feature_flags: true,
    advanced_disable_toolbar_metrics: true,
    disable_external_dependency_loading: true,
    // nothing stored on the device; an anonymous ID in memory for this page load only
    persistence: 'memory',
    disable_persistence: true,
    person_profiles: 'never',
    save_referrer: false,
    save_campaign_params: false,
    // plain JSON bodies, so what is sent can be read in the browser's network panel
    disable_compression: true,
    before_send: (e) => scrub(e),
  }) ?? null;
}

const allowed = typeof window !== 'undefined' && analyticsAllowed(env, window.location, navigator as Navigator & { globalPrivacyControl?: boolean });

/** Count a product event (a no-op outside the official site). */
export const track = createTracker(allowed, loadPostHog);
