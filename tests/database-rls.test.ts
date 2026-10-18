import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runtimePool, withTenantTransaction } from '../src/db/pool';
import { startPostgresTestServer, stopPostgresTestServer } from './helpers/postgres-test-server';

describe('PostgreSQL Database RLS Isolation & Direct SQL Integrity Tests', () => {
  before(async () => {
    await startPostgresTestServer(5433);
  });

  after(async () => {
    await stopPostgresTestServer();
  });

  it('verifies RLS isolation and unprivileged role boundaries under waste_app_user', async () => {
    const client = await runtimePool.connect();

    try {
      // 1. Verify runtime connection role
      const { rows: userRows } = await client.query('SELECT current_user, session_user');
      assert.equal(userRows[0].current_user, 'waste_app_user', 'Runtime pool must connect as waste_app_user');

      // 2. Verify waste_app_user has NOSUPERUSER and NOBYPASSRLS
      const { rows: privRows } = await client.query(`
        SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb 
        FROM pg_roles 
        WHERE rolname = 'waste_app_user'
      `);
      assert.equal(privRows[0].rolsuper, false, 'waste_app_user must have NOSUPERUSER');
      assert.equal(privRows[0].rolbypassrls, false, 'waste_app_user must have NOBYPASSRLS');
      assert.equal(privRows[0].rolcreaterole, false, 'waste_app_user must have NOCREATEROLE');
      assert.equal(privRows[0].rolcreatedb, false, 'waste_app_user must have NOCREATEDB');

      // 3. Obtain two distinct demo tenant IDs
      const { rows: tenants } = await client.query('SELECT id, slug FROM tenants WHERE is_demo = TRUE ORDER BY slug ASC LIMIT 2');
      assert.ok(tenants.length >= 2, 'At least 2 demo tenants must be seeded to test cross-tenant isolation.');

      const tenant1Id = tenants[0].id;
      const tenant2Id = tenants[1].id;

      // 4. Test Cross-Tenant SELECT under Tenant 1 context
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenant1Id]);

      const { rows: t1Localities } = await client.query('SELECT id, locality_name FROM localities');
      assert.ok(t1Localities.length > 0, 'Should read localities for Tenant 1');

      // Attempt to query Tenant 2 records under Tenant 1 context (Must return 0 rows)
      const { rows: crossRows } = await client.query(
        'SELECT id FROM localities WHERE tenant_id = $1',
        [tenant2Id]
      );
      assert.equal(crossRows.length, 0, 'RLS must block reading Tenant 2 localities under Tenant 1 context');

      // 5. Test Cross-Tenant INSERT under Tenant 1 context (using SAVEPOINT to isolate expected failure)
      let insertBlocked = false;
      await client.query('SAVEPOINT cross_insert_sp');
      try {
        await client.query(`
          INSERT INTO properties (
            tenant_id, locality_id, property_identifier, property_type, address_line
          ) VALUES ($1, $2, 'PROP-CROSS-ATTEMPT', 'RESIDENTIAL', 'Cross-tenant illegal insert')
        `, [tenant2Id, t1Localities[0].id]);
      } catch (insertErr: any) {
        insertBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT cross_insert_sp');
        assert.ok(
          insertErr.message.includes('violates row-level security policy') ||
          insertErr.message.includes('check constraint') ||
          insertErr.code === '42501' ||
          insertErr.message.includes('INVALID_LOCALITY'),
          'RLS WITH CHECK must reject cross-tenant insertion'
        );
      }
      assert.equal(insertBlocked, true, 'Cross-tenant insertion must be blocked by RLS');

      // 6. Test Cross-Tenant UPDATE under Tenant 1 context (Should affect 0 rows)
      const updateResult = await client.query(
        `UPDATE properties SET address_line = 'Hacked Address' WHERE tenant_id = $1`,
        [tenant2Id]
      );
      assert.equal(updateResult.rowCount, 0, 'Cross-tenant UPDATE must affect 0 rows under RLS');

      // 7. Test Cross-Tenant DELETE under Tenant 1 context (Should affect 0 rows)
      const deleteResult = await client.query(
        `DELETE FROM properties WHERE tenant_id = $1`,
        [tenant2Id]
      );
      assert.equal(deleteResult.rowCount, 0, 'Cross-tenant DELETE must affect 0 rows under RLS');

      // 8. Test Missing Tenant Context: When app.current_tenant_id is not set, RLS yields 0 rows
      await client.query(`SELECT set_config('app.current_tenant_id', '', true)`);
      const { rows: emptyContextRows } = await client.query('SELECT id FROM localities');
      assert.equal(emptyContextRows.length, 0, 'Empty tenant context must return zero rows for tenant-owned tables');

      await client.query('ROLLBACK');

      // 9. Verify Tenant Context Isolation Across Pooled Transactions
      await withTenantTransaction(tenant1Id, async (txClient) => {
        const { rows: ctxRows } = await txClient.query(`SELECT current_setting('app.current_tenant_id', true) AS ctx`);
        assert.equal(ctxRows[0].ctx, tenant1Id, 'Transaction must execute with Tenant 1 context');
        const { rows: locs } = await txClient.query('SELECT id FROM localities');
        assert.ok(locs.length > 0, 'Should read Tenant 1 localities');
      });

      // Bare query from pool after commit: must have no residual tenant context
      const { rows: postCommitRows } = await client.query(`SELECT current_setting('app.current_tenant_id', true) AS ctx`);
      assert.ok(
        !postCommitRows[0].ctx || postCommitRows[0].ctx === '',
        'Tenant context must not leak into pool after committed transaction'
      );

      // Verify second tenant transaction is isolated
      await withTenantTransaction(tenant2Id, async (txClient) => {
        const { rows: ctxRows } = await txClient.query(`SELECT current_setting('app.current_tenant_id', true) AS ctx`);
        assert.equal(ctxRows[0].ctx, tenant2Id, 'Transaction must execute with Tenant 2 context');
      });

      // Verify rollback isolation
      try {
        await withTenantTransaction(tenant1Id, async () => {
          throw new Error('Forced test transaction rollback');
        });
      } catch {
        // Expected rollback
      }

      const { rows: postRollbackRows } = await client.query(`SELECT current_setting('app.current_tenant_id', true) AS ctx`);
      assert.ok(
        !postRollbackRows[0].ctx || postRollbackRows[0].ctx === '',
        'Tenant context must not leak into pool after aborted transaction'
      );
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  it('verifies direct SQL accounting posting invariant defenses and immutability triggers', async () => {
    const client = await runtimePool.connect();

    try {
      const { rows: tenants } = await client.query('SELECT id FROM tenants WHERE is_demo = TRUE ORDER BY slug ASC LIMIT 1');
      assert.ok(tenants.length > 0, 'Demo tenant must exist for accounting SQL test.');
      const tenantId = tenants[0].id;

      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // 1. Fetch active accounts
      const { rows: accts } = await client.query(
        `SELECT id, account_code FROM chart_of_accounts WHERE tenant_id = $1 AND is_active = TRUE ORDER BY account_code ASC LIMIT 2`,
        [tenantId]
      );
      assert.ok(accts.length >= 2, 'At least 2 active chart of accounts required for testing.');

      // 2. Direct SQL Attempt: Try to INSERT a journal directly in POSTED status (without lines)
      let directInsertBlocked = false;
      await client.query('SAVEPOINT direct_post_sp');
      try {
        await client.query(`
          INSERT INTO journal_entries (
            tenant_id, entry_number, posting_date, status, business_event_type, business_event_id, description
          ) VALUES ($1, 'JE-DIRECT-POST-FAIL', '2026-03-01', 'POSTED', 'MANUAL_TEST', 'EVT-FAIL-01', 'Direct posted insert without lines')
        `, [tenantId]);
      } catch (err: any) {
        directInsertBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT direct_post_sp');
        assert.ok(
          err.message.includes('INVALID_POSTING_WORKFLOW'),
          'Trigger must block direct creation of journal entry in POSTED status'
        );
      }
      assert.equal(directInsertBlocked, true, 'Direct insertion of POSTED journal must be rejected by database trigger');

      // 3. Create a valid DRAFT journal entry
      const { rows: draftRows } = await client.query(`
        INSERT INTO journal_entries (
          tenant_id, entry_number, posting_date, status, business_event_type, business_event_id, description
        ) VALUES ($1, 'JE-SQL-INVARIANT-TEST', '2026-03-01', 'DRAFT', 'MANUAL_TEST', 'EVT-TEST-INVARIANT-01', 'Test Draft for Invariant Trigger')
        RETURNING id
      `, [tenantId]);
      const draftId = draftRows[0].id;

      // 4. Direct SQL Attempt: Try to UPDATE draft to POSTED with 0 lines
      let emptyPostBlocked = false;
      await client.query('SAVEPOINT empty_post_sp');
      try {
        await client.query(`UPDATE journal_entries SET status = 'POSTED' WHERE id = $1`, [draftId]);
      } catch (err: any) {
        emptyPostBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT empty_post_sp');
        assert.ok(err.message.includes('INSUFFICIENT_LINES'), 'Trigger must reject posting with 0 lines');
      }
      assert.equal(emptyPostBlocked, true, 'Posting with zero lines must be blocked by database trigger');

      // 5. Add 1 line (insufficient lines)
      await client.query(`
        INSERT INTO journal_entry_lines (
          journal_entry_id, tenant_id, line_number, account_id, entry_type, amount_minor_units, currency
        ) VALUES ($1, $2, 1, $3, 'DEBIT', 10000, 'INR')
      `, [draftId, tenantId, accts[0].id]);

      let singleLinePostBlocked = false;
      await client.query('SAVEPOINT single_line_sp');
      try {
        await client.query(`UPDATE journal_entries SET status = 'POSTED' WHERE id = $1`, [draftId]);
      } catch (err: any) {
        singleLinePostBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT single_line_sp');
        assert.ok(
          err.message.includes('INSUFFICIENT_LINES') || err.message.includes('MISSING_TWO_SIDED_PARTICIPATION'),
          'Trigger must reject posting with 1 line'
        );
      }
      assert.equal(singleLinePostBlocked, true, 'Posting with 1 line must be blocked by database trigger');

      // 6. Add second line UNBALANCED (Debit 10000, Credit 5000)
      await client.query(`
        INSERT INTO journal_entry_lines (
          journal_entry_id, tenant_id, line_number, account_id, entry_type, amount_minor_units, currency
        ) VALUES ($1, $2, 2, $3, 'CREDIT', 5000, 'INR')
      `, [draftId, tenantId, accts[1].id]);

      let unbalancedPostBlocked = false;
      await client.query('SAVEPOINT unbal_post_sp');
      try {
        await client.query(`UPDATE journal_entries SET status = 'POSTED' WHERE id = $1`, [draftId]);
      } catch (err: any) {
        unbalancedPostBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT unbal_post_sp');
        assert.ok(err.message.includes('UNBALANCED_JOURNAL'), 'Trigger must reject unbalanced posting');
      }
      assert.equal(unbalancedPostBlocked, true, 'Unbalanced posting must be blocked by database trigger');

      // 7. Fix line 2 to be balanced (Credit 10000)
      await client.query(`
        UPDATE journal_entry_lines SET amount_minor_units = 10000 WHERE journal_entry_id = $1 AND line_number = 2
      `, [draftId]);

      // 8. Now transition to POSTED (Must succeed!)
      await client.query(`UPDATE journal_entries SET status = 'POSTED' WHERE id = $1`, [draftId]);

      const { rows: postedRows } = await client.query('SELECT status, posted_at FROM journal_entries WHERE id = $1', [draftId]);
      assert.equal(postedRows[0].status, 'POSTED');
      assert.ok(postedRows[0].posted_at !== null);

      // 9. Immutability Defense: Attempt to UPDATE posted header
      let headerUpdateBlocked = false;
      await client.query('SAVEPOINT header_update_sp');
      try {
        await client.query(`UPDATE journal_entries SET description = 'Tampered description' WHERE id = $1`, [draftId]);
      } catch (err: any) {
        headerUpdateBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT header_update_sp');
        assert.ok(err.message.includes('IMMUTABLE_RECORD'), 'Trigger must block UPDATE on posted header');
      }
      assert.equal(headerUpdateBlocked, true, 'Header UPDATE on posted entry must be blocked');

      // 10. Immutability Defense: Attempt to DELETE posted header
      let headerDeleteBlocked = false;
      await client.query('SAVEPOINT header_delete_sp');
      try {
        await client.query(`DELETE FROM journal_entries WHERE id = $1`, [draftId]);
      } catch (err: any) {
        headerDeleteBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT header_delete_sp');
        assert.ok(err.message.includes('IMMUTABLE_RECORD'), 'Trigger must block DELETE on posted header');
      }
      assert.equal(headerDeleteBlocked, true, 'Header DELETE on posted entry must be blocked');

      // 11. Immutability Defense: Attempt to INSERT new line into posted entry
      let lineInsertBlocked = false;
      await client.query('SAVEPOINT line_insert_sp');
      try {
        await client.query(`
          INSERT INTO journal_entry_lines (
            journal_entry_id, tenant_id, line_number, account_id, entry_type, amount_minor_units, currency
          ) VALUES ($1, $2, 3, $3, 'DEBIT', 5000, 'INR')
        `, [draftId, tenantId, accts[0].id]);
      } catch (err: any) {
        lineInsertBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT line_insert_sp');
        assert.ok(err.message.includes('IMMUTABLE_RECORD'), 'Trigger must block INSERT of line into posted entry');
      }
      assert.equal(lineInsertBlocked, true, 'Line INSERT on posted entry must be blocked');

      // 12. Immutability Defense: Attempt to UPDATE line of posted entry
      let lineUpdateBlocked = false;
      await client.query('SAVEPOINT line_update_sp');
      try {
        await client.query(`UPDATE journal_entry_lines SET amount_minor_units = 20000 WHERE journal_entry_id = $1 AND line_number = 1`, [draftId]);
      } catch (err: any) {
        lineUpdateBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT line_update_sp');
        assert.ok(err.message.includes('IMMUTABLE_RECORD'), 'Trigger must block UPDATE of line on posted entry');
      }
      assert.equal(lineUpdateBlocked, true, 'Line UPDATE on posted entry must be blocked');

      // 13. Compensating Reversal Direct-SQL Workflow:
      // Create separate reversal journal entry referencing original postedId
      const { rows: revRows } = await client.query(`
        INSERT INTO journal_entries (
          tenant_id, entry_number, posting_date, status, business_event_type, business_event_id, reversal_of_entry_id, description
        ) VALUES ($1, 'JE-SQL-REVERSAL-TEST', '2026-03-02', 'DRAFT', 'COMPENSATING_REVERSAL', 'EVT-REV-INVARIANT-01', $2, 'Compensating Reversal Test')
        RETURNING id
      `, [tenantId, draftId]);
      const reversalId = revRows[0].id;

      // Invert debits and credits: Line 1 Credit 10000, Line 2 Debit 10000
      await client.query(`
        INSERT INTO journal_entry_lines (
          journal_entry_id, tenant_id, line_number, account_id, entry_type, amount_minor_units, currency
        ) VALUES 
          ($1, $2, 1, $3, 'CREDIT', 10000, 'INR'),
          ($1, $2, 2, $4, 'DEBIT', 10000, 'INR')
      `, [reversalId, tenantId, accts[0].id, accts[1].id]);

      // Post the reversal
      await client.query(`UPDATE journal_entries SET status = 'POSTED' WHERE id = $1`, [reversalId]);

      // Verify reversal is POSTED and original remains POSTED
      const { rows: verifiedRevRows } = await client.query('SELECT status FROM journal_entries WHERE id = $1', [reversalId]);
      assert.equal(verifiedRevRows[0].status, 'POSTED');

      const { rows: origEntryRows } = await client.query('SELECT status FROM journal_entries WHERE id = $1', [draftId]);
      assert.equal(origEntryRows[0].status, 'POSTED', 'Original entry must remain POSTED, not overwritten or mutated');

      // Attempt to reverse the same entry a second time: must fail with ALREADY_REVERSED
      const { rows: secondRevRows } = await client.query(`
        INSERT INTO journal_entries (
          tenant_id, entry_number, posting_date, status, business_event_type, business_event_id, reversal_of_entry_id, description
        ) VALUES ($1, 'JE-SQL-REVERSAL-DUPE', '2026-03-02', 'DRAFT', 'COMPENSATING_REVERSAL', 'EVT-REV-DUPE-01', $2, 'Duplicate Reversal Test')
        RETURNING id
      `, [tenantId, draftId]);
      const secondRevId = secondRevRows[0].id;

      await client.query(`
        INSERT INTO journal_entry_lines (
          journal_entry_id, tenant_id, line_number, account_id, entry_type, amount_minor_units, currency
        ) VALUES 
          ($1, $2, 1, $3, 'CREDIT', 10000, 'INR'),
          ($1, $2, 2, $4, 'DEBIT', 10000, 'INR')
      `, [secondRevId, tenantId, accts[0].id, accts[1].id]);

      let duplicateRevBlocked = false;
      await client.query('SAVEPOINT dupe_rev_sp');
      try {
        await client.query(`UPDATE journal_entries SET status = 'POSTED' WHERE id = $1`, [secondRevId]);
      } catch (err: any) {
        duplicateRevBlocked = true;
        await client.query('ROLLBACK TO SAVEPOINT dupe_rev_sp');
        assert.ok(err.message.includes('ALREADY_REVERSED'), 'Trigger must reject duplicate reversal of the same entry');
      }
      assert.equal(duplicateRevBlocked, true, 'Duplicate compensating reversal must be blocked by database trigger');

      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });
});
