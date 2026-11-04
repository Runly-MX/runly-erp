-- Deleted pages kept their route_path, and the (company, site, route_path) unique
-- index blocked any new page on that route. Tombstone them like softDeletePage does now.
UPDATE website_page
SET route_path = route_path || '#deleted-' || id::text
WHERE enabled = false AND route_path NOT LIKE '%#deleted-%';
