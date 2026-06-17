import type { AppHost } from '@shared/app'

/**
 * Stable, unique base name for a host's vhost / rewrite / log files.
 *
 * Historically these files were named by `host.name`, which collides when
 * two sites share the same domain (typically multiple `localhost` sites
 * distinguished only by port — see #700). `host.id` is unique per site and
 * never changes across renames, so it is used as the on-disk file base.
 */
export const vhostName = (host: Pick<AppHost, 'id'>): string => `${host.id}`
