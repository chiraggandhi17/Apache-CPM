import type { NodeLocationMode } from '../types/domain';

// Where/how a milestone happens — modeled after real client production
// calendars (e.g. Apache India's SS28 gate tracker), which track this
// alongside date/status/owner for travel planning and cross-team visibility.
export const LOCATION_MODE_OPTIONS: { value: NodeLocationMode; label: string }[] = [
  { value: 'online', label: 'Online meeting' },
  { value: 'onsite_visit', label: 'On-site visit' },
  { value: 'internal_only', label: 'Internal only' },
  { value: 'async', label: 'Async (email/Teams)' },
];

export function locationModeLabel(mode: NodeLocationMode | null | undefined): string | null {
  if (!mode) return null;
  return LOCATION_MODE_OPTIONS.find(o => o.value === mode)?.label || null;
}
