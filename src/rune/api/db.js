import { URL } from 'node:url'

class PostgresDriver {
  constructor(client) { this.client = client }
  async query(sql, params) {
    const res = await this.client.query(sql, params)
    return res.rows
  }
  async get(sql, params) {
    const res = await this.client.query(sql, params)
    return res.rows[0] ?? null
  }
  async exec(sql, params) {
    const res = await this.client.query(sql, params)
    return { changes: res.rowCount }
  }
  async close() { await this.client.end() }
}

class MySqlDriver {
  constructor(conn) { this.conn = conn }
  async query(sql, params) {
    const [rows] = await this.conn.execute(sql, params)
    return rows
  }
  async get(sql, params) {
    const [rows] = await this.conn.execute(sql, params)
    return rows[0] ?? null
  }
  async exec(sql, params) {
    const [result] = await this.conn.execute(sql, params)
    return { changes: result.affectedRows }
  }
  async close() { await this.conn.end() }
}

export function createDbUtils(dir, checkPermission) {
  const connections = []

  return {
    async connect(connectionString) {
      const url = new URL(connectionString)
      const protocol = url.protocol.replace(':', '')
      const host = url.hostname
      const port = url.port || (protocol.startsWith('postgres') ? '5432' : '3306')
      const database = url.pathname.slice(1) || 'default'

      const tokenValue = `${protocol}:${host}:${port}/${database}`
      if (checkPermission) {
        checkPermission('db.connect', tokenValue)
      }

      if (protocol === 'postgres' || protocol === 'postgresql') {
        const { default: pg } = await import('pg')
        const client = new pg.Client({ connectionString })
        await client.connect()
        const handle = new PostgresDriver(client)
        connections.push(handle)
        return handle
      }

      if (protocol === 'mysql' || protocol === 'mysql2') {
        const { default: mysql } = await import('mysql2/promise')
        const conn = await mysql.createConnection(connectionString)
        const handle = new MySqlDriver(conn)
        connections.push(handle)
        return handle
      }

      throw new TypeError(`Unsupported DB protocol: "${protocol}"`)
    },
    dispose() {
      for (const conn of connections) {
        try { conn.close() } catch {}
      }
      connections.length = 0
    }
  }
}
