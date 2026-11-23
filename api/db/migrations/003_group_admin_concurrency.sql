-- 003_group_admin_concurrency
-- Korjaa ryhmätriggerin rinnakkaisuusvirheet (todettu kahdella yhteydellä, ks. docs/erd.md):
--   * tavallisen jäsenen ja viimeisen ylläpitäjän samanaikainen lähtö jätti ryhmän ilman ylläpitäjää,
--   * viimeisen jäsenen ja ylläpitäjän samanaikainen lähtö jätti tyhjän ryhmän.
-- Migraatio 002 on jo ajettu, joten sitä ei muokata; tämä tiedosto korvaa triggerifunktiot.
--
-- Säännöt tämän jälkeen:
--   1. Ryhmän luoja lisätään ylläpitäjäksi; ryhmää ei voi luoda ilman luojaa.
--   2. Ryhmällä, jossa on jäseniä, on aina vähintään yksi ylläpitäjä.
--   3. Kun viimeinen ylläpitäjä lähtee, pisimpään ollut jäsen nousee ylläpitäjäksi
--      (joined_at, tasatilanteessa pienempi user_id).
--   4. Tyhjä ryhmä poistetaan (myös kun viimeinen tavallinen jäsen lähtee).
--   5. Viimeistä ylläpitäjää ei voi alentaa jäseneksi.
--   6. Jäsenyyden group_id- ja user_id-sarakkeita ei voi muuttaa (poista ja lisää uusi rivi).
--
-- Lukitusjärjestys: groups-rivi → group_members-rivit. Kaikki jäsenyyden muutokset lukitsevat
-- triggerissä ryhmän rivin, joten saman ryhmän muutokset käsitellään vuorotellen. Backendin kannattaa
-- lukita ryhmä itse ennen jäsenyyksien muuttamista (SELECT … FROM groups WHERE id = $1 FOR UPDATE),
-- jotta järjestys on sama myös triggeriä ennen; ks. docs/ryhmat-kehittajalle.md.
--
-- Takuut ovat voimassa READ COMMITTED -eristystasolla (PostgreSQL:n oletus, myös node-postgres).
-- Muilla tasoilla trigger keskeyttää transaktion virheellä, koska vanha snapshot voisi rikkoa säännöt.

-- 1) Tarkistetaan nykyinen data ennen sääntöjen kiristämistä. Mitään ei korjata automaattisesti.
DO $$
DECLARE
    without_admin TEXT;
    empty_groups  TEXT;
BEGIN
    SELECT string_agg(g.id::text, ', ' ORDER BY g.id) INTO without_admin
    FROM groups g
    WHERE EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.role = 'admin');

    SELECT string_agg(g.id::text, ', ' ORDER BY g.id) INTO empty_groups
    FROM groups g
    WHERE NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id);

    IF without_admin IS NOT NULL OR empty_groups IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 003 stopped: groups violate the new rules'
            USING DETAIL = format('Groups with members but no admin: %s. Empty groups: %s.',
                                  coalesce(without_admin, '-'), coalesce(empty_groups, '-')),
                  HINT = 'Decide per group (choose an admin or delete the group) and run the migration again. '
                      || 'Diagnostic queries: docs/tietokanta.md, section "Migraatio 003".';
    END IF;
END;
$$;

-- 2) Ryhmän luoja on pakollinen ja lisätään ylläpitäjäksi.
CREATE OR REPLACE FUNCTION add_group_creator_as_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.created_by IS NULL THEN
        RAISE EXCEPTION 'A group needs a creator (created_by)'
            USING ERRCODE = 'not_null_violation';
    END IF;
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'admin');
    RETURN NULL;
END;
$$;

-- 3) Ylläpitäjä- ja tyhjän ryhmän säännöt kaikille jäsenyyden poistoille ja roolimuutoksille.
CREATE OR REPLACE FUNCTION ensure_group_has_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    successor_id INTEGER;
    attempts     INTEGER := 0;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Group membership changes require READ COMMITTED isolation'
            USING ERRCODE = 'serialization_failure';
    END IF;

    -- Saman ryhmän muutokset vuorotellen. Jos ryhmä on jo poistettu (cascade), ei tehtävää.
    PERFORM 1 FROM groups WHERE id = OLD.group_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- READ COMMITTED: jokainen alla oleva kysely näkee lukon saamisen jälkeen tuoreen tilanteen.
    IF EXISTS (SELECT 1 FROM group_members WHERE group_id = OLD.group_id AND role = 'admin') THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Group % must have at least one admin', OLD.group_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Seuraaja lukitaan. Jos rinnakkainen transaktio ehti poistaa valitun rivin,
    -- FOR UPDATE ei palauta sitä, ja valinta tehdään uudelleen tuoreella snapshotilla.
    LOOP
        attempts := attempts + 1;
        IF attempts > 100 THEN
            RAISE EXCEPTION 'Could not choose a new admin for group %', OLD.group_id
                USING ERRCODE = 'serialization_failure';
        END IF;

        SELECT user_id INTO successor_id
        FROM group_members
        WHERE group_id = OLD.group_id
        ORDER BY joined_at, user_id
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            UPDATE group_members
            SET role = 'admin'
            WHERE group_id = OLD.group_id AND user_id = successor_id;
            EXIT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = OLD.group_id) THEN
            DELETE FROM groups WHERE id = OLD.group_id;
            EXIT;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

DROP TRIGGER group_members_keep_admin ON group_members;

CREATE TRIGGER group_members_keep_admin
    AFTER DELETE OR UPDATE OF role ON group_members
    FOR EACH ROW
    EXECUTE FUNCTION ensure_group_has_admin();

-- 4) Jäsenyyden avainsarakkeita ei siirretä toiseen ryhmään tai käyttäjälle.
CREATE FUNCTION prevent_membership_key_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Membership keys cannot be changed; delete the row and insert a new one'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER group_members_keys_fixed
    BEFORE UPDATE OF group_id, user_id ON group_members
    FOR EACH ROW
    EXECUTE FUNCTION prevent_membership_key_change();
