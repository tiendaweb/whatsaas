ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

UPDATE custom_fields cf
SET position = sub.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at ASC) AS rn
  FROM custom_fields
) sub
WHERE cf.id = sub.id;
