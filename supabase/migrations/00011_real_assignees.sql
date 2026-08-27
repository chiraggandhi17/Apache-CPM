-- ============================================================================
-- CADENCE CPM: MIGRATION 00011 — REAL ASSIGNEES (ORG MEMBER LINKING)
-- ============================================================================
-- Adds a proper FK-linked assignee alongside the existing free-text
-- `assignee` column. For organization accounts, the app now assigns a real
-- team member (picked from a dropdown) and stores their profile id here;
-- permission checks (NodeContext.canUserEditNode /
-- isNodeAncestorOfAssigned) match on this id instead of fuzzy-matching the
-- free-text name/email, which was fragile (false positives/negatives from
-- partial name matches).
--
-- The free-text `assignee` column is kept and still populated (with the
-- selected member's display name) for organization accounts, so existing
-- search/display code keeps working unchanged. For individual accounts the
-- `assignee` column keeps its original purpose: a free-text personal note
-- ("who do I need to follow up with") with no permission meaning.

ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nodes_assignee_user_id ON public.nodes(assignee_user_id);

COMMENT ON COLUMN public.nodes.assignee_user_id IS
  'Org-member profile id this task is assigned to. NULL for individual-account nodes and for legacy org nodes assigned before this migration (those still fall back to fuzzy-matching the free-text assignee column).';
