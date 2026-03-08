-- Migration 0022: Credit tree, temporal edges, and query optimisation
-- ---------------------------------------------------------------------------
-- 1. node_relations — add weight, valid_from, valid_until columns
-- 2. node_relations — add reverse-traversal index with created_at; drop old idx
-- 3. node_relations — add valid_until index for temporal filtering
-- 4. nodes           — add composite (type, visibility) discovery index
-- 5. profile_nodes   — add denormalised counters
-- 6. node_credit_splits — new pre-computed attribution table
-- ---------------------------------------------------------------------------

-- 1. Temporal + credit-weight fields on edges
ALTER TABLE node_relations ADD COLUMN weight REAL;
ALTER TABLE node_relations ADD COLUMN valid_from TEXT;
ALTER TABLE node_relations ADD COLUMN valid_until TEXT;

-- 2. Replace idx_node_relations_to_type with a version that includes created_at
--    for efficient "recent followers / recent derivatives" ORDER BY queries.
DROP INDEX IF EXISTS idx_node_relations_to_type;
CREATE INDEX idx_node_relations_to_type_created ON node_relations (to_id, type, created_at);

-- 3. Index for active-only temporal queries:
--    WHERE valid_until IS NULL OR valid_until > datetime('now')
CREATE INDEX idx_node_relations_valid_until ON node_relations (valid_until);

-- 4. Discovery index on nodes: "all public artworks", "all public profiles"
CREATE INDEX idx_nodes_type_visibility ON nodes (type, visibility);

-- 5. Denormalised counters on profile_nodes (updated by server actions, not triggers)
ALTER TABLE profile_nodes ADD COLUMN artwork_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_nodes ADD COLUMN follower_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_nodes ADD COLUMN following_count INTEGER NOT NULL DEFAULT 0;

-- Backfill existing profile counters from current node_relations data
UPDATE profile_nodes
SET artwork_count = (
    SELECT COUNT(*)
    FROM node_relations nr
    WHERE nr.from_id = profile_nodes.id
      AND nr.type IN ('creates', 'collaborates')
);

UPDATE profile_nodes
SET follower_count = (
    SELECT COUNT(*)
    FROM node_relations nr
    WHERE nr.to_id = profile_nodes.id
      AND nr.type = 'follows'
);

UPDATE profile_nodes
SET following_count = (
    SELECT COUNT(*)
    FROM node_relations nr
    WHERE nr.from_id = profile_nodes.id
      AND nr.type = 'follows'
);

-- 6. Pre-computed credit / revenue split table
CREATE TABLE node_credit_splits (
    id TEXT PRIMARY KEY NOT NULL,
    source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    beneficiary_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    split_pct REAL NOT NULL,
    derivation_depth INTEGER NOT NULL DEFAULT 0,
    chain TEXT,                         -- JSON array of node IDs
    basis TEXT NOT NULL,                -- relation type: creates, derived_from, etc.
    computed_at TEXT NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    UNIQUE (source_node_id, beneficiary_id)
);

CREATE INDEX idx_credit_splits_source      ON node_credit_splits (source_node_id);
CREATE INDEX idx_credit_splits_beneficiary ON node_credit_splits (beneficiary_id);
