-- demo_seed.sql
-- Esittelydata. Ei kuulu migraatioihin.
--
-- Turvallinen ajaa uudelleen: jokainen INSERT ohittaa jo olemassa olevat rivit
-- luonnollisen avaimen perusteella (sähköposti, tmdb_id, käyttäjä+elokuva jne.).
-- Seed ei muuta eikä poista olemassa olevia rivejä.
--
-- Demokäyttäjillä EI ole toimivaa salasanaa: password_hash alkaa '!'-merkillä,
-- joka ei ole kelvollinen bcrypt/argon2-tiiviste. Kirjautuminen näillä tunnuksilla
-- ei siis onnistu ennen kuin kirjautuminen toteutetaan ja tiivisteet päivitetään.
--
-- Elokuvien kuvaukset ovat tiimin omia lyhyitä tekstejä. Julisteet (poster_path)
-- ja TMDB:n keskiarvot (tmdb_vote_average) jätetään tyhjiksi; ne täydentyvät,
-- kun TMDB-haku on toteutettu. Seed ei keksi TMDB-arvoja.

-- Genret (TMDB:n genre-tunnisteet).
INSERT INTO genres (tmdb_id, name)
VALUES
    (28,  'Action'),
    (12,  'Adventure'),
    (16,  'Animation'),
    (35,  'Comedy'),
    (80,  'Crime'),
    (18,  'Drama'),
    (14,  'Fantasy'),
    (878, 'Science Fiction'),
    (53,  'Thriller')
ON CONFLICT (tmdb_id) DO NOTHING;

-- Elokuvat (TMDB-tunnisteet).
INSERT INTO movies (tmdb_id, title, original_title, overview, release_date, runtime_minutes)
VALUES
    (603,    'The Matrix',    'The Matrix',
     'Hakkeri saa tietää, että hänen maailmansa on simulaatio.',              DATE '1999-03-31', 136),
    (27205,  'Inception',     'Inception',
     'Varkaiden ryhmä soluttautuu toisen ihmisen uniin.',                      DATE '2010-07-15', 148),
    (157336, 'Interstellar',  'Interstellar',
     'Astronautit etsivät ihmiskunnalle uutta kotia madonreiän takaa.',        DATE '2014-11-05', 169),
    (129,    'Spirited Away', 'Sen to Chihiro no kamikakushi',
     'Tyttö joutuu henkien maailmaan ja yrittää pelastaa vanhempansa.',        DATE '2001-07-20', 125),
    (496243, 'Parasite',      'Gisaengchung',
     'Köyhä perhe soluttautuu varakkaan perheen palvelukseen.',               DATE '2019-05-30', 133),
    (550,    'Fight Club',    'Fight Club',
     'Unettomuudesta kärsivä toimistotyöntekijä perustaa salaisen kerhon.',    DATE '1999-10-15', 139)
ON CONFLICT (tmdb_id) DO NOTHING;

-- Elokuvien genret.
INSERT INTO movie_genres (movie_id, genre_id)
SELECT m.id, g.id
FROM (
    VALUES
        (603, 28), (603, 878),
        (27205, 28), (27205, 878), (27205, 12),
        (157336, 12), (157336, 18), (157336, 878),
        (129, 16), (129, 14),
        (496243, 35), (496243, 53), (496243, 18),
        (550, 18)
) AS v (movie_tmdb_id, genre_tmdb_id)
JOIN movies m ON m.tmdb_id = v.movie_tmdb_id
JOIN genres g ON g.tmdb_id = v.genre_tmdb_id
ON CONFLICT (movie_id, genre_id) DO NOTHING;

-- Demokäyttäjät (ei toimivaa salasanaa, katso yllä).
INSERT INTO users (email, nickname, password_hash)
VALUES
    ('anna.demo@example.com',  'Anna',  '!demo-account-login-disabled'),
    ('mikko.demo@example.com', 'Mikko', '!demo-account-login-disabled'),
    ('laura.demo@example.com', 'Laura', '!demo-account-login-disabled')
