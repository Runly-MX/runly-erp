-- runly.lms: free sections open without enrolling (spec 17)

ALTER TABLE "lms_section" ADD COLUMN "free" BOOLEAN NOT NULL DEFAULT false;
