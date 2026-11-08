-- This is an empty migration.

ALTER TABLE "ProjectWorkItem"
ADD CONSTRAINT "ProjectWorkItem_exactly_one_container_check"
CHECK (
    (
        "templateId" IS NOT NULL
        AND "projectId" IS NULL
    )
    OR
    (
        "templateId" IS NULL
        AND "projectId" IS NOT NULL
    )
);


CREATE OR REPLACE FUNCTION validate_project_work_item_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent_organization_id UUID;
    parent_template_id UUID;
    parent_project_id UUID;
    container_lock_key TEXT;
    has_cycle BOOLEAN;
BEGIN
    IF NEW."parentId" IS NOT NULL
       AND NEW."parentId" = NEW."id" THEN
        RAISE EXCEPTION
            'Un elemento no puede ser su propio padre'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."parentId" IS NULL THEN
        RETURN NEW;
    END IF;

    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION
            'Las modificaciones jerárquicas requieren aislamiento READ COMMITTED'
            USING ERRCODE = '25001';
    END IF;

    IF NEW."templateId" IS NOT NULL THEN
        container_lock_key :=
            'org:' || NEW."organizationId"::TEXT ||
            ':template:' || NEW."templateId"::TEXT;
    ELSE
        container_lock_key :=
            'org:' || NEW."organizationId"::TEXT ||
            ':project:' || NEW."projectId"::TEXT;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(container_lock_key, 0)
    );

    SELECT
        "organizationId",
        "templateId",
        "projectId"
    INTO
        parent_organization_id,
        parent_template_id,
        parent_project_id
    FROM "ProjectWorkItem"
    WHERE
        "organizationId" = NEW."organizationId"
        AND "id" = NEW."parentId"
    FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'El elemento padre no existe en esta organización'
            USING ERRCODE = '23503';
    END IF;

    IF parent_organization_id IS DISTINCT FROM NEW."organizationId"
       OR parent_template_id IS DISTINCT FROM NEW."templateId"
       OR parent_project_id IS DISTINCT FROM NEW."projectId" THEN
        RAISE EXCEPTION
            'El elemento padre debe pertenecer al mismo proyecto o plantilla'
            USING ERRCODE = '23514';
    END IF;

    WITH RECURSIVE ancestors(
        "id",
        "parentId",
        "path",
        "cycle"
    ) AS (
        SELECT
            item."id",
            item."parentId",
            ARRAY[item."id"]::UUID[],
            FALSE
        FROM "ProjectWorkItem" item
        WHERE
            item."organizationId" = NEW."organizationId"
            AND item."id" = NEW."parentId"
            AND item."templateId" IS NOT DISTINCT FROM NEW."templateId"
            AND item."projectId" IS NOT DISTINCT FROM NEW."projectId"

        UNION ALL

        SELECT
            parent."id",
            parent."parentId",
            ancestors."path" || parent."id",
            parent."id" = ANY(ancestors."path")
        FROM ancestors
        INNER JOIN "ProjectWorkItem" parent
            ON parent."organizationId" = NEW."organizationId"
            AND parent."id" = ancestors."parentId"
            AND parent."templateId" IS NOT DISTINCT FROM NEW."templateId"
            AND parent."projectId" IS NOT DISTINCT FROM NEW."projectId"
        WHERE
            ancestors."parentId" IS NOT NULL
            AND NOT ancestors."cycle"
    )
    SELECT EXISTS (
        SELECT 1
        FROM ancestors
        WHERE
            ancestors."id" = NEW."id"
            OR ancestors."cycle"
    )
    INTO has_cycle;

    IF has_cycle THEN
        RAISE EXCEPTION
            'La relación jerárquica produciría un ciclo'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER trg_validate_project_work_item_parent
BEFORE INSERT OR UPDATE OF
    "organizationId",
    "templateId",
    "projectId",
    "parentId"
ON "ProjectWorkItem"
FOR EACH ROW
EXECUTE FUNCTION validate_project_work_item_parent();

CREATE OR REPLACE FUNCTION prevent_project_work_item_container_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
       OR NEW."templateId" IS DISTINCT FROM OLD."templateId"
       OR NEW."projectId" IS DISTINCT FROM OLD."projectId" THEN
        RAISE EXCEPTION
            'No se puede cambiar la organización, proyecto o plantilla de un elemento existente'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER trg_prevent_project_work_item_container_change
BEFORE UPDATE OF
    "organizationId",
    "templateId",
    "projectId"
ON "ProjectWorkItem"
FOR EACH ROW
EXECUTE FUNCTION prevent_project_work_item_container_change();