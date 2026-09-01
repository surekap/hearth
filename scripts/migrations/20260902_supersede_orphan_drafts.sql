-- Retire draft extracted_items belonging to superseded extraction jobs.
--
-- Re-extracting a document creates a new job, but the previous job's un-actioned
-- drafts were never settled. They are invisible in the review UI (it renders the
-- latest job only) yet remained acceptable by job id, which would have written
-- stale extraction output into confirmed records.
--
-- The accept route now settles these automatically and refuses superseded jobs;
-- this clears the backlog that accumulated before that fix.
--
-- Only touches rows that are BOTH draft AND owned by a non-latest job whose
-- document already has a newer job. Idempotent: re-running matches nothing.

BEGIN;

with latest as (
  select distinct on (document_id) id, document_id
  from extraction_jobs
  order by document_id, created_at desc
)
update extracted_items i
set status = 'rejected'
from extraction_jobs j
join latest l on l.document_id = j.document_id
where i.extraction_job_id = j.id
  and i.status = 'draft'
  and j.id <> l.id;

COMMIT;
