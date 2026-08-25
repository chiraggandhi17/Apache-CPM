-- Migration 00004: Demo Seed Data for Apache Footwear T&A

DO $$
DECLARE
  v_dept_id UUID := '10000000-0000-0000-0000-000000000001';
  v_season_id UUID := '20000000-0000-0000-0000-000000000002';
  v_project_id UUID := '30000000-0000-0000-0000-000000000003';
  v_start_prod_id UUID := '40000000-0000-0000-0000-000000000004';
  v_mat_a_id UUID := '50000000-0000-0000-0000-000000000005';
  v_contact_vendor_id UUID := '60000000-0000-0000-0000-000000000006';
  v_mat_b_id UUID := '70000000-0000-0000-0000-000000000007';
  v_qc_id UUID := '80000000-0000-0000-0000-000000000008';
  v_final_date TIMESTAMPTZ := '2026-12-31T00:00:00Z'::TIMESTAMPTZ;
BEGIN

  -- 1. Root Department: Production
  INSERT INTO nodes (id, parent_id, type, title, description, color, department, sort_order)
  VALUES (v_dept_id, NULL, 'department', 'Production', 'Footwear Manufacturing & Assembly', '#2563EB', 'Production', 1)
  ON CONFLICT (id) DO NOTHING;

  -- 2. Season: SS26 (inherits blue)
  INSERT INTO nodes (id, parent_id, type, title, description, department, season, sort_order)
  VALUES (v_season_id, v_dept_id, 'season', 'SS26', 'Spring/Summer 2026 Collection for adidas', 'Production', 'SS26', 1)
  ON CONFLICT (id) DO NOTHING;

  -- 3. Project: Model X — Running Shoe (color override: Teal #0D9488)
  INSERT INTO nodes (id, parent_id, type, title, description, color, planned_date, department, season, sort_order)
  VALUES (v_project_id, v_season_id, 'project', 'Model X — Running Shoe', 'High Performance Running Shoes - ex-factory deadline', '#0D9488', v_final_date, 'Production', 'SS26', 1)
  ON CONFLICT (id) DO NOTHING;

  -- 4. Task: "Start Production" (offset: -30 days before ex-factory = Dec 01, 2026)
  INSERT INTO nodes (id, parent_id, type, title, description, trigger_offset_days, planned_date, status, is_critical, department, season, sort_order)
  VALUES (v_start_prod_id, v_project_id, 'task', 'Start Production', 'Bulk assembly line setup and upper stitching', -30, v_final_date - INTERVAL '30 days', 'in_progress', true, 'Production', 'SS26', 1)
  ON CONFLICT (id) DO NOTHING;

  -- 5. Subtask: "Material A in-house" (offset: -7 days before Start Production = Nov 24, 2026)
  INSERT INTO nodes (id, parent_id, type, title, description, trigger_offset_days, planned_date, status, is_critical, assignee, department, season, sort_order)
  VALUES (v_mat_a_id, v_start_prod_id, 'subtask', 'Material A in-house (Mesh Upper)', 'Vendor batch delivery to factory warehouse', -7, (v_final_date - INTERVAL '37 days'), 'not_started', true, 'Merchandising Team', 'Production', 'SS26', 1)
  ON CONFLICT (id) DO NOTHING;

  -- 6. Subtask under Material A: "Contact Vendor re: Material A" (absolute date = Nov 20, 2026)
  INSERT INTO nodes (id, parent_id, type, title, description, planned_date, status, assignee, vendor_contact, department, season, sort_order)
  VALUES (v_contact_vendor_id, v_mat_a_id, 'subtask', 'Contact Vendor re: Material A', 'Confirm dispatch status with Supplier X', (v_final_date - INTERVAL '41 days'), 'done', 'Alex (Purchasing)', 'supplier-x@footwear-materials.com', 'Production', 'SS26', 1)
  ON CONFLICT (id) DO NOTHING;

  -- 7. Reminder on Contact Vendor: "Follow up if no confirmation" (offset: +2 days after contact date)
  INSERT INTO reminders (node_id, remind_at, offset_days, message)
  VALUES (v_contact_vendor_id, (v_final_date - INTERVAL '39 days'), 2, 'Follow up if no dispatch confirmation received from Supplier X')
  ON CONFLICT DO NOTHING;

  -- 8. Subtask: "Material B in-house" (offset: -5 days before Start Production = Nov 26, 2026)
  INSERT INTO nodes (id, parent_id, type, title, description, trigger_offset_days, planned_date, status, is_critical, assignee, department, season, sort_order)
  VALUES (v_mat_b_id, v_start_prod_id, 'subtask', 'Material B in-house (Outsole Rubber)', 'Compounding and outsole pressing arrival', -5, (v_final_date - INTERVAL '35 days'), 'not_started', false, 'Supply Chain', 'Production', 'SS26', 2)
  ON CONFLICT (id) DO NOTHING;

  -- 9. Task: "QC Inspection" (offset: -10 days before ex-factory = Dec 21, 2026)
  INSERT INTO nodes (id, parent_id, type, title, description, trigger_offset_days, planned_date, status, is_critical, assignee, department, season, sort_order)
  VALUES (v_qc_id, v_project_id, 'task', 'QC Inspection (AQL 2.5)', 'Final quality audit before packing & container loading', -10, (v_final_date - INTERVAL '10 days'), 'not_started', true, 'Quality Assurance Manager', 'Production', 'SS26', 2)
  ON CONFLICT (id) DO NOTHING;

END $$;
