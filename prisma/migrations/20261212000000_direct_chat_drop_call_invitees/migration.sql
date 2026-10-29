-- Inviting people into a direct chat's call used to add them as members of
-- that direct conversation, exposing its private history and listing them in
-- read receipts. Calls now attach them as call participants only; this
-- removes the members added that way, keeping the two original people (the
-- earliest-joined members).
WITH ranked AS (
  SELECT m.id,
         row_number() OVER (PARTITION BY m.conversation_id ORDER BY m.joined_at, m.id) AS position
  FROM chat_conversation_members m
  JOIN chat_conversations c ON c.id = m.conversation_id
  WHERE c.type = 'direct'
    AND m.user_id IS NOT NULL
    AND m.left_at IS NULL
)
UPDATE chat_conversation_members m
SET left_at = NOW()
FROM ranked r
WHERE r.id = m.id
  AND r.position > 2;
