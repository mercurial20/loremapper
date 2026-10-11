import { describe, expect, it, vi } from 'vitest';
import { analyticsAllowed, createTracker, OFFICIAL_SITE, scrub, type ProductEvent } from './analytics';

const env = { prod: true, token: 'phc_test', host: 'https://us.i.posthog.com' };
const site = { hostname: OFFICIAL_SITE.hostname, pathname: OFFICIAL_SITE.path };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('where analytics may run', () => {
  it('runs only in the official production build, at the official address', () => {
    expect(analyticsAllowed(env, site, {})).toBe(true);
    expect(analyticsAllowed(env, { ...site, pathname: '/loremapper/?viewer=1' }, {})).toBe(true);
    // development, a build without a token, or a non-HTTPS host
    expect(analyticsAllowed({ ...env, prod: false }, site, {})).toBe(false);
    expect(analyticsAllowed({ ...env, token: '' }, site, {})).toBe(false);
    expect(analyticsAllowed({ ...env, token: undefined }, site, {})).toBe(false);
    expect(analyticsAllowed({ ...env, host: 'http://us.i.posthog.com' }, site, {})).toBe(false);
    // localhost, previews, forks and other apps on the same GitHub Pages origin
    expect(analyticsAllowed(env, { hostname: 'localhost', pathname: '/loremapper/' }, {})).toBe(false);
    expect(analyticsAllowed(env, { hostname: 'someone.github.io', pathname: '/loremapper/' }, {})).toBe(false);
    expect(analyticsAllowed(env, { hostname: OFFICIAL_SITE.hostname, pathname: '/other-app/' }, {})).toBe(false);
    expect(analyticsAllowed(env, { hostname: OFFICIAL_SITE.hostname, pathname: '/loremapper-fork/' }, {})).toBe(false);
  });

  it('respects Do Not Track and Global Privacy Control', () => {
    expect(analyticsAllowed(env, site, { doNotTrack: '1' })).toBe(false);
    expect(analyticsAllowed(env, site, { doNotTrack: 'yes' })).toBe(false);
    expect(analyticsAllowed(env, site, { globalPrivacyControl: true })).toBe(false);
    expect(analyticsAllowed(env, site, { doNotTrack: '0', globalPrivacyControl: false })).toBe(true);
  });
});

describe('what may leave the browser', () => {
  it('drops every event but the five', () => {
    for (const name of ['$pageview', '$pageleave', '$autocapture', '$identify', '$exception', '$web_vitals', 'map_created_extra', ''])
      expect(scrub({ event: name, properties: { token: 't' } })).toBeNull();
    expect(scrub(null)).toBeNull();
  });

  it('keeps only the technical fields PostHog needs, and never a person', () => {
    const out = scrub({
      event: 'map_exported',
      uuid: 'u',
      timestamp: 't',
      properties: {
        token: 'phc',
        distinct_id: 'anon',
        $lib: 'web',
        $lib_version: '1',
        $current_url: 'https://mercurial20.github.io/loremapper/?map=Secret',
        $pathname: '/loremapper/',
        $referrer: 'https://example.com',
        $browser: 'Chrome',
        $os: 'Mac OS X',
        $screen_width: 1440,
        $session_id: 's',
        $device_id: 'd',
        name: 'My World',
        seed: 12345,
      },
      $set: { email: 'x' },
      $set_once: { first: 'y' },
    });
    expect(out?.properties).toEqual({ token: 'phc', distinct_id: 'anon', $lib: 'web', $lib_version: '1', $process_person_profile: false });
    expect(out).not.toHaveProperty('$set');
    expect(out).not.toHaveProperty('$set_once');
    expect(out).toMatchObject({ event: 'map_exported', uuid: 'u', timestamp: 't' });
    expect(JSON.stringify(out)).not.toMatch(/Secret|My World|12345|example\.com|Chrome/);
  });
});

describe('event counting', () => {
  it('sends each event through the client, loading it once', async () => {
    const capture = vi.fn();
    const load = vi.fn(async () => ({ capture }));
    const track = createTracker(true, load);
    for (const e of ['map_created', 'world_generated', 'map_exported', 'map_created'] as ProductEvent[]) track(e);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls.map((c) => c[0])).toEqual(['map_created', 'world_generated', 'map_exported', 'map_created']);
    // only the event name: no properties are ever passed
    expect(capture.mock.calls.every((c) => c.length === 1)).toBe(true);
  });

  it('counts a return to a project and the first edit at most once per page load', async () => {
    const capture = vi.fn();
    const track = createTracker(true, async () => ({ capture }));
    for (let i = 0; i < 3; i++) {
      track('project_reopened');
      track('first_edit');
    }
    await flush();
    expect(capture.mock.calls.map((c) => c[0])).toEqual(['project_reopened', 'first_edit']);
  });

  it('does nothing at all when disabled', async () => {
    const load = vi.fn(async () => ({ capture: vi.fn() }));
    const track = createTracker(false, load);
    track('map_created');
    track('first_edit');
    await flush();
    expect(load).not.toHaveBeenCalled();
  });

  it('never throws when the SDK is blocked or broken', async () => {
    const failing = createTracker(true, () => Promise.reject(new Error('blocked by an ad blocker')));
    expect(() => failing('map_created')).not.toThrow();
    const throwing = createTracker(true, async () => ({
      capture: () => {
        throw new Error('network down');
      },
    }));
    expect(() => throwing('map_exported')).not.toThrow();
    await flush();
  });
});
