#!/usr/bin/env python3
"""Real-token smoke test for the intended BinoFit backend using one disposable fixture.

Run from the repo root. Reads existing .env without printing credentials. Requires
psql and fixture creation authorization. Always cleans only the returned fixture UUID.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

PROJECT = 'qaxeirbqyrmakwuwvpto'
POOLER = 'aws-0-us-west-2.pooler.supabase.com'
OWNED_TABLES = (
    'workout_sets', 'workout_exercises', 'routine_exercises', 'workouts', 'routines',
    'exercises', 'food_logs', 'foods', 'weight_entries', 'meal_names',
    'meal_definitions', 'user_goals', 'user_profile',
)


def environment():
    values = dict(os.environ)
    for line in Path('.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return values


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    values = environment()
    base = values.get('EXPO_PUBLIC_SUPABASE_URL', '').rstrip('/')
    if base != f'https://{PROJECT}.supabase.co':
        raise RuntimeError('Refusing a backend other than the intended BinoFit project')
    anon_key = values['EXPO_PUBLIC_SUPABASE_ANON_KEY']
    db_env = os.environ.copy()
    db_env.update(PGPASSWORD=values['DB_PASSWORD'], PGSSLMODE='require', PGCONNECT_TIMEOUT='10')

    def sql(statement):
        result = subprocess.run(
            ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
             '-h', POOLER, '-p', '5432', '-U', f'postgres.{PROJECT}', '-d', 'postgres'],
            input="set statement_timeout = '15s'; set lock_timeout = '5s';\n" + statement,
            env=db_env, text=True, capture_output=True, timeout=30,
        )
        if result.returncode:
            # Never echo SQL or server error details that might contain credentials.
            raise RuntimeError('Fixture database operation failed')
        return result.stdout.strip()

    def http(path, body, token=None):
        request = urllib.request.Request(
            base + path, data=json.dumps(body).encode(), method='POST',
            headers={'apikey': anon_key, 'Authorization': 'Bearer ' + (token or anon_key),
                     'Content-Type': 'application/json'},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            try:
                return error.code, json.loads(error.read())
            except (ValueError, UnicodeError):
                return error.code, {}

    fixture = None
    tag = 'issue99-http-fixture-' + secrets.token_hex(12)
    try:
        status, created = http('/auth/v1/signup', {'data': {'issue99_test_fixture': tag}})
        if status not in (200, 201):
            raise RuntimeError(f'Anonymous fixture signup failed (HTTP {status})')
        fixture = str(uuid.UUID(created['user']['id']))
        token = created['access_token']
        refresh = created['refresh_token']
        status, result = http('/rest/v1/rpc/delete_own_account', {}, token)
        if status != 403 or result.get('code') != '42501':
            raise RuntimeError(f'Anonymous deletion denial failed (HTTP {status})')
        print('PASS: real anonymous JWT deletion denied', flush=True)

        owner = literal(fixture)
        marker = literal(tag)
        email = literal(tag + '@example.invalid')
        # Bound the identity conversion to exactly the API-created, marked fixture.
        changed = sql(f"""
        begin;
        update auth.users
           set is_anonymous = false, email = {email}, email_confirmed_at = now(),
               raw_app_meta_data = '{{"provider":"email","providers":["email"]}}'::jsonb
         where id = {owner}::uuid and raw_user_meta_data->>'issue99_test_fixture' = {marker}
         returning id;
        insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now()
          from auth.users where id = {owner}::uuid and raw_user_meta_data->>'issue99_test_fixture' = {marker};
        insert into public.user_goals (user_id, calorie_goal)
        select id::text, 2000 from auth.users where id = {owner}::uuid and raw_user_meta_data->>'issue99_test_fixture' = {marker};
        commit;
        """)
        if fixture not in changed:
            raise RuntimeError('Fixture identity marker could not be verified')
        status, signed_in = http('/auth/v1/token?grant_type=refresh_token', {'refresh_token': refresh})
        if status != 200:
            raise RuntimeError(f'Converted fixture token refresh failed (HTTP {status})')
        if signed_in.get('user', {}).get('is_anonymous') is not False:
            raise RuntimeError('Refreshed fixture remains anonymous')
        token = signed_in['access_token']
        status, result = http('/rest/v1/rpc/account_deletion_capability', {}, token)
        if status != 200 or result != 1:
            raise RuntimeError(f'Signed-in fixture capability failed (HTTP {status})')
        print('PASS: real refreshed signed-in JWT capability available', flush=True)
        # An ordinary live-identity policy check must block deletion until its
        # transaction ends. The deletion-side transaction rolls back completely.
        lock_sql = f"""set statement_timeout = '10s'; set lock_timeout = '5s';
        begin;
        select set_config('request.jwt.claim.sub', {owner}, true);
        set local role authenticated;
        select public.has_live_account();
        select pg_sleep(2);
        rollback;
        """
        lock_process = subprocess.Popen(
            ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
             '-h', POOLER, '-p', '5432', '-U', f'postgres.{PROJECT}', '-d', 'postgres'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=db_env, text=True,
        )
        try:
            lock_process.stdin.write(lock_sql)
            lock_process.stdin.close()
            lock_process.stdin = None
            # The first output is the known UUID; the second confirms the lock.
            if lock_process.stdout.readline().strip() != fixture or lock_process.stdout.readline().strip() != 't':
                raise RuntimeError('Fixture live-identity lock could not be acquired')
            started = time.monotonic()
            blocked_deletion = sql(f"""begin;
            select set_config('request.jwt.claim.sub', {owner}, true);
            select set_config('request.jwt.claims', jsonb_build_object('sub', {owner}, 'role', 'authenticated', 'is_anonymous', false)::text, true);
            set local role authenticated;
            select public.delete_own_account();
            rollback;
            """)
            elapsed = time.monotonic() - started
            lock_process.communicate(timeout=15)
            if lock_process.returncode != 0 or elapsed < 1 or blocked_deletion.splitlines()[-1] != 't':
                raise RuntimeError('Deletion did not wait for the live-identity transaction')
            if sql(f"select exists(select 1 from auth.users where id = {owner}::uuid)::text;") != 'true':
                raise RuntimeError('Rolled-back lock regression removed fixture identity')
            print('PASS: two connections serialize live-identity lock and rolled-back deletion', flush=True)
        finally:
            if lock_process.poll() is None:
                lock_process.terminate()
                lock_process.communicate(timeout=10)
        status, result = http('/rest/v1/rpc/delete_own_account', {}, token)
        if status != 200 or result is not True:
            raise RuntimeError(f'Real-token account deletion failed (HTTP {status})')
        if sql(f"select (exists(select 1 from auth.users where id = {owner}::uuid) or exists(select 1 from public.user_goals where user_id = {owner}))::text;") != 'false':
            raise RuntimeError('Deleted fixture auth/data remain')
        print('PASS: HTTP deletion removed fixture identity and owned goals', flush=True)
        status, result = http('/rest/v1/rpc/account_deletion_status', {}, token)
        if status != 200 or result is not True:
            raise RuntimeError(f'Stale real JWT receipt lookup failed (HTTP {status})')
        status, result = http('/rest/v1/user_goals', {'user_id': fixture, 'calorie_goal': 1900}, token)
        if status != 403 or result.get('code') != '42501':
            raise RuntimeError(f'Stale real JWT write denial failed (HTTP {status})')
        print('PASS: stale real JWT receipt succeeds and owned write is denied', flush=True)
    finally:
        if fixture:
            owner = literal(fixture)
            deletes = [f'delete from public.{table} where user_id = {owner};' for table in OWNED_TABLES]
            deletes.extend([
                f'delete from public.device_claims where user_id = {owner}::uuid;',
                f'delete from public.merge_tickets where from_uid = {owner}::uuid or used_by = {owner}::uuid;',
                f'delete from public.account_deletion_receipts where user_id = {owner}::uuid;',
                f'delete from auth.users where id = {owner}::uuid;',
            ])
            sql('begin;\n' + '\n'.join(deletes) + '\ncommit;')
            remaining = sql(f"select (exists(select 1 from auth.users where id = {owner}::uuid) or exists(select 1 from public.account_deletion_receipts where user_id = {owner}::uuid))::text;")
            if remaining != 'false':
                raise RuntimeError('Fixture cleanup verification failed')
            print('PASS: exact disposable fixture and recovery receipt cleaned up', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Messages above deliberately contain no token, key, password or raw HTTP body.
        print(f'FAIL: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
