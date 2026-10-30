# Arquitectura inicial

Coordia utiliza un monolito modular TypeScript con una aplicación Next.js, una API
NestJS, PostgreSQL y Prisma. Los módulos comparten contratos explícitos mediante
`packages/shared`; no se introducen microservicios.

La autorización se implementará en el backend y cada recurso privado deberá
conservar una relación verificable con su organización.
