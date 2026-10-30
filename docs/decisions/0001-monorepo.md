# ADR-0001: Monorepo modular

## Estado

Aceptado para la Etapa 1.

## Decisión

Coordia se organiza como un monorepo pnpm con `apps/web`, `apps/api` y
`packages/shared`. PostgreSQL se ejecuta mediante Docker Compose durante el
desarrollo local.

## Motivo

Esta estructura mantiene separadas las responsabilidades del frontend y backend,
permite compartir contratos tipados y conserva la arquitectura de monolito
modular exigida por el producto.
