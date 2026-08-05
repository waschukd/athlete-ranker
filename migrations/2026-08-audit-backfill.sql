-- Backfill audit_log attribution: derive age_category_id (from the referenced
-- schedule or athlete) and organization_id (from the category) on existing rows
-- so the SP/Association audit views can scope them. Rows referencing deleted
-- athletes (pre-rebuild cruft) stay unscoped and are excluded from the views.
UPDATE audit_log al SET age_category_id = es.age_category_id
  FROM evaluation_schedule es
  WHERE al.age_category_id IS NULL AND al.entity_type = 'evaluation_schedule' AND al.entity_id = es.id AND es.age_category_id IS NOT NULL;
UPDATE audit_log al SET age_category_id = a.age_category_id
  FROM athletes a
  WHERE al.age_category_id IS NULL AND al.entity_type = 'athlete' AND al.entity_id = a.id AND a.age_category_id IS NOT NULL;
UPDATE audit_log al SET organization_id = ac.organization_id
  FROM age_categories ac
  WHERE al.organization_id IS NULL AND al.age_category_id = ac.id;
