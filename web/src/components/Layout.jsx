// Estrutura das telas logadas do Sistema Pipe: menu lateral escuro (nos dois
// temas, casa com o logo branco) + área de conteúdo. O menu segue a operação
// da agência: Operação (o dia a dia), Comercial e Conhecimento (relatórios e
// o Manual da Pipe, que é o onboarding de quem entra na equipe).
import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react'
import { useData } from '../lib/data.jsx'
import { NAV } from '../lib/nav.js'
import { timeAgo } from '../lib/format.js'
import { currentTheme, setTheme } from '../lib/theme.js'
import CommandPalette from './CommandPalette.jsx'
import { cx } from './ui.jsx'


const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function Logo({ compact }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/pipe-logo.png" alt="Pipe Company" className={cx('logo-screen shrink-0', compact ? 'h-8 w-8' : 'h-10 w-10')} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.08em] text-white">
          SISTEMA PIPE
          <span className="rounded border border-accent-400/40 bg-accent-500/15 px-1 font-mono text-[9px] font-medium tracking-wider text-accent-200">
            OS
          </span>
        </div>
        <div className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">operação · crm</div>
      </div>
    </div>
  )
}

function SearchButton({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left text-sm text-slate-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-slate-200"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="flex-1">Buscar…</span>
      <span className="flex gap-0.5">
        <kbd className="kbd !border-white/15 !bg-white/[0.04]">{isMac ? '⌘' : 'Ctrl'}</kbd>
        <kbd className="kbd !border-white/15 !bg-white/[0.04]">K</kbd>
      </span>
    </button>
  )
}

function NavItems({ badges, onNavigate }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ section, to, label, icon: Icon, end, badge }, i) =>
        section !== undefined ? (
          <div
            key={`s-${i}`}
            className={cx('eyebrow px-3 !text-slate-500', i > 0 && 'mt-5', !section && 'mt-3 border-t border-white/[0.06] pt-3')}
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
                'group relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition',
                isActive ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-gradient-to-b from-accent-400 to-glow" aria-hidden="true" />
                )}
                <Icon className={cx('h-4 w-4 shrink-0', isActive ? 'text-accent-300' : 'text-slate-500 group-hover:text-slate-300')} aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {badge && badges[badge]?.count > 0 && (
                  <span
                    className={cx(
                      'tabular rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold leading-none',
                      badges[badge].urgent ? 'bg-rose-500/90 text-white' : 'bg-white/10 text-slate-200',
                    )}
                  >
                    {badges[badge].count}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ),
      )}
    </nav>
  )
}

// Linha de "sistema vivo": quando foi a última verificação das contas.
function MonitorStatus({ lastCheck }) {
  const at = lastCheck?.at
  const fresh = at && Date.now() - new Date(at).getTime() < 26 * 3600 * 1000
  return (
    <div className="flex items-center gap-2 px-1 font-mono text-[10.5px] text-slate-500">
      <span className={cx('h-1.5 w-1.5 rounded-full', fresh ? 'animate-pulse-dot bg-emerald-400' : 'bg-amber-400')} aria-hidden="true" />
      <span className="truncate">{at ? `monitor · verificado ${timeAgo(at)}` : 'monitor · aguardando 1ª verificação'}</span>
    </div>
  )
}

function SidebarFooter({ user, onLogout, lastCheck }) {
  const [theme, setThemeState] = useState(currentTheme)
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }
  return (
    <div className="space-y-3 border-t border-white/[0.06] pt-3">
      <MonitorStatus lastCheck={lastCheck} />
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-glow/80 text-sm font-semibold text-white">
          {user.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{user.name}</div>
          <div className="truncate font-mono text-[10.5px] uppercase tracking-wider text-slate-500">
            {user.role === 'admin' ? 'admin' : 'equipe'}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
          title="Sair"
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function Layout({ user, onLogout, children }) {
  const { alerts, clients, today, todayDueCount, lastCheck } = useData()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  const pages = useMemo(() => NAV.filter((n) => n.to), [])

  // Ao trocar de página: fecha o menu do celular e volta pro topo.
  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  // ⌘K / Ctrl+K abre a busca de qualquer tela.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const overdue = clients.reduce((s, c) => s + (c.overdue_pendencias_count || 0), 0)
  // "Hoje" fica vermelho quando há algo atrasado (não só vencendo hoje).
  const hasOverdue = Boolean(
    today &&
      (today.followups.some((f) => f.next_step_at < today.today) ||
        today.leads.some((l) => l.next_step_at && l.next_step_at < today.today) ||
        today.pendencias.some((p) => p.due_date < today.today) ||
        (today.rotinas || []).some((r) => r.date < today.today)),
  )
  const badges = {
    today: { count: todayDueCount, urgent: hasOverdue },
    alerts: { count: alerts.length, urgent: alerts.some((a) => a.severity === 'critical') },
    pendencias: { count: clients.reduce((s, c) => s + (c.open_pendencias_count || 0), 0), urgent: overdue > 0 },
  }

  const sidebar = (onNavigate, closeButton) => (
    <div className="flex h-full flex-col gap-5 border-r border-white/[0.06] bg-ink/95 px-3 py-5 backdrop-blur-xl">
      <div className="flex items-start justify-between px-1">
        <Logo />
        {closeButton}
      </div>
      <SearchButton onOpen={() => setPaletteOpen(true)} />
      <div className="scroll-thin -mx-1 flex-1 overflow-y-auto px-1">
        <NavItems badges={badges} onNavigate={onNavigate} />
      </div>
      <SidebarFooter user={user} onLogout={onLogout} lastCheck={lastCheck} />
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Menu fixo (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar()}</aside>

      {/* Barra superior + gaveta (celular/tablet) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-ink/90 px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <Logo compact />
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPaletteOpen(true)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Buscar">
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="relative rounded-lg p-2 text-white hover:bg-white/10"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
            {badges.alerts.count > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
          </button>
        </div>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            {sidebar(
              () => setMobileOpen(false),
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-white hover:bg-white/10"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>,
            )}
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={pages} />
    </div>
  )
}
