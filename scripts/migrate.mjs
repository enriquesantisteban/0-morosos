import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Falta DATABASE_URL. Cópiala del entorno de Vercel que quieres reparar y vuelve a ejecutar.')
  process.exit(1)
}

const sql = await readFile(new URL('../drizzle/0000_initial.sql', import.meta.url), 'utf8')
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
  max: 1,
})

try {
  await pool.query(sql)
  console.log('Migración aplicada correctamente.')
} catch (error) {
  console.error('No se pudo aplicar la migración:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
