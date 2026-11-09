-- 001_users_movies_reviews
-- Käyttäjät, elokuvat (TMDB-välimuisti), genret ja arvostelut.
--
-- Aja vain migraatiotyökalulla (api/db/migrate.js), joka:
--   * ajaa tiedoston yhdessä transaktiossa,
--   * kirjaa version tauluun schema_migrations,
--   * ei aja samaa versiota uudelleen.
-- Älä lisää tähän tiedostoon BEGIN/COMMIT-lauseita.
-- Älä muokkaa tiedostoa sen jälkeen, kun se on ajettu yhteiseen kantaan:
-- tee muutokset uutena migraationa (003_..., 004_...).

-- Käyttäjätili (FR-04, NFR-03).
-- Salasana tallennetaan vain tiivisteenä (bcrypt/argon2), ei koskaan selväkielisenä.
CREATE TABLE users (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT        NOT NULL,
    nickname      TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_chk
        CHECK (char_length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
    CONSTRAINT users_nickname_chk
        CHECK (nickname = btrim(nickname) AND char_length(nickname) BETWEEN 2 AND 30),
    CONSTRAINT users_password_hash_chk
        CHECK (password_hash <> '')
);

-- Sähköposti ja nimimerkki ovat yksilöllisiä kirjainkoosta riippumatta.
CREATE UNIQUE INDEX users_email_lower_uq    ON users (lower(email));
CREATE UNIQUE INDEX users_nickname_lower_uq ON users (lower(nickname));

-- Elokuva (FR-01..FR-03). Perustiedot tulevat TMDB:stä; tähän tallennetaan
-- vain ne elokuvat, joihin sovelluksessa viitataan (arvostelu, toivelista, etusivu).
-- poster_path / backdrop_path ovat TMDB:n polkuja, esim. '/abc123.jpg';
-- frontend muodostaa kuvan URL-osoitteen TMDB:n kuvapalvelun perusosoitteesta.
-- Sivustolla näytetään toistaiseksi TMDB:n keskiarvo (tmdb_vote_average, asteikko 0-10).
-- tmdb_synced_at = milloin TMDB-tiedot on viimeksi päivitetty.
CREATE TABLE movies (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tmdb_id           INTEGER     NOT NULL,
    title             TEXT        NOT NULL,
    original_title    TEXT,
    overview          TEXT,
    release_date      DATE,
    runtime_minutes   SMALLINT,
    poster_path       TEXT,
    backdrop_path     TEXT,
    tmdb_vote_average NUMERIC(3, 1),
    tmdb_vote_count   INTEGER,
    tmdb_synced_at    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT movies_tmdb_id_uq        UNIQUE (tmdb_id),
    CONSTRAINT movies_tmdb_id_chk       CHECK (tmdb_id > 0),
    CONSTRAINT movies_title_chk         CHECK (btrim(title) <> ''),
    CONSTRAINT movies_runtime_chk       CHECK (runtime_minutes IS NULL OR runtime_minutes > 0),
    CONSTRAINT movies_poster_path_chk   CHECK (poster_path IS NULL OR poster_path LIKE '/%'),
    CONSTRAINT movies_backdrop_path_chk CHECK (backdrop_path IS NULL OR backdrop_path LIKE '/%'),
    CONSTRAINT movies_tmdb_vote_average_chk
        CHECK (tmdb_vote_average IS NULL OR tmdb_vote_average BETWEEN 0 AND 10),
    CONSTRAINT movies_tmdb_vote_count_chk
        CHECK (tmdb_vote_count IS NULL OR tmdb_vote_count >= 0)
);

-- Etusivun "uusimmat" (FR-02).
CREATE INDEX movies_release_date_idx ON movies (release_date DESC NULLS LAST);

-- Genre (FR-09, Should). id = oma avain, tmdb_id = TMDB:n genre-tunniste.
CREATE TABLE genres (
    id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tmdb_id INTEGER NOT NULL,
    name    TEXT    NOT NULL,
    CONSTRAINT genres_tmdb_id_uq  UNIQUE (tmdb_id),
    CONSTRAINT genres_tmdb_id_chk CHECK (tmdb_id > 0),
    CONSTRAINT genres_name_chk    CHECK (btrim(name) <> '')
);

-- Elokuvan genret (monesta moneen).
CREATE TABLE movie_genres (
    movie_id INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
    PRIMARY KEY (movie_id, genre_id)
);

-- "Elokuvat genren mukaan".
CREATE INDEX movie_genres_genre_id_idx ON movie_genres (genre_id);

-- Arvostelu (FR-06): 1-5 tähteä ja vapaaehtoinen kommentti.
-- Arvostelun tekee aina kirjautunut käyttäjä; yksi arvostelu per käyttäjä ja elokuva.
--
-- Kun käyttäjä poistaa tilinsä, arvostelu säilyy anonyyminä:
--   * trigger users_anonymize_reviews poistaa kommentin ja asettaa author_deleted_at,
--   * viiteavain asettaa user_id = NULL (ON DELETE SET NULL).
-- Rivi, jolla user_id on NULL, on siis aina "poistetun käyttäjän" arvostelu ilman kommenttia.
-- (Myöhemmin anonyymit arviot voidaan lisätä uudella sarakkeella, esim. guest_token,
--  ja laajentamalla tarkistusta reviews_author_chk.)
--
-- Elokuvaa, jolla on arvosteluja, ei voi poistaa (RESTRICT).
CREATE TABLE reviews (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           INTEGER     REFERENCES users (id)  ON DELETE SET NULL,
    movie_id          INTEGER     NOT NULL REFERENCES movies (id) ON DELETE RESTRICT,
    rating            SMALLINT    NOT NULL,
    comment           TEXT,
    author_deleted_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reviews_user_movie_uq UNIQUE (user_id, movie_id),
    CONSTRAINT reviews_rating_chk    CHECK (rating BETWEEN 1 AND 5),
    -- Tyhjä kommentti tallennetaan NULL-arvona, ei tyhjänä merkkijonona.
    CONSTRAINT reviews_comment_chk
        CHECK (comment IS NULL OR char_length(btrim(comment)) BETWEEN 1 AND 2000),
    -- Ilman käyttäjää vain poistetun käyttäjän anonymisoitu arvostelu.
    CONSTRAINT reviews_author_chk
        CHECK (user_id IS NOT NULL OR (author_deleted_at IS NOT NULL AND comment IS NULL))
);

-- Elokuvan sivun arvostelut uusimmasta alkaen (FR-03, FR-06).
-- Käyttäjän omat arvostelut käyttävät indeksiä reviews_user_movie_uq.
CREATE INDEX reviews_movie_created_idx ON reviews (movie_id, created_at DESC);

-- Tilin poisto: arvosana jää, kommentti poistuu.
CREATE FUNCTION anonymize_reviews_of_deleted_user()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE reviews
    SET comment = NULL,
        author_deleted_at = now(),
        updated_at = now()
    WHERE user_id = OLD.id;
    RETURN OLD;
END;
$$;

CREATE TRIGGER users_anonymize_reviews
    BEFORE DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION anonymize_reviews_of_deleted_user();
