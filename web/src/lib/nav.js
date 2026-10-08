// Menu do Sistema Pipe, em um lugar só: o menu lateral, a busca rápida (⌘K)
// e o rótulo de seção no topo de cada página leem daqui.
import {
  BarChart3,
  BellRing,
  BookOpen,
  CalendarCheck,
  FileText,
  Gauge,
  ListTodo,
  Settings,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'

export const NAV = [
  { section: 'Operação' },
  { to: '/', label: 'Hoje', icon: CalendarCheck, end: true, badge: 'today' },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/contas', label: 'Contas de anúncio', icon: Gauge },
  { to: '/alertas', label: 'Alertas', icon: BellRing, badge: 'alerts' },
  { to: '/pendencias', label: 'Tarefas', icon: ListTodo, badge: 'pendencias' },
  { to: '/otimizacoes', label: 'Otimizações', icon: Sparkles },
  { section: 'Comercial' },
  { to: '/funil', label: 'Funil comercial', icon: Target },
  { to: '/numeros', label: 'Números', icon: BarChart3 },
  { section: 'Conhecimento' },
  { to: '/relatorios', label: 'Relatórios', icon: FileText },
  { to: '/manual', label: 'Manual da Pipe', icon: BookOpen },
  { section: null },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

// Seção do menu a que uma rota pertence (ex: "/clientes/123" → "Operação").
export function sectionOf(pathname) {
  let section = null
  let best = null
  for (const item of NAV) {
    if (item.section !== undefined) {
      section = item.section
      continue
    }
    const match = item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`)
    if (match && (!best || item.to.length > best.to.length)) best = { ...item, section }
  }
  return best
}
