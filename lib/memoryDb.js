// Banco em memória SÓ para desenvolvimento local (nunca roda na Vercel).
// Imita o subconjunto do supabase-js que o backend usa (select/insert/update/
// delete/upsert + filtros eq/neq/in/is/gte/lte/lt/gt + order/limit/single),
// pra mesma rota funcionar igual aqui e em produção sem `if` espalhado.
import crypto from 'node:crypto'
import { buildDemoData } from './demoData.js'

const now = () => new Date().toISOString()

// Espelha os DEFAULTs do SQL em supabase/migrations/001_init.sql.
const DEFAULTS = {
  users: () => ({ role: 'member', created_at: now() }),
  clients: () => ({
    status: 'active',
    tags: [],
    manager: null,
    notes: null,
    meta_ad_account_id: null,
    meta_access_token_enc: null,
    google_ads_customer_id: null,
    result_metric: 'auto',
    balance_alert_threshold: 100,
    monthly_budget: null,
    meta_snapshot: null,
    google_snapshot: null,
    last_check_at: null,
    last_optimization_at: null,
    segment: null,
    city: null,
    fee_monthly: null,
    contract_start: null,
    billing_day: null,
    renewal_date: null,
    links: {},
    access_notes: null,
    last_contact_at: null,
    churned_at: null,
    created_at: now(),
    updated_at: now(),
  }),
  contacts: () => ({ role: null, phone: null, email: null, is_decision_maker: false, notes: null, created_at: now() }),
  leads: () => ({
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    instagram: null,
    segment: null,
    source: null,
    stage: 'lead',
    fee_proposed: null,
    media_budget: null,
    proposal_url: null,
    next_step: null,
    next_step_at: null,
    owner: null,
    notes: null,
    lost_reason: null,
    client_id: null,
    stage_changed_at: now(),
    won_at: null,
    lost_at: null,
    created_at: now(),
    updated_at: now(),
  }),
  interactions: () => ({
    client_id: null,
    lead_id: null,
    kind: 'note',
    happened_at: now(),
    next_step: null,
    next_step_at: null,
    next_step_done: false,
    created_at: now(),
  }),
  account_snapshots: () => ({ checked_at: now(), ok: true }),
  optimizations: () => ({ platform: 'meta', category: 'outro', performed_at: now(), created_at: now() }),
  pendencias: () => ({ status: 'open', description: null, due_date: null, assignee: null, done_at: null, created_at: now() }),
  alerts: () => ({ severity: 'warning', created_at: now(), updated_at: now(), resolved_at: null, resolved_by: null, emailed_at: null }),
  app_state: () => ({ updated_at: now() }),
}

const PRIMARY_KEY = { app_state: 'key' }
const UNIQUE = { users: ['email'] }
// Tabelas filhas apagadas junto com o cliente (on delete cascade no SQL).
const CASCADE_FROM_CLIENTS = ['account_snapshots', 'optimizations', 'pendencias', 'alerts', 'contacts', 'interactions']

const clone = (v) => (v == null ? v : structuredClone(v))

class Query {
  constructor(store, table) {
    this.store = store
    this.table = table
    this.op = 'select'
    this.filters = []
    this.orders = []
    this.limitN = null
    this.singleMode = null
    this.columns = null
    this.payload = null
    this.returning = false
    this.onConflict = null
  }

  select(columns = '*') {
    if (this.op === 'select') this.columns = columns
    else this.returning = columns
    return this
  }
  insert(rows) {
    this.op = 'insert'
    this.payload = rows
    return this
  }
  update(patch) {
    this.op = 'update'
    this.payload = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  upsert(rows, { onConflict } = {}) {
    this.op = 'upsert'
    this.payload = rows
    this.onConflict = onConflict || PRIMARY_KEY[this.table] || 'id'
    return this
  }

  eq(col, val) { this.filters.push((r) => r[col] === val); return this }
  neq(col, val) { this.filters.push((r) => r[col] !== val); return this }
  in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this }
  is(col, val) { this.filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return this }
  not(col, op, val) {
    if (op === 'is' && val === null) this.filters.push((r) => r[col] != null)
    return this
  }
  gte(col, val) { this.filters.push((r) => r[col] != null && r[col] >= val); return this }
  lte(col, val) { this.filters.push((r) => r[col] != null && r[col] <= val); return this }
  gt(col, val) { this.filters.push((r) => r[col] != null && r[col] > val); return this }
  lt(col, val) { this.filters.push((r) => r[col] != null && r[col] < val); return this }
  order(col, { ascending = true, nullsFirst } = {}) {
    this.orders.push({ col, ascending, nullsFirst: nullsFirst ?? !ascending })
    return this
  }
  limit(n) { this.limitN = n; return this }
  single() { this.singleMode = 'single'; return this }
  maybeSingle() { this.singleMode = 'maybe'; return this }

