import { join } from 'path'
import { existsSync } from 'fs'
import { ForkPromise } from '@shared/ForkPromise'
import {
  getDbFilePath,
  getSqlite3Path,
  getBcryptPath,
  resolveDataDir,
  runNodeScript
} from './utils'

/** List all n8n users by reading directly from the SQLite database.
 *  Works offline — n8n does not need to be running, no credentials required.
 */
export function userList(): ForkPromise<any[]> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      const dataDir = await resolveDataDir()
      const dbFile = join(dataDir, 'database.sqlite')
      if (!existsSync(dbFile)) {
        resolve([])
        return
      }

      const sqlite3Path = await getSqlite3Path()
      const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, sqlite3.OPEN_READONLY, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.all(
    'SELECT id, email, firstName, lastName, roleSlug, disabled, (CASE WHEN (password IS NULL OR password = \\'\\') THEN 1 ELSE 0 END) AS isPending FROM user',
    [],
    function(err2, rows) {
      if (err2) { process.stderr.write(err2.message); process.exit(1); }
      process.stdout.write(JSON.stringify(rows || []));
      d.close(function() { process.exit(0); });
    }
  );
});`
      const output = await runNodeScript(script)
      resolve(JSON.parse(output))
    } catch (e: any) {
      reject(e)
    }
  })
}

/**
 * Delete an n8n user by writing directly to the SQLite database.
 * Works offline — n8n does not need to be running, no credentials required.
 * Refuses to delete the global:owner account.
 */
export function userDelete(userId: string): ForkPromise<void> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      if (!userId) throw new Error('User ID is required')
      const dbFile = await getDbFilePath()
      const sqlite3Path = await getSqlite3Path()

      const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const userId  = ${JSON.stringify(userId)};
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT id, roleSlug FROM user WHERE id = ?', [userId], function(err2, row) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    if (!row) { process.stderr.write('User not found'); process.exit(1); }
    if (row.roleSlug === 'global:owner') { process.stderr.write('Cannot delete the owner account'); process.exit(1); }
    d.run('DELETE FROM user WHERE id = ?', [userId], function(err3) {
      if (err3) { process.stderr.write(err3.message); process.exit(1); }
      process.stdout.write('ok');
      d.close(function() { process.exit(0); });
    });
  });
});
`
      await runNodeScript(script)
      resolve()
    } catch (e: any) {
      reject(e)
    }
  })
}

/** Enable or disable an n8n user (SQLite direct write). Refuses to disable the owner. */
export function userSetDisabled(userId: string, disabled: boolean): ForkPromise<void> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      if (!userId) throw new Error('User ID is required')
      const dbFile = await getDbFilePath()
      const sqlite3Path = await getSqlite3Path()
      const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const userId  = ${JSON.stringify(userId)};
const disabled = ${disabled ? 1 : 0};
const now = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT roleSlug FROM user WHERE id = ?', [userId], function(err2, row) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    if (!row) { process.stderr.write('User not found'); process.exit(1); }
    if (row.roleSlug === 'global:owner') { process.stderr.write('Cannot disable the owner account'); process.exit(1); }
    d.run('UPDATE user SET disabled = ?, updatedAt = ? WHERE id = ?', [disabled, now, userId], function(err3) {
      if (err3) { process.stderr.write(err3.message); process.exit(1); }
      process.stdout.write('ok');
      d.close(function() { process.exit(0); });
    });
  });
});
`
      await runNodeScript(script)
      resolve()
    } catch (e: any) {
      reject(e)
    }
  })
}

/** Change an n8n user's role (SQLite direct write). Refuses to change the owner's role. */
export function userSetRole(userId: string, roleSlug: string): ForkPromise<void> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      if (!userId) throw new Error('User ID is required')
      if (!roleSlug) throw new Error('Role is required')
      const dbFile = await getDbFilePath()
      const sqlite3Path = await getSqlite3Path()
      const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const userId   = ${JSON.stringify(userId)};
const roleSlug = ${JSON.stringify(roleSlug)};
const now = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT roleSlug FROM user WHERE id = ?', [userId], function(err2, row) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    if (!row) { process.stderr.write('User not found'); process.exit(1); }
    if (row.roleSlug === 'global:owner') { process.stderr.write('Cannot change the owner role'); process.exit(1); }
    d.run('UPDATE user SET roleSlug = ?, updatedAt = ? WHERE id = ?', [roleSlug, now, userId], function(err3) {
      if (err3) { process.stderr.write(err3.message); process.exit(1); }
      process.stdout.write('ok');
      d.close(function() { process.exit(0); });
    });
  });
});
`
      await runNodeScript(script)
      resolve()
    } catch (e: any) {
      reject(e)
    }
  })
}

