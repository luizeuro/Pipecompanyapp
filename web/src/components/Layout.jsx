// Estrutura das telas logadas: menu lateral + área de conteúdo.
// Menu: fundo `ink` (quase preto, igual ao fundo do logo) no modo claro; no
// escuro vira `brand-700` (marinho), com item ativo em black/25 — a cor de
// destaque do modo claro não teria contraste sobre o marinho.
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  BellRing,
  CalendarCheck,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Target,
  Users,
  X,
} from 'lucide-react'
import { useData } from '../lib/data.jsx'
import { currentTheme, setTheme } from '../lib/theme.js'
import { cx } from './ui.jsx'

// Menu em dois blocos: o CRM (relacionamento e comercial) e o tráfego
// (contas de anúncio). Configurações fica sozinha no fim.
const NAV = [
  { section: 'CRM' },
  { to: '/', label: 'Hoje', icon: CalendarCheck, end: true, badge: 'today' },
  { to: '/funil', label: 'Funil comercial', icon: Target },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/relatorios', label: 'Relatórios', icon: FileText },
  { to: '/numeros', label: 'Números', icon: BarChart3 },
  { section: 'Tráfego' },
  { to: '/contas', label: 'Contas de anúncio', icon: LayoutDashboard },
  { to: '/otimizacoes', label: 'Otimizações', icon: Sparkles },
  { to: '/pendencias', label: 'Pendências', icon: ListTodo, badge: 'pendencias' },
  { to: '/alertas', label: 'Alertas', icon: BellRing, badge: 'alerts' },
  { section: null },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

function Logo({ compact }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/pipe-logo.png" alt="Pipe Company" className={cx('logo-screen shrink-0', compact ? 'h-9 w-9' : 'h-12 w-12')} />
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-bold tracking-wide text-white">PIPE COMPANY</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300 dark:text-brand-200">
          CRM · Monitor
        </div>
      </div>
    </div>
  )
}

function NavItems({ badges, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ section, to, label, icon: Icon, end, badge }, i) =>
        section !== undefined ? (
          <div
            key={`s-${i}`}
            className={cx(
              'px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-400 dark:text-brand-200/70',
              i > 0 && 'mt-4',
              !section && 'mt-2 border-t border-white/10 pt-2 dark:border-black/20',
            )}
          >
            {section}
          </div>
        ) : (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-brand-800 text-white shadow-sm dark:bg-black/25'
                : 'text-brand-200 hover:bg-white/5 hover:text-white dark:text-brand-100 dark:hover:bg-black/15',
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{label}</span>
          {badge && badges[badge]?.count > 0 && (
            <span
              className={cx(
                'tabular rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none',
                badges[badge].urgent ? 'bg-rose-500 text-white' : 'bg-white/15 text-white',
              )}
            >
              {badges[badge].count}
            </span>
          )}
        </NavLink>
        ),
      )}
    </nav>
  )
}

function SidebarFooter({ user, onLogout }) {
  const [theme, setThemeState] = useState(currentTheme)
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }
  return (
    <div className="border-t border-white/10 pt-4 dark:border-black/20">
      <div className="mb-3 flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
          {user.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{user.name}</div>
          <div className="truncate text-xs text-brand-300 dark:text-brand-200">
            {user.role === 'admin' ? 'Administrador' : 'Equipe'}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-white/5 hover:text-white dark:text-brand-100 dark:hover:bg-black/15"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-white/5 hover:text-white dark:text-brand-100 dark:hover:bg-black/15"
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  )
}

export default function Layout({ user, onLogout, children }) {
  const { alerts, clients, today, todayDueCount } = useData()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Ao trocar de página: fecha o menu do celular e volta pro topo (o React
  // Router mantém a rolagem da página anterior se ninguém mandar voltar).
  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  const overdue = clients.reduce((s, c) => s + (c.overdue_pendencias_count || 0), 0)
  // "Hoje" fica vermelho quando há algo atrasado (não só vencendo hoje).
  const hasOverdue = Boolean(
    today &&
      (today.followups.some((f) => f.next_step_at < today.today) ||
        today.leads.some((l) => l.next_step_at && l.next_step_at < today.today) ||
        today.pendencias.some((p) => p.due_date < today.today)),
  )
  const badges = {
    today: { count: todayDueCount, urgent: hasOverdue },
    alerts: { count: alerts.length, urgent: alerts.some((a) => a.severity === 'critical') },
    pendencias: { count: clients.reduce((s, c) => s + (c.open_pendencias_count || 0), 0), urgent: overdue > 0 },
  }

  const sidebarClasses = 'flex h-full flex-col gap-6 bg-ink px-4 py-5 dark:bg-brand-700'

  return (
    <div className="min-h-screen">
      {/* Menu fixo (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <div className={sidebarClasses}>
          <Logo />
          <div className="flex-1 overflow-y-auto">
            <NavItems badges={badges} />
          </div>
          <SidebarFooter user={user} onLogout={onLogout} />
        </div>
      </aside>

      {/* Barra superior + gaveta (celular/tablet) */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-2.5 dark:bg-brand-700 lg:hidden">
        <Logo compact />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="relative rounded-lg p-2 text-white hover:bg-white/10"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
          {badges.alerts.count > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
        </button>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <div className={sidebarClasses}>
              <div className="flex items-start justify-between">
                <Logo />
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-white hover:bg-white/10"
                  aria-label="Fechar menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavItems badges={badges} onNavigate={() => setMobileOpen(false)} />
              </div>
              <SidebarFooter user={user} onLogout={onLogout} />
            </div>
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  )
}
