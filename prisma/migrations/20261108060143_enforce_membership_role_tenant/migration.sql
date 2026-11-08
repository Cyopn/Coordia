-- DropForeignKey
ALTER TABLE "MembershipRole" DROP CONSTRAINT "MembershipRole_organizationId_roleId_fkey";

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_membership_role_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    role_organization_id UUID;
    role_is_system BOOLEAN;
BEGIN
    SELECT "organizationId", "isSystem"
    INTO role_organization_id, role_is_system
    FROM "Role"
    WHERE "id" = NEW."roleId"
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El rol indicado no existe'
            USING ERRCODE = '23503';
    END IF;

    IF role_organization_id IS NOT NULL
       AND role_organization_id <> NEW."organizationId" THEN
        RAISE EXCEPTION 'El rol no pertenece a esta organización'
            USING ERRCODE = '23514';
    END IF;

    IF role_organization_id IS NULL
       AND role_is_system IS NOT TRUE THEN
        RAISE EXCEPTION 'Un rol global debe ser un rol de sistema'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_membership_role_tenant
BEFORE INSERT OR UPDATE OF "organizationId", "membershipId", "roleId"
ON "MembershipRole"
FOR EACH ROW
EXECUTE FUNCTION validate_membership_role_tenant();


CREATE OR REPLACE FUNCTION prevent_invalid_role_scope_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (
        NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
        OR NEW."isSystem" IS DISTINCT FROM OLD."isSystem"
    ) THEN
        RAISE EXCEPTION
            'El alcance y el tipo de sistema de un rol son inmutables'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_invalid_role_scope_update
BEFORE UPDATE OF "organizationId", "isSystem"
ON "Role"
FOR EACH ROW
EXECUTE FUNCTION prevent_invalid_role_scope_update();