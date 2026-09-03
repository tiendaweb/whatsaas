-- El free tier de Gemini da 20 requests por día por proyecto y por modelo
-- (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier), no 250. Con el
-- default viejo la barra de consumo marcaba 7% con la cuota ya agotada.
ALTER TABLE "team_gemini_keys" ALTER COLUMN "limit_rpd" SET DEFAULT 20;
