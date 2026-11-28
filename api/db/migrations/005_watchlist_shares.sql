CREATE TABLE watchlist_shares (
    watchlist_id INTEGER     NOT NULL REFERENCES watchlists (id) ON DELETE CASCADE,
    group_id     INTEGER     NOT NULL REFERENCES groups (id)     ON DELETE CASCADE,
    shared_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (watchlist_id, group_id)
);


CREATE INDEX watchlist_shares_group_id_idx ON watchlist_shares (group_id);