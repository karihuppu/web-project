-- 002_watchlists_groups
-- Toivelistat sekä ryhmät ja ryhmien jäsenyydet.
-- Katso ohjeet tiedostosta 001_users_movies_reviews.sql (ei BEGIN/COMMIT, ei jälkikäteisiä muokkauksia).

-- Toivelista (FR-05). Käyttäjällä voi olla useita nimettyjä listoja.
CREATE TABLE watchlists (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT watchlists_name_chk
        CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 100)
);

-- Saman käyttäjän listoilla on eri nimet (kirjainkoosta riippumatta).
-- Indeksi palvelee myös hakua "käyttäjän listat".
CREATE UNIQUE INDEX watchlists_user_name_uq ON watchlists (user_id, lower(name));

-- Toivelistan elokuvat. Sama elokuva vain kerran samalla listalla.
-- Listan poisto poistaa rivit; elokuvaa, joka on jollakin listalla, ei voi poistaa.
CREATE TABLE watchlist_movies (
    watchlist_id INTEGER     NOT NULL REFERENCES watchlists (id) ON DELETE CASCADE,
    movie_id     INTEGER     NOT NULL REFERENCES movies (id)     ON DELETE RESTRICT,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (watchlist_id, movie_id)
);

CREATE INDEX watchlist_movies_movie_id_idx ON watchlist_movies (movie_id);

-- Ryhmä (FR-07): julkinen tai yksityinen.
-- created_by säilyy historiatietona; jos luojan tili poistetaan, arvo muuttuu NULLiksi.
-- Ylläpito-oikeudet määräytyvät taulusta group_members.
CREATE TABLE groups (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT,
    visibility  TEXT        NOT NULL DEFAULT 'private',
    created_by  INTEGER     REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT groups_name_chk
        CHECK (name = btrim(name) AND char_length(name) BETWEEN 2 AND 100),
    CONSTRAINT groups_description_chk
        CHECK (description IS NULL OR char_length(description) <= 1000),
    CONSTRAINT groups_visibility_chk
        CHECK (visibility IN ('public', 'private'))
);

CREATE INDEX groups_created_by_idx ON groups (created_by);

-- Ryhmän jäsenyys ja rooli ryhmässä (FR-07, FR-11).
-- 'admin' = ryhmän ylläpitäjä, 'member' = tavallinen jäsen. Ylläpitäjiä voi olla useita.
-- Ryhmän tai käyttäjän poisto poistaa jäsenyydet.
CREATE TABLE group_members (
    group_id  INTEGER     NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    user_id   INTEGER     NOT NULL REFERENCES users (id)  ON DELETE CASCADE,
    role      TEXT        NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id),
    CONSTRAINT group_members_role_chk CHECK (role IN ('admin', 'member'))
);

-- "Käyttäjän ryhmät".
CREATE INDEX group_members_user_id_idx ON group_members (user_id);

-- Ryhmän luoja lisätään automaattisesti ylläpitäjäksi.
-- Backendin ei tarvitse tehdä erillistä INSERTiä tauluun group_members.
CREATE FUNCTION add_group_creator_as_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO group_members (group_id, user_id, role)
        VALUES (NEW.id, NEW.created_by, 'admin');
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER groups_add_creator_as_admin
    AFTER INSERT ON groups
    FOR EACH ROW
    EXECUTE FUNCTION add_group_creator_as_admin();

-- Ryhmällä on aina ylläpitäjä:
--   * Kun viimeinen ylläpitäjä poistuu (eroaa, poistetaan ryhmästä tai poistaa tilinsä),
--     pisimpään ryhmässä ollut jäsen (joined_at) nostetaan ylläpitäjäksi.
--   * Jos jäseniä ei enää ole, ryhmä poistetaan.
--   * Viimeistä ylläpitäjää ei voi alentaa jäseneksi (virhe 23514); nimeä ensin toinen ylläpitäjä.
CREATE FUNCTION ensure_group_has_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    successor_id INTEGER;
BEGIN
    -- Lukitaan ryhmä, jotta samanaikaiset poistumiset käsitellään vuorotellen.
    PERFORM 1 FROM groups WHERE id = OLD.group_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL; -- koko ryhmä on poistettu
    END IF;

    IF EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = OLD.group_id AND role = 'admin'
    ) THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Group % must have at least one admin', OLD.group_id
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT user_id INTO successor_id
    FROM group_members
    WHERE group_id = OLD.group_id
    ORDER BY joined_at, user_id
    LIMIT 1;

    IF successor_id IS NULL THEN
        DELETE FROM groups WHERE id = OLD.group_id;
    ELSE
        UPDATE group_members
        SET role = 'admin'
        WHERE group_id = OLD.group_id AND user_id = successor_id;
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER group_members_keep_admin
    AFTER DELETE OR UPDATE OF role ON group_members
    FOR EACH ROW
    WHEN (OLD.role = 'admin')
    EXECUTE FUNCTION ensure_group_has_admin();
