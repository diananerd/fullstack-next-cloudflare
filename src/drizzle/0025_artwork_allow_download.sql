-- Add allow_download permission flag to artworks.
-- Separates VIEW (implicit for public visibility) from DOWNLOAD_ORIGINAL (explicit owner opt-in).
-- Default false: public artworks are view-only unless the owner explicitly enables download.
ALTER TABLE artworks ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 0;
