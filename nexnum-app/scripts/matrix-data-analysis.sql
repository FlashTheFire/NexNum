-- ============================================
-- MATRIX DATA ANALYSIS QUERIES
-- Run these against your PostgreSQL database
-- ============================================

-- 1. TOP 20 COUNTRIES BY AVERAGE STOCK (High Stock)
-- Shows countries with highest average stock across all services
-- ============================================
SELECT 
    pc.name AS country_name,
    pc.code AS country_code,
    ROUND(AVG(pp.stock), 2) AS avg_stock,
    SUM(pp.stock) AS total_stock,
    COUNT(DISTINCT pp."service_id") AS service_count,
    COUNT(*) AS offer_count
FROM provider_pricing pp
JOIN provider_countries pc ON pp."country_id" = pc.id
WHERE pp.deleted = false AND pp.stock > 0
GROUP BY pc.id, pc.name, pc.code
ORDER BY avg_stock DESC
LIMIT 20;


-- 2. TOP 20 SERVICES BY AVERAGE STOCK (High Stock)
-- Shows services with highest average stock across all countries
-- ============================================
SELECT 
    ps.name AS service_name,
    ps.code AS service_code,
    ROUND(AVG(pp.stock), 2) AS avg_stock,
    SUM(pp.stock) AS total_stock,
    COUNT(DISTINCT pp."country_id") AS country_count,
    COUNT(*) AS offer_count
FROM provider_pricing pp
JOIN provider_services ps ON pp."service_id" = ps.id
WHERE pp.deleted = false AND pp.stock > 0
GROUP BY ps.id, ps.name, ps.code
ORDER BY avg_stock DESC
LIMIT 20;


-- 3. TOP 20 COUNTRIES BY AVERAGE PRICE (LOW Price - Best Deals)
-- Shows countries with lowest average sell price across all services
-- ============================================
SELECT 
    pc.name AS country_name,
    pc.code AS country_code,
    ROUND(AVG(pp."sell_price")::numeric, 4) AS avg_price,
    ROUND(MIN(pp."sell_price")::numeric, 4) AS min_price,
    ROUND(MAX(pp."sell_price")::numeric, 4) AS max_price,
    COUNT(DISTINCT pp."service_id") AS service_count,
    SUM(pp.stock) AS total_stock,
    COUNT(*) AS offer_count
FROM provider_pricing pp
JOIN provider_countries pc ON pp."country_id" = pc.id
WHERE pp.deleted = false AND pp.stock > 0
GROUP BY pc.id, pc.name, pc.code
ORDER BY avg_price ASC
LIMIT 20;


-- 4. TOP 20 SERVICES BY AVERAGE PRICE (LOW Price - Best Deals)
-- Shows services with lowest average sell price across all countries
-- ============================================
SELECT 
    ps.name AS service_name,
    ps.code AS service_code,
    ROUND(AVG(pp."sell_price")::numeric, 4) AS avg_price,
    ROUND(MIN(pp."sell_price")::numeric, 4) AS min_price,
    ROUND(MAX(pp."sell_price")::numeric, 4) AS max_price,
    COUNT(DISTINCT pp."country_id") AS country_count,
    SUM(pp.stock) AS total_stock,
    COUNT(*) AS offer_count
FROM provider_pricing pp
JOIN provider_services ps ON pp."service_id" = ps.id
WHERE pp.deleted = false AND pp.stock > 0
GROUP BY ps.id, ps.name, ps.code
ORDER BY avg_price ASC
LIMIT 20;


-- ============================================
-- BONUS: OVERALL STATS
-- ============================================
SELECT 
    COUNT(*) AS total_offers,
    COUNT(DISTINCT pp."country_id") AS unique_countries,
    COUNT(DISTINCT pp."service_id") AS unique_services,
    SUM(pp.stock) AS grand_total_stock,
    ROUND(AVG(pp.stock), 2) AS overall_avg_stock,
    ROUND(AVG(pp."sell_price")::numeric, 4) AS overall_avg_price
FROM provider_pricing pp
WHERE pp.deleted = false AND pp.stock > 0;


-- ============================================
-- CROSS-MATRIX: Country x Service (Top combinations)
-- Top 20 offers with highest stock
-- ============================================
SELECT 
    pc.name AS country_name,
    ps.name AS service_name,
    pp.stock,
    pp."sell_price",
    p.name AS provider_name
FROM provider_pricing pp
JOIN provider_countries pc ON pp."country_id" = pc.id
JOIN provider_services ps ON pp."service_id" = ps.id
JOIN providers p ON pp."provider_id" = p.id
WHERE pp.deleted = false AND pp.stock > 0
ORDER BY pp.stock DESC
LIMIT 20;
