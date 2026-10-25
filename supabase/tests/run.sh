#!/usr/bin/env bash
# Vérifie le schéma et les règles d'accès sur un Postgres local (sans Supabase).
# Usage : ./supabase/tests/run.sh   (nécessite createdb/psql)
set -euo pipefail
cd "$(dirname "$0")"
dropdb --if-exists mydoctor_test
createdb mydoctor_test
psql -q -d mydoctor_test -v ON_ERROR_STOP=1 \
  -f supabase_stub.sql \
  -f ../migrations/20261025000000_init.sql \
  -f rls_test.sql
