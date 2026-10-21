#!/usr/bin/env python3
"""Two-connection live RLS/deletion regression using exact random fixture users only.

Run from repo root after deployment. Credentials stay in the existing .env and
subprocess environment. Every fixture, owned row and deletion receipt is cleaned.
"""
import os
import subprocess
import sys
import time
import uuid
import importlib.util
from pathlib import Path

# Share only credential loading, SQL literal escaping and the fixed project contract.
source = Path(__file__).with_name('delete-own-account-http.py')
spec = importlib.util.spec_from_file_location('deletion_http_fixture', source)
fixture_helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture_helpers)


def main():
    values = fixture_helpers.environment()
    project = fixture_helpers.PROJECT
    if values.get('EXPO_PUBLIC_SUPABASE_URL', '').rstrip('/') != f'https://{project}.supabase.co':
        raise RuntimeError('Refusing a backend other than the intended BinoFit project')
    db_env = os.environ.copy()
    db_env.update(PGPASSWORD=values['DB_PASSWORD'], PGSSLMODE='require', PGCONNECT_TIMEOUT='10')
    command = ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
               '-h', fixture_helpers.POOLER, '-p', '5432', '-U', f'postgres.{project}', '-d', 'postgres']
    preamble = "set statement_timeout = '12s'; set lock_timeout = '5s';\n"
    processes = []
    fixtures = [str(uuid.uuid4()), str(uuid.uuid4())]
    confirmed_fixtures = set()

    def sql(statement, expected_code=None):
        result = subprocess.run(command, input=preamble + statement, env=db_env,
                                text=True, capture_output=True, timeout=20)
        if expected_code:
            if result.returncode == 0 or f'{expected_code}:' not in result.stderr:
                raise RuntimeError('Expected stale-identity SQLSTATE was not returned')
        elif result.returncode:
            raise RuntimeError('Fixture database operation failed')
        return result.stdout.strip()

    def claims(owner):
        quoted = fixture_helpers.literal(owner)
        return f"""select set_config('request.jwt.claim.sub', {quoted}, true);
        select set_config('request.jwt.claims', jsonb_build_object('sub', {quoted}, 'role', 'authenticated', 'is_anonymous', false)::text, true);
        set local role authenticated;
        """

    def holding_transaction(statement, marker):
        process = subprocess.Popen(command, env=db_env, text=True, stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        processes.append(process)
        process.stdin.write(preamble + statement)
        process.stdin.close()
        process.stdin = None
        # Server-side 12s timeout bounds each statement even if this read waits.
        for line in process.stdout:
            if line.strip() == marker:
                return process
        raise RuntimeError('Fixture transaction did not acquire its expected lock')

    def finish(process):
        process.communicate(timeout=15)
        if process.returncode:
            raise RuntimeError('Fixture holding transaction failed')

    try:
        for owner in fixtures:
            quoted = fixture_helpers.literal(owner)
            email = fixture_helpers.literal('issue99-lock-fixture-' + owner + '@example.invalid')
            sql(f"""begin;
            insert into auth.users(id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data)
            values ({quoted}::uuid, 'authenticated', 'authenticated', {email}, false,
                    '{{"provider":"email","providers":["email"]}}'::jsonb,
                    jsonb_build_object('issue99_concurrency_fixture', {quoted}));
            insert into public.user_goals(user_id, calorie_goal) values ({quoted}, 2000);
            commit;
            """)
            confirmed_fixtures.add(owner)
        # Scenario 1: an actual authenticated UPDATE holds KEY SHARE via RLS.
        first = fixtures[0]
        quoted = fixture_helpers.literal(first)
        writer = holding_transaction(
            'begin;\n' + claims(first) + f"""
            update public.user_goals set calorie_goal = 2100 where user_id = {quoted};
            select 'issue99-write-held';
            select pg_sleep(2);
            commit;
            """, 'issue99-write-held')
        started = time.monotonic()
        deleted = sql('begin;\n' + claims(first) + 'select public.delete_own_account();\ncommit;')
        elapsed = time.monotonic() - started
        finish(writer)
        if elapsed < 1 or deleted.splitlines()[-1] != 't':
            raise RuntimeError('Deletion did not wait for the authenticated owned write')
        if sql(f"select (exists(select 1 from auth.users where id = {quoted}::uuid) or exists(select 1 from public.user_goals where user_id = {quoted}))::text;") != 'false':
            raise RuntimeError('Committed fixture write survived serialized deletion')
        print('PASS: deletion waits for owned UPDATE commit and removes that committed row', flush=True)

        # Scenario 2: deletion holds FOR UPDATE; a new food INSERT must wait and
        # then reject the vanished identity instead of creating an orphan row.
        second = fixtures[1]
        quoted = fixture_helpers.literal(second)
        food_id = fixture_helpers.literal('issue99-lock-fixture-food-' + second)
        deleter = holding_transaction(
            'begin;\n' + claims(second) + """
            select public.delete_own_account();
            select 'issue99-deletion-held';
            select pg_sleep(2);
            commit;
            """, 'issue99-deletion-held')
        started = time.monotonic()
        sql('begin;\n' + claims(second) + f"""
            insert into public.foods(id, user_id, name, source)
            values ({food_id}, {quoted}, 'Issue 99 lock fixture', 'custom');
            commit;
            """, expected_code='42501')
        elapsed = time.monotonic() - started
        finish(deleter)
        if elapsed < 1:
            raise RuntimeError('Owned insert did not wait for the deletion transaction')
        if sql(f"select (exists(select 1 from auth.users where id = {quoted}::uuid) or exists(select 1 from public.foods where id = {food_id}))::text;") != 'false':
            raise RuntimeError('Stale-identity insert survived serialized deletion')
        print('PASS: owned INSERT waits for deletion commit then rejects stale identity', flush=True)
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                process.communicate(timeout=10)
        for owner in fixtures:
            quoted = fixture_helpers.literal(owner)
            if owner not in confirmed_fixtures:
                marked = sql(f"select exists(select 1 from auth.users where id = {quoted}::uuid and raw_user_meta_data->>'issue99_concurrency_fixture' = {quoted})::text;")
                if marked != 'true':
                    continue
            deletes = [f'delete from public.{table} where user_id = {quoted};'
                       for table in fixture_helpers.OWNED_TABLES]
            deletes.extend([
                f'delete from public.device_claims where user_id = {quoted}::uuid;',
                f'delete from public.merge_tickets where from_uid = {quoted}::uuid or used_by = {quoted}::uuid;',
                f'delete from public.account_deletion_receipts where user_id = {quoted}::uuid;',
                f'delete from auth.users where id = {quoted}::uuid;',
            ])
            sql('begin;\n' + '\n'.join(deletes) + '\ncommit;')
            if sql(f"select (exists(select 1 from auth.users where id = {quoted}::uuid) or exists(select 1 from public.account_deletion_receipts where user_id = {quoted}::uuid))::text;") != 'false':
                raise RuntimeError('Exact concurrency fixture cleanup failed')
        print('PASS: both exact concurrency fixtures and receipts cleaned up', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'FAIL: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
