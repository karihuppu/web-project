-- schema_checks.sql
-- Tarkistaa tärkeimmät rajoitteet, triggerit ja poistojen käyttäytymisen.
--
-- Ajetaan komennolla `npm run db:check`, joka suorittaa tiedoston transaktiossa
-- ja tekee lopuksi aina ROLLBACKin: tietokantaan ei jää testirivejä.
-- Epäonnistunut tarkistus keskeyttää ajon virheellä "FAIL: ...".
-- SQLSTATE-koodit: 23505 unique, 23514 check, 23502 not null,
-- 23503 foreign key, 23001 ON DELETE RESTRICT.
-- Tiedosto ei riipu demodatasta.

CREATE FUNCTION pg_temp.expect_error(stmt TEXT, expected_state TEXT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    BEGIN
        EXECUTE stmt;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = expected_state THEN
            RAISE NOTICE 'OK: %', label;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL: % (odotettiin %, saatiin %: %)', label, expected_state, SQLSTATE, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL: % (lause onnistui, vaikka sen piti epäonnistua)', label;
END;
$$;

CREATE FUNCTION pg_temp.expect_count(query TEXT, expected BIGINT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    actual BIGINT;
BEGIN
    EXECUTE query INTO actual;
    IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'FAIL: % (odotettiin %, saatiin %)', label, expected, actual;
    END IF;
    RAISE NOTICE 'OK: %', label;
END;
$$;

-- Testidata. Sähköpostit ja tunnisteet on valittu niin, etteivät ne törmää demodataan.
INSERT INTO users (email, nickname, password_hash)
VALUES
    ('Check.One@Example.test',   'check_one',   '!x'),
    ('check.two@example.test',   'check_two',   '!x'),
    ('check.three@example.test', 'check_three', '!x');

INSERT INTO movies (tmdb_id, title) VALUES (999000001, 'Check Movie A'), (999000002, 'Check Movie B');
INSERT INTO genres (tmdb_id, name) VALUES (999000001, 'Check Genre');

-- (1) Käyttäjät
SELECT pg_temp.expect_error(
    $q$INSERT INTO users (email, nickname, password_hash) VALUES ('check.ONE@example.TEST', 'other_nick', '!x')$q$,
    '23505', 'sähköposti on yksilöllinen kirjainkoosta riippumatta');
SELECT pg_temp.expect_error(
    $q$INSERT INTO users (email, nickname, password_hash) VALUES ('third@example.test', 'CHECK_ONE', '!x')$q$,
    '23505', 'nimimerkki on yksilöllinen kirjainkoosta riippumatta');
SELECT pg_temp.expect_error(
    $q$INSERT INTO users (email, nickname, password_hash) VALUES ('not-an-email', 'nick3', '!x')$q$,
    '23514', 'virheellinen sähköposti hylätään');
SELECT pg_temp.expect_error(
    $q$INSERT INTO users (email, nickname, password_hash) VALUES ('x@example.test', ' padded ', '!x')$q$,
    '23514', 'nimimerkki ilman ylimääräisiä välilyöntejä');
SELECT pg_temp.expect_error(
    $q$INSERT INTO users (email, nickname) VALUES ('y@example.test', 'nick4')$q$,
    '23502', 'password_hash on pakollinen');

-- (2) Elokuvat ja genret
SELECT pg_temp.expect_error(
    $q$INSERT INTO movies (tmdb_id, title) VALUES (999000001, 'Duplicate')$q$,
    '23505', 'tmdb_id on yksilöllinen');
SELECT pg_temp.expect_error(
    $q$INSERT INTO movies (tmdb_id, title) VALUES (999000003, '   ')$q$,
    '23514', 'elokuvan nimi ei voi olla tyhjä');
SELECT pg_temp.expect_error(
    $q$INSERT INTO movies (tmdb_id, title, tmdb_vote_average) VALUES (999000004, 'Bad vote', 10.5)$q$,
    '23514', 'TMDB-keskiarvo on välillä 0-10');
SELECT pg_temp.expect_error(
    $q$INSERT INTO movie_genres (movie_id, genre_id) VALUES (-1, -1)$q$,
    '23503', 'movie_genres vaatii olemassa olevan elokuvan ja genren');

INSERT INTO movie_genres (movie_id, genre_id)
SELECT m.id, g.id FROM movies m, genres g WHERE m.tmdb_id = 999000001 AND g.tmdb_id = 999000001;

-- (3) Arvostelut
INSERT INTO reviews (user_id, movie_id, rating, comment)
SELECT u.id, m.id, 4, 'Hyvä'
FROM users u, movies m
WHERE u.nickname = 'check_one' AND m.tmdb_id = 999000001;

SELECT pg_temp.expect_error(
    $q$INSERT INTO reviews (user_id, movie_id, rating)
       SELECT u.id, m.id, 3 FROM users u, movies m
       WHERE u.nickname = 'check_one' AND m.tmdb_id = 999000001$q$,
    '23505', 'yksi arvostelu per käyttäjä ja elokuva');
SELECT pg_temp.expect_error(
    $q$INSERT INTO reviews (user_id, movie_id, rating)
       SELECT u.id, m.id, 0 FROM users u, movies m
       WHERE u.nickname = 'check_two' AND m.tmdb_id = 999000001$q$,
    '23514', 'tähtiarvio ei voi olla 0');
SELECT pg_temp.expect_error(
    $q$INSERT INTO reviews (user_id, movie_id, rating)
       SELECT u.id, m.id, 6 FROM users u, movies m
       WHERE u.nickname = 'check_two' AND m.tmdb_id = 999000001$q$,
    '23514', 'tähtiarvio ei voi olla 6');
SELECT pg_temp.expect_error(
    $q$INSERT INTO reviews (user_id, movie_id, rating, comment)
       SELECT u.id, m.id, 3, '   ' FROM users u, movies m
       WHERE u.nickname = 'check_two' AND m.tmdb_id = 999000001$q$,
    '23514', 'tyhjä kommentti hylätään (käytä NULL)');
SELECT pg_temp.expect_error(
    $q$INSERT INTO reviews (user_id, movie_id, rating)
       SELECT u.id, -1, 3 FROM users u WHERE u.nickname = 'check_two'$q$,
    '23503', 'arvostelu vaatii olemassa olevan elokuvan');
SELECT pg_temp.expect_error(
    $q$INSERT INTO reviews (user_id, movie_id, rating)
       SELECT NULL, m.id, 3 FROM movies m WHERE m.tmdb_id = 999000001$q$,
    '23514', 'uusi arvostelu vaatii käyttäjän');
SELECT pg_temp.expect_error(
    $q$DELETE FROM movies WHERE tmdb_id = 999000001$q$,
    '23001', 'arvosteltua elokuvaa ei voi poistaa (RESTRICT)');

-- (4) Toivelistat
INSERT INTO watchlists (user_id, name)
SELECT id, 'Check List' FROM users WHERE nickname = 'check_one';

INSERT INTO watchlist_movies (watchlist_id, movie_id)
SELECT w.id, m.id FROM watchlists w, movies m
WHERE w.name = 'Check List' AND m.tmdb_id = 999000002;

SELECT pg_temp.expect_error(
    $q$INSERT INTO watchlists (user_id, name) SELECT id, 'CHECK list' FROM users WHERE nickname = 'check_one'$q$,
    '23505', 'saman käyttäjän listoilla eri nimet');
SELECT pg_temp.expect_error(
    $q$INSERT INTO watchlist_movies (watchlist_id, movie_id)
       SELECT w.id, m.id FROM watchlists w, movies m
       WHERE w.name = 'Check List' AND m.tmdb_id = 999000002$q$,
    '23505', 'sama elokuva vain kerran listalla');
SELECT pg_temp.expect_error(
    $q$DELETE FROM movies WHERE tmdb_id = 999000002$q$,
    '23001', 'toivelistalla olevaa elokuvaa ei voi poistaa (RESTRICT)');

-- Toinen käyttäjä voi käyttää samaa listan nimeä.
INSERT INTO watchlists (user_id, name)
SELECT id, 'Check List' FROM users WHERE nickname = 'check_two';

-- Listan poisto poistaa listan elokuvat, mutta ei elokuvaa.
DELETE FROM watchlists WHERE name = 'Check List'
  AND user_id = (SELECT id FROM users WHERE nickname = 'check_two');
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM movies WHERE tmdb_id = 999000002$q$,
    1, 'listan poisto ei poista elokuvaa');

-- (5) Ryhmät
-- Check Group: luoja check_one, jäsenet check_two (liittyy ensin) ja check_three.
INSERT INTO groups (name, visibility, created_by)
SELECT 'Check Group', 'public', id FROM users WHERE nickname = 'check_one';

SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM group_members gm
       JOIN groups g ON g.id = gm.group_id JOIN users u ON u.id = gm.user_id
       WHERE g.name = 'Check Group' AND u.nickname = 'check_one' AND gm.role = 'admin'$q$,
    1, 'ryhmän luoja lisätään automaattisesti ylläpitäjäksi');

