-- Split "collection" node type into two distinct types:
--   folder     → private, dir-like workspace organization (move semantics: items inside
--                disappear from root workspace view)
--   collection → cross-user boards/saves (reference semantics: saved artworks still appear
--                at their owner's root)
--
-- All existing "collection" nodes were user-created personal folders. Rename them.
UPDATE nodes SET type = 'folder' WHERE type = 'collection';
