-- No network (IP) label printing exists: legacy 'network' printers become
-- 'file' (ZPL download) or 'browser' (PDF/PNG opened for the print dialog).
UPDATE "inv_label_printer" SET "transport" = CASE WHEN "format" = 'zpl' THEN 'file' ELSE 'browser' END WHERE "transport" = 'network';