/** Update an n8n user's first/last name (SQLite direct write). */
export function userSetName(
  userId: string,
  firstName: string,
  lastName: string
): ForkPromise<void> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      if (!userId) throw new Error('User ID is required')
      const dbFile = await getDbFilePath()
      const sqlite3Path = await getSqlite3Path()
      const script = `
const sqlite3   = require(${JSON.stringify(sqlite3Path)});
const userId    = ${JSON.stringify(userId)};
const firstName = ${JSON.stringify(firstName || '')};
const lastName  = ${JSON.stringify(lastName || '')};
const now = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.run('UPDATE user SET firstName = ?, lastName = ?, updatedAt = ? WHERE id = ?', [firstName, lastName, now, userId], function(err2) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    process.stdout.write('ok');
    d.close(function() { process.exit(0); });
  });
});
`
      await runNodeScript(script)
      resolve()
    } catch (e: any) {
      reject(e)
    }
  })
}

/** Reset any n8n user's password by bcrypt-hashing and writing directly to SQLite. */
export function userResetPassword(userId: string, newPassword: string): ForkPromise<void> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      if (!userId) throw new Error('User ID is required')
      if (!newPassword) throw new Error('Password is required')
      const dbFile = await getDbFilePath()
      const sqlite3Path = await getSqlite3Path()
      const bcryptPath = await getBcryptPath()
      const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const bcrypt  = require(${JSON.stringify(bcryptPath)});
const userId  = ${JSON.stringify(userId)};
const hash    = bcrypt.hashSync(${JSON.stringify(newPassword)}, 10);
const now     = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.run('UPDATE user SET password = ?, updatedAt = ? WHERE id = ?', [hash, now, userId], function(err2) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    process.stdout.write('ok');
    d.close(function() { process.exit(0); });
  });
});
`
      await runNodeScript(script)
      resolve()
    } catch (e: any) {
      reject(e)
    }
  })
}

/**
 * Create a new n8n user by writing directly to the SQLite database.
 * Works offline — n8n does not need to be running, no owner credentials required.
 */
export function userCreate(
  email: string,
  firstName: string,
  lastName: string,
  role: string,
  password: string
): ForkPromise<any> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      if (!email) throw new Error('Email is required')
      if (!password) throw new Error('Password is required')
      const dbFile = await getDbFilePath()
      const sqlite3Path = await getSqlite3Path()
      const bcryptPath = await getBcryptPath()

      const script = `
const sqlite3   = require(${JSON.stringify(sqlite3Path)});
const bcrypt    = require(${JSON.stringify(bcryptPath)});
const email     = ${JSON.stringify(email)};
const firstName = ${JSON.stringify(firstName || '')};
const lastName  = ${JSON.stringify(lastName || '')};
const roleSlug  = ${JSON.stringify(role || 'global:member')};
const password  = ${JSON.stringify(password)};
const id  = require('crypto').randomUUID();
const hash = bcrypt.hashSync(password, 10);
const now  = new Date().toISOString().replace('T', ' ').slice(0, 23);
const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT id FROM user WHERE email = ?', [email], function(err2, row) {
    if (err2) { process.stderr.write(err2.message); process.exit(1); }
    if (row) { process.stderr.write('A user with this email already exists'); process.exit(1); }
    d.run(
      'INSERT INTO user (id, email, firstName, lastName, password, roleSlug, disabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
      [id, email, firstName, lastName, hash, roleSlug, now, now],
      function(err3) {
        if (err3) { process.stderr.write(err3.message); process.exit(1); }
        process.stdout.write(JSON.stringify({ id, email, firstName, lastName, roleSlug }));
        d.close(function() { process.exit(0); });
      }
    );
  });
});
`
      const output = await runNodeScript(script)
      resolve(JSON.parse(output))
    } catch (e: any) {
      reject(e)
    }
  })
}

/**
 * Change the owner's password by writing a bcrypt hash directly into the SQLite database.
 * Works offline — n8n does not need to be running.
 * Also updates N8N_OWNER_PASSWORD in the env file for parity.
 */
export function userChangeOwnerPassword(newPassword: string, email: string): ForkPromise<void> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      if (!newPassword) throw new Error('New password is required')
      if (!email) throw new Error('N8N_OWNER_EMAIL not configured in env file')

      const dbFile = await getDbFilePath()
      const sqlite3Path = await getSqlite3Path()
      const bcryptPath = await getBcryptPath()

      const script = `
const sqlite3 = require(${JSON.stringify(sqlite3Path)});
const bcrypt  = require(${JSON.stringify(bcryptPath)});
const email   = ${JSON.stringify(email)};
const next    = ${JSON.stringify(newPassword)};

const d = new sqlite3.Database(${JSON.stringify(dbFile)}, function(err) {
  if (err) { process.stderr.write(err.message); process.exit(1); }
  d.get('SELECT id FROM user WHERE email = ?', [email], function(err2, row) {
    if (err2 || !row) {
      process.stderr.write(err2 ? err2.message : 'User not found');
      process.exit(1);
    }
    const hash = bcrypt.hashSync(next, 10);
    const now  = new Date().toISOString().replace('T', ' ').slice(0, 23);
    d.run('UPDATE user SET password = ?, updatedAt = ? WHERE email = ?', [hash, now, email], function(err3) {
      if (err3) { process.stderr.write(err3.message); process.exit(1); }
      process.stdout.write('ok');
      d.close(function() { process.exit(0); });
    });
  });
});`
      await runNodeScript(script)
      resolve()
    } catch (e: any) {
      reject(e)
    }
  })
}