ON CONFLICT ((lower(email))) DO NOTHING;

-- Arvostelut.
INSERT INTO reviews (user_id, movie_id, rating, comment)
SELECT u.id, m.id, v.rating, v.comment
FROM (
    VALUES
        ('anna.demo@example.com',  603,    5, 'Klassikko, jonka voi katsoa monta kertaa.'),
        ('anna.demo@example.com',  157336, 4, NULL),
        ('mikko.demo@example.com', 603,    4, 'Efektit toimivat yhä.'),
        ('mikko.demo@example.com', 27205,  5, 'Paras unielokuva.'),
        ('laura.demo@example.com', 129,    5, 'Kaunis ja omaperäinen.'),
        ('laura.demo@example.com', 496243, 4, NULL)
) AS v (email, movie_tmdb_id, rating, comment)
JOIN users  u ON lower(u.email) = lower(v.email)
JOIN movies m ON m.tmdb_id = v.movie_tmdb_id
ON CONFLICT (user_id, movie_id) DO NOTHING;

-- Toivelistat.
INSERT INTO watchlists (user_id, name)
SELECT u.id, v.name
FROM (
    VALUES
        ('anna.demo@example.com',  'Katsottavat'),
        ('mikko.demo@example.com', 'Viikonloppu')
) AS v (email, name)
JOIN users u ON lower(u.email) = lower(v.email)
ON CONFLICT (user_id, (lower(name))) DO NOTHING;

INSERT INTO watchlist_movies (watchlist_id, movie_id)
SELECT w.id, m.id
FROM (
    VALUES
        ('anna.demo@example.com',  'Katsottavat', 27205),
        ('anna.demo@example.com',  'Katsottavat', 496243),
        ('mikko.demo@example.com', 'Viikonloppu', 157336),
        ('mikko.demo@example.com', 'Viikonloppu', 550)
) AS v (email, list_name, movie_tmdb_id)
JOIN users      u ON lower(u.email) = lower(v.email)
JOIN watchlists w ON w.user_id = u.id AND lower(w.name) = lower(v.list_name)
JOIN movies     m ON m.tmdb_id = v.movie_tmdb_id
ON CONFLICT (watchlist_id, movie_id) DO NOTHING;

-- Ryhmät. Ryhmän nimellä ei ole UNIQUE-rajoitetta, joten toisto estetään
-- tarkistamalla, onko samalla luojalla jo samanniminen ryhmä.
INSERT INTO groups (name, description, visibility, created_by)
SELECT v.name, v.description, v.visibility, u.id
FROM (
    VALUES
        ('anna.demo@example.com',  'Scifi-ilta',     'Tieteiselokuvien ystävät.',  'public'),
        ('laura.demo@example.com', 'Perhe-elokuvat', 'Elokuvia koko perheelle.',   'private')
) AS v (email, name, description, visibility)
JOIN users u ON lower(u.email) = lower(v.email)
WHERE NOT EXISTS (
    SELECT 1
    FROM groups g
    WHERE g.created_by = u.id
      AND lower(g.name) = lower(v.name)
);

-- Luoja lisätään ylläpitäjäksi automaattisesti (trigger groups_add_creator_as_admin),
-- joten tässä lisätään vain muut jäsenet.
INSERT INTO group_members (group_id, user_id, role)
SELECT g.id, member.id, v.role
FROM (
    VALUES
        ('anna.demo@example.com',  'Scifi-ilta',     'mikko.demo@example.com', 'member'),
        ('laura.demo@example.com', 'Perhe-elokuvat', 'anna.demo@example.com',  'member')
) AS v (creator_email, group_name, member_email, role)
JOIN users creator ON lower(creator.email) = lower(v.creator_email)
JOIN groups g      ON g.created_by = creator.id AND lower(g.name) = lower(v.group_name)
JOIN users member  ON lower(member.email) = lower(v.member_email)
ON CONFLICT (group_id, user_id) DO NOTHING;
