-- Migration 0024: Legal engine — contracts, parties, clauses, audit trail
-- ---------------------------------------------------------------------------
-- Implements the smart-contract layer: deterministic document generation +
-- executable platform rules for commissions, authorship credits, and future
-- commerce/licensing/distribution/streaming use cases.
--
-- Principle:
--   node_relations.LICENSES/PURCHASES = ontological fact (who has rights)
--   legal_contracts + legal_clauses   = the process and document that created
--                                       that fact, with full negotiation history
--
-- Supported now: commissions, authorship credit splits
-- Ready for: licensing, distribution, marketplace, streaming, employment
-- ---------------------------------------------------------------------------

-- legal_contracts: top-level agreement
CREATE TABLE legal_contracts (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    reference_type TEXT,
    reference_id TEXT,
    governing_law TEXT NOT NULL DEFAULT 'MX',
    jurisdiction TEXT,
    valid_from TEXT,
    valid_until TEXT,
    signed_at TEXT,
    terminated_at TEXT,
    termination_reason TEXT,
    document_hash TEXT,
    created_by TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_legal_contracts_node_id    ON legal_contracts (node_id);
CREATE INDEX idx_legal_contracts_status     ON legal_contracts (status);
CREATE INDEX idx_legal_contracts_type_status ON legal_contracts (type, status);
CREATE INDEX idx_legal_contracts_created_by ON legal_contracts (created_by);
CREATE INDEX idx_legal_contracts_reference  ON legal_contracts (reference_type, reference_id);

-- legal_contract_parties: who is party to a contract, in what role
CREATE TABLE legal_contract_parties (
    id TEXT PRIMARY KEY NOT NULL,
    contract_id TEXT NOT NULL REFERENCES legal_contracts(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE RESTRICT,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
    role TEXT NOT NULL,
    signed_at TEXT,
    signature_ref TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (contract_id, profile_id, role)
);

CREATE INDEX idx_legal_contract_parties_contract ON legal_contract_parties (contract_id);
CREATE INDEX idx_legal_contract_parties_profile  ON legal_contract_parties (profile_id);
CREATE INDEX idx_legal_contract_parties_user     ON legal_contract_parties (user_id);

-- legal_clauses: typed, executable, negotiable rules within a contract
CREATE TABLE legal_clauses (
    id TEXT PRIMARY KEY NOT NULL,
    contract_id TEXT NOT NULL REFERENCES legal_contracts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    proposed_by_party_id TEXT REFERENCES legal_contract_parties(id) ON DELETE SET NULL,
    accepted_by TEXT NOT NULL DEFAULT '[]',       -- JSON array of party IDs
    value TEXT NOT NULL DEFAULT '{}',             -- JSON: type-specific parameters
    open_fields TEXT NOT NULL DEFAULT '[]',       -- JSON: unresolved field names
    parent_clause_id TEXT,                        -- counter-proposal chain
    position INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_legal_clauses_contract_status ON legal_clauses (contract_id, status);
CREATE INDEX idx_legal_clauses_contract_type   ON legal_clauses (contract_id, type);
CREATE INDEX idx_legal_clauses_parent          ON legal_clauses (parent_clause_id);

-- legal_clause_events: immutable append-only negotiation audit trail
CREATE TABLE legal_clause_events (
    id TEXT PRIMARY KEY NOT NULL,
    clause_id TEXT NOT NULL REFERENCES legal_clauses(id) ON DELETE CASCADE,
    party_id TEXT REFERENCES legal_contract_parties(id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_legal_clause_events_clause ON legal_clause_events (clause_id);
CREATE INDEX idx_legal_clause_events_party  ON legal_clause_events (party_id);

-- Connect commissions to their legal contract
ALTER TABLE commissions ADD COLUMN contract_id TEXT REFERENCES legal_contracts(id) ON DELETE SET NULL;
CREATE INDEX idx_commissions_contract_id ON commissions (contract_id);

-- Connect credit splits to the legal clause that locked them
ALTER TABLE node_credit_splits ADD COLUMN clause_id TEXT REFERENCES legal_clauses(id) ON DELETE SET NULL;
CREATE INDEX idx_credit_splits_clause_id ON node_credit_splits (clause_id);
