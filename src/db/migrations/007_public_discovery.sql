-- Migration: 007_public_discovery.sql
-- Description: Scoped permissive read-only policy for public municipality directory discovery
-- Phase: 8.1 (Frontend End-to-End Verification & Defect Fixes)

-- Allows unauthenticated citizens to browse active municipalities, ward counts,
-- and locality totals strictly during public discovery transactions without exposing internal data.
DROP POLICY IF EXISTS public_discovery_municipalities ON municipalities;
CREATE POLICY public_discovery_municipalities ON municipalities
    FOR SELECT
    USING (current_setting('app.public_discovery', true) = 'true');

DROP POLICY IF EXISTS public_discovery_wards ON wards;
CREATE POLICY public_discovery_wards ON wards
    FOR SELECT
    USING (current_setting('app.public_discovery', true) = 'true');

DROP POLICY IF EXISTS public_discovery_localities ON localities;
CREATE POLICY public_discovery_localities ON localities
    FOR SELECT
    USING (current_setting('app.public_discovery', true) = 'true');
