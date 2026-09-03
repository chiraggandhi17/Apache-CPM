-- Migration 00015: Location / Working-Mode on Nodes
--
-- Real client production calendars (e.g. Apache India's SS28 gate tracker)
-- tag every milestone with WHERE and HOW it happens, not just when:
--   - purely online (Asia <-> India via video call)
--   - a physical visit to a vendor/client site
--   - internal-only (no external attendees)
--   - async coordination via email / Teams, no live meeting
-- This powers travel planning and cross-team visibility that today only
-- exists as free text buried in a Remark/Note column.

CREATE TYPE node_location_mode AS ENUM (
  'online',
  'onsite_visit',
  'internal_only',
  'async'
);

ALTER TABLE nodes
  ADD COLUMN location_mode node_location_mode;

COMMENT ON COLUMN nodes.location_mode IS
  'Where/how this milestone happens: online meeting, an in-person site visit, internal-only discussion, or async email/Teams coordination. Nullable — most tasks will not set this.';
