import { Database } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Create a temp database in memory
const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT,
    age INTEGER
  );
`);

const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  age: integer('age'),
});

const db = drizzle(async (sql, params, method) => {
  console.log(`[SQL-PROXY] method: ${method}, sql: ${sql}, params:`, params);
  
  const stmt = sqlite.prepare(sql);
  
  if (method === 'run') {
    stmt.run(...params);
    return { rows: [] };
  }
  
  if (method === 'get') {
    const row = stmt.get(...params);
    console.log('[SQL-PROXY] returning get:', row);
    // get expects { rows: [...] } or just the values?
    // Let's return the row as an array of values, or object?
    // Let's check what happens if we return { rows: row ? Object.values(row) : [] }
    return { rows: row ? Object.values(row) : [] };
  }
  
  if (method === 'all') {
    const rows = stmt.all(...params);
    console.log('[SQL-PROXY] returning all:', rows);
    // all expects array of arrays (values) or array of objects?
    // Let's test returning array of arrays (values)
    const values = rows.map(r => Object.values(r));
    return { rows: values };
  }
  
  const rows = stmt.all(...params);
  return { rows: rows.map(r => Object.values(r)) };
}, { schema: { users } });

// Run some queries to see what they trigger and expect!
try {
  console.log('--- INSERTING ---');
  await db.insert(users).values({ id: '1', name: 'Alice', age: 25 });
  
  console.log('--- SELECTING ALL ---');
  const allUsers = await db.select().from(users);
  console.log('Result allUsers:', allUsers);
  
  console.log('--- SELECTING ONE ---');
  const [alice] = await db.select().from(users).limit(1);
  console.log('Result alice:', alice);
} catch (err) {
  console.error('Error during test:', err);
}
