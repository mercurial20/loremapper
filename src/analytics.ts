/**
 * Minimal product analytics for the official hosted app only: five anonymous
 * event counts (a map was created, generated, edited, reopened, exported).
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
 * - Every outgoing event passes `scrub`: only the five names are allowed, and
 *   only the technical fields PostHog needs to accept an event are kept.
 *   Map contents, names, seeds, coordinates and URLs are never sent.
 * - Failures (blocked requests, offline, a broken SDK) are swallowed: the
 *   editor never waits for analytics.
 */

export type ProductEvent = 'map_created' | 'world_generated' | 'project_reopened' | 'first_edit' | 'map_exported';

const EVENTS: ReadonlySet<string> = new Set<ProductEvent>(['map_created', 'world_generated', 'project_reopened', 'first_edit', 'map_exported']);
/** Events counted at most once per page load. */
const ONCE: ReadonlySet<ProductEvent> = new Set<ProductEvent>(['project_reopened', 'first_edit']);
/** The only properties allowed out: what PostHog needs to accept an anonymous event. */
const KEEP = ['token', 'distinct_id', '$lib', '$lib_version', '$process_person_profile'] as const;

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

/** Last check before anything leaves: unknown events are dropped, properties cut down to the technical minimum. */
export function scrub<T extends OutgoingEvent>(e: T | null): T | null {
  if (!e || !EVENTS.has(e.event)) return null;
  const props = e.properties ?? {};
  const kept: Record<string, unknown> = {};
  for (const k of KEEP) if (k in props) kept[k] = props[k];
  // never create or update a person
  kept.$process_person_profile = false;
  const out = { ...e, properties: kept } as T;
  delete out.$set;
  delete out.$set_once;
  return out;
}

/** What the tracker needs from the SDK. */
export interface AnalyticsClient {
  capture(event: string): unknown;
}

/** Event counting with a lazily loaded client; at-most-once events are deduplicated per page load. */
export function createTracker(enabled: boolean, load: () => Promise<AnalyticsClient | null>) {
  const fired = new Set<ProductEvent>();
  let client: Promise<AnalyticsClient | null> | null = null;
  return (event: ProductEvent) => {
    if (ONCE.has(event)) {
      if (fired.has(event)) return;
      fired.add(event);
    }
    if (!enabled) return;
    client ??= load().catch(() => null);
    void client
      .then((c) => c?.capture(event))
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

/** Count one of the five product events (a no-op outside the official site). */
export const track = createTracker(allowed, loadPostHog);