INSERT INTO group_members (group_id, user_id, joined_at)
SELECT g.id, u.id, now() - interval '2 days'
FROM groups g, users u WHERE g.name = 'Check Group' AND u.nickname = 'check_two';
INSERT INTO group_members (group_id, user_id, joined_at)
SELECT g.id, u.id, now() - interval '1 day'
FROM groups g, users u WHERE g.name = 'Check Group' AND u.nickname = 'check_three';

SELECT pg_temp.expect_error(
    $q$INSERT INTO groups (name, visibility) VALUES ('Secret', 'secret')$q$,
    '23514', 'ryhmän näkyvyys on public tai private');
SELECT pg_temp.expect_error(
    $q$UPDATE group_members SET role = 'owner'
       WHERE group_id = (SELECT id FROM groups WHERE name = 'Check Group')$q$,
    '23514', 'ryhmän rooli on admin tai member');
SELECT pg_temp.expect_error(
    $q$INSERT INTO group_members (group_id, user_id)
       SELECT g.id, u.id FROM groups g, users u
       WHERE g.name = 'Check Group' AND u.nickname = 'check_two'$q$,
    '23505', 'käyttäjä vain kerran samassa ryhmässä');
SELECT pg_temp.expect_error(
    $q$UPDATE group_members SET role = 'member'
       WHERE group_id = (SELECT id FROM groups WHERE name = 'Check Group')
         AND role = 'admin'$q$,
    '23514', 'viimeistä ylläpitäjää ei voi alentaa jäseneksi');

