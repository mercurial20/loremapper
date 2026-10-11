interface ImportMetaEnv {
  /** PostHog project token (public, write-only); set only for the official GitHub Pages build. */
  readonly VITE_POSTHOG_TOKEN?: string;
  /** PostHog ingestion host, e.g. https://us.i.posthog.com. */
  readonly VITE_POSTHOG_HOST?: string;
}
