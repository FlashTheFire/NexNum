#!/bin/bash
KEY="00IlxWjSKbPI62SCeYKzalN9HLSazUeGLLrg5ldj4f0"
echo "Creating Index..."
curl -X POST "http://localhost:7700/indexes" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"uid": "offers", "primaryKey": "id"}'

echo "Updating Settings..."
curl -X PATCH "http://localhost:7700/indexes/offers/settings" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "searchableAttributes": ["serviceName", "providerServiceCode", "countryName", "providerCountryCode", "provider"],
    "filterableAttributes": ["providerServiceCode", "serviceName", "serviceId", "providerCountryCode", "countryName", "countryId", "provider", "operator", "pointPrice", "stock", "lastSyncedAt", "isActive"],
    "sortableAttributes": ["pointPrice", "stock", "lastSyncedAt"],
    "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness", "stock:desc", "lastSyncedAt:desc"],
    "pagination": { "maxTotalHits": 10000 },
    "typoTolerance": { "enabled": true, "minWordSizeForTypos": { "oneTypo": 4, "twoTypos": 8 } }
  }'
echo "Done."
