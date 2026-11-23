-- search_tsv is derived from exhibit fields and must stay current on writes.
-- The earlier migration created it as a nullable plain column, so full-text
-- search silently returned no matches for records written after that change.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent($1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

DROP INDEX IF EXISTS "exhibits_search_tsv_idx";
ALTER TABLE "exhibits" DROP COLUMN IF EXISTS "search_tsv";
ALTER TABLE "exhibits" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(display_id, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(legacy_id, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(exhibit_name, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(manufacturer, ''))), 'B') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(comment, ''))), 'C') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(attributes::text, ''))), 'C')
  ) STORED;
CREATE INDEX "exhibits_search_tsv_idx" ON "exhibits" USING GIN("search_tsv");
