-- Least Privilege Setup for NexNum

-- 1. Create Application Role (Read/Write Data, No DDL)
CREATE ROLE "nexnum_app" WITH LOGIN PASSWORD 'strong_password_here';

GRANT CONNECT ON DATABASE "postgres" TO "nexnum_app";
GRANT USAGE ON SCHEMA public TO "nexnum_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "nexnum_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "nexnum_app";

-- Ensure future tables grant permissions automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "nexnum_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "nexnum_app";

-- 2. Create Read-Only Role (BI/Analytics)
CREATE ROLE "nexnum_read" WITH LOGIN PASSWORD 'read_password';

GRANT CONNECT ON DATABASE "postgres" TO "nexnum_read";
GRANT USAGE ON SCHEMA public TO "nexnum_read";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "nexnum_read";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "nexnum_read";

-- 3. Revoke Dangerous Permissions from Public
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
