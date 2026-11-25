-- 004_private_group_requests
-- Yksityisen ryhmän haku tarkalla nimellä ja liittymispyynnöt (issue #13).
--
--   * Yksityisen ryhmän nimi on yksilöllinen normalisoituna: lower(btrim(name)).
--     Sama normalisointi on haussa (api/models/Group.js). Julkisilla ryhmillä ei ole tätä rajoitetta,
--     ja julkinen ryhmä voi olla saman niminen kuin yksityinen.
--   * group_join_requests: pyynnöt; yhdellä käyttäjällä on enintään yksi odottava pyyntö samaan ryhmään.
--   * Kun käyttäjästä tulee jäsen millä tahansa tavalla (pyynnön hyväksyntä, ylläpitäjä lisää
--     nimimerkillä), hänen odottava pyyntönsä suljetaan triggerissä samassa transaktiossa.
--
-- Lukitusjärjestys pysyy samana kuin migraatiossa 003: groups → users → group_members / group_join_requests.

-- 1) Tarkistetaan, ettei yksityisillä ryhmillä ole jo samoja nimiä. Mitään ei nimetä automaattisesti uudelleen.
DO $$
DECLARE
    duplicates TEXT;
BEGIN
    SELECT string_agg(format('"%s" (id %s)', name, ids), '; ' ORDER BY name) INTO duplicates
    FROM (
        SELECT min(name) AS name, string_agg(id::text, ', ' ORDER BY id) AS ids
        FROM groups
        WHERE visibility = 'private'
        GROUP BY lower(btrim(name))
        HAVING count(*) > 1
    ) d;

    IF duplicates IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 004 stopped: private groups with the same name'
            USING DETAIL = duplicates,
                  HINT = 'Agree on new names with the group admins, rename (UPDATE groups SET name = … WHERE id = …) '
                      || 'and run the migration again. Diagnostic query: docs/tietokanta.md, section "Migraatio 004".';
    END IF;
END;
$$;

-- 2) Yksityisen ryhmän nimi yksilöllinen (kirjainkoko ja reunojen välilyönnit eivät erota).
CREATE UNIQUE INDEX groups_private_name_uq
    ON groups (lower(btrim(name)))
    WHERE visibility = 'private';

-- 3) Liittymispyynnöt.
CREATE TABLE group_join_requests (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id   INTEGER     NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    user_id    INTEGER     NOT NULL REFERENCES users (id)  ON DELETE CASCADE,
    status     TEXT        NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ,
    decided_by INTEGER     REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT group_join_requests_status_chk
        CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT group_join_requests_decided_chk
        CHECK ((status = 'pending') = (decided_at IS NULL))
);

-- Yksi odottava pyyntö per ryhmä ja käyttäjä; käsitellyt pyynnöt jäävät historiaan.
CREATE UNIQUE INDEX group_join_requests_pending_uq
    ON group_join_requests (group_id, user_id)
    WHERE status = 'pending';

-- Ylläpitäjän lista: ryhmän odottavat pyynnöt vanhimmasta alkaen.
CREATE INDEX group_join_requests_group_pending_idx
    ON group_join_requests (group_id, created_at)
    WHERE status = 'pending';

-- Käyttäjän omat pyynnöt (haku, tilin poisto).
CREATE INDEX group_join_requests_user_idx ON group_join_requests (user_id);
CREATE INDEX group_join_requests_decided_by_idx ON group_join_requests (decided_by);

-- 4) Kun jäsenyys syntyy, odottava pyyntö suljetaan hyväksyttynä.
--    decided_by jää NULLiksi, jos pyyntöä ei käsitelty pyyntönä (esim. lisäys nimimerkillä).
CREATE FUNCTION close_join_request_on_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE group_join_requests
    SET status = 'approved', decided_at = now()
    WHERE group_id = NEW.group_id
      AND user_id = NEW.user_id
      AND status = 'pending';
    RETURN NULL;
END;
$$;

CREATE TRIGGER group_members_close_join_request
    AFTER INSERT ON group_members
    FOR EACH ROW
    EXECUTE FUNCTION close_join_request_on_membership();