  then(resolve, reject) {
    return Promise.resolve()
      .then(() => this.exec())
      .then(resolve, reject)
  }

  rows() {
    if (!this.store[this.table]) this.store[this.table] = []
    return this.store[this.table]
  }

  match(row) {
    return this.filters.every((f) => f(row))
  }

  project(row, columns) {
    if (!columns || columns === '*' || columns === true) return clone(row)
    const out = {}
    for (const c of columns.split(',').map((s) => s.trim()).filter(Boolean)) out[c] = clone(row[c])
    return out
  }

  finish(list, columns) {
    let out = list
    for (const { col, ascending, nullsFirst } of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const va = a[col]
        const vb = b[col]
        if (va == null && vb == null) return 0
        if (va == null) return nullsFirst ? -1 : 1
        if (vb == null) return nullsFirst ? 1 : -1
        const cmp = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb
        return ascending ? cmp : -cmp
      })
    }
    if (this.limitN != null) out = out.slice(0, this.limitN)
    const data = out.map((r) => this.project(r, columns))
    if (this.singleMode) {
      if (data.length === 0) {
        return this.singleMode === 'maybe'
          ? { data: null, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'Nenhum registro encontrado' } }
      }
      return { data: data[0], error: null }
    }
    return { data, error: null }
  }

  newRow(input) {
    const row = { ...DEFAULTS[this.table]?.(), ...clone(input) }
    if (!PRIMARY_KEY[this.table] && row.id == null) {
      row.id = this.table === 'account_snapshots' ? ++this.store.__seq : crypto.randomUUID()
    }
    for (const col of UNIQUE[this.table] || []) {
      if (this.rows().some((r) => r[col] === row[col])) {
        throw { code: '23505', message: `duplicate key value violates unique constraint "${this.table}_${col}_key"` }
      }
    }
    return row
  }

  exec() {
    try {
      const table = this.rows()
      if (this.op === 'select') return this.finish(table.filter((r) => this.match(r)), this.columns)

      if (this.op === 'insert') {
        const inputs = Array.isArray(this.payload) ? this.payload : [this.payload]
        const created = inputs.map((i) => this.newRow(i))
        table.push(...created)
        return this.returning ? this.finish(created, this.returning) : { data: null, error: null }
      }

      if (this.op === 'upsert') {
        const inputs = Array.isArray(this.payload) ? this.payload : [this.payload]
        const out = []
        for (const input of inputs) {
          const existing = table.find((r) => r[this.onConflict] === input[this.onConflict])
          if (existing) {
            Object.assign(existing, clone(input))
            out.push(existing)
          } else {
            const row = this.newRow(input)
            table.push(row)
            out.push(row)
          }
        }
        return this.returning ? this.finish(out, this.returning) : { data: null, error: null }
      }

      if (this.op === 'update') {
        const touched = table.filter((r) => this.match(r))
        for (const r of touched) Object.assign(r, clone(this.payload))
        return this.returning ? this.finish(touched, this.returning) : { data: null, error: null }
      }

      if (this.op === 'delete') {
        const removed = table.filter((r) => this.match(r))
        this.store[this.table] = table.filter((r) => !this.match(r))
        if (this.table === 'clients') {
          const ids = new Set(removed.map((r) => r.id))
          for (const child of CASCADE_FROM_CLIENTS) {
            this.store[child] = (this.store[child] || []).filter((r) => !ids.has(r.client_id))
          }
          // leads.client_id é "on delete set null" no SQL.
          for (const lead of this.store.leads || []) if (ids.has(lead.client_id)) lead.client_id = null
        }
        if (this.table === 'leads') {
          const ids = new Set(removed.map((r) => r.id))
          for (const i of this.store.interactions || []) if (ids.has(i.lead_id)) i.lead_id = null
        }
        return this.returning ? this.finish(removed, this.returning) : { data: null, error: null }
      }
      return { data: null, error: { message: `Operação não suportada: ${this.op}` } }
    } catch (error) {
      return { data: null, error }
    }
  }
}

export function createMemoryDb({ seed = true } = {}) {
  const store = {
    __seq: 0,
    users: [],
    clients: [],
    account_snapshots: [],
    optimizations: [],
    pendencias: [],
    alerts: [],
    app_state: [],
    contacts: [],
    leads: [],
    interactions: [],
  }
  if (seed) {
    const demo = buildDemoData()
    for (const [table, rows] of Object.entries(demo)) {
      for (const row of rows) {
        const q = new Query(store, table)
        store[table].push(q.newRow(row))
      }
    }
  }
  return { from: (table) => new Query(store, table) }
}