-- Group Two: vain luoja check_two. Ryhmän poisto poistaa jäsenyydet.
INSERT INTO groups (name, created_by)
SELECT 'Check Group Two', id FROM users WHERE nickname = 'check_two';
DELETE FROM groups WHERE name = 'Check Group Two';
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM group_members gm JOIN users u ON u.id = gm.user_id
       WHERE u.nickname = 'check_two' AND gm.role = 'admin'$q$,
    0, 'ryhmän poisto poistaa jäsenyydet');

-- (6) Tilin poisto
-- check_one: arvostelu säilyy ilman kommenttia, listat poistuvat,
-- ylläpito siirtyy pisimpään ryhmässä olleelle (check_two), ryhmä säilyy.
DELETE FROM users WHERE nickname = 'check_one';

SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM reviews r JOIN movies m ON m.id = r.movie_id
       WHERE m.tmdb_id = 999000001 AND r.user_id IS NULL AND r.rating = 4
         AND r.comment IS NULL AND r.author_deleted_at IS NOT NULL$q$,
    1, 'tilin poisto: arvosana säilyy, kommentti poistuu');
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM watchlist_movies wm JOIN movies m ON m.id = wm.movie_id WHERE m.tmdb_id = 999000002$q$,
    0, 'tilin poisto poistaa toivelistat ja niiden rivit');
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM groups WHERE name = 'Check Group' AND created_by IS NULL$q$,
    1, 'ryhmä säilyy, created_by = NULL');
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM group_members gm JOIN groups g ON g.id = gm.group_id
       JOIN users u ON u.id = gm.user_id
       WHERE g.name = 'Check Group' AND gm.role = 'admin' AND u.nickname = 'check_two'$q$,
    1, 'viimeisen ylläpitäjän poistuessa pisimpään ollut jäsen nousee ylläpitäjäksi');
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM group_members gm JOIN groups g ON g.id = gm.group_id
       WHERE g.name = 'Check Group' AND gm.role = 'member'$q$,
    1, 'muut jäsenet säilyvät jäseninä');

-- Ylläpitäjä eroaa ryhmästä -> check_three nousee ylläpitäjäksi.
DELETE FROM group_members
WHERE group_id = (SELECT id FROM groups WHERE name = 'Check Group')
  AND user_id = (SELECT id FROM users WHERE nickname = 'check_two');
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM group_members gm JOIN users u ON u.id = gm.user_id
       JOIN groups g ON g.id = gm.group_id
       WHERE g.name = 'Check Group' AND u.nickname = 'check_three' AND gm.role = 'admin'$q$,
    1, 'eroava ylläpitäjä korvataan jäljellä olevalla jäsenellä');

-- Viimeinen jäsen poistaa tilinsä -> tyhjä ryhmä poistetaan.
DELETE FROM users WHERE nickname = 'check_three';
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM groups WHERE name = 'Check Group'$q$,
    0, 'ryhmä poistetaan, kun viimeinen jäsen lähtee');

-- (7) Siivous: kun anonymisoitu arvostelu poistetaan, elokuvan voi poistaa; genre-linkit poistuvat.
DELETE FROM reviews WHERE movie_id IN (SELECT id FROM movies WHERE tmdb_id = 999000001);
DELETE FROM movies WHERE tmdb_id IN (999000001, 999000002);
SELECT pg_temp.expect_count(
    $q$SELECT count(*) FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id WHERE g.tmdb_id = 999000001$q$,
    0, 'elokuvan poisto poistaa genre-linkit');
