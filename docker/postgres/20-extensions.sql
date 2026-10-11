-- Dijalankan sekali saat volume Postgres pertama dibuat.
-- template1 diberi PostGIS agar shadow database Prisma (migrate dev) juga punya tipe geography.
\connect template1
CREATE EXTENSION IF NOT EXISTS postgis;

\connect socialfinder
CREATE EXTENSION IF NOT EXISTS postgis;
