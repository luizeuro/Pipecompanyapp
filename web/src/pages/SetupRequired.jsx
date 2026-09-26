// Tela mostrada quando o app está publicado mas o banco ainda não foi ligado
// (variáveis do Supabase faltando) ou as tabelas ainda não foram criadas.
// Em vez de uma tela quebrada, diz exatamente o que falta fazer.
import { Database, RefreshCw } from 'lucide-react'

const STEPS = {
  DB_NOT_CONFIGURED: {
    title: 'Falta conectar o banco de dados',
    steps: [
      'No Supabase, abra Project Settings → API e copie a Project URL e a service_role key.',
      'Na Vercel, abra o projeto → Settings → Environment Variables e crie SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY com esses valores (ou SUPABASE_PUBLISHABLE_KEY + SUPABASE_BACKEND_SECRET, ver README).',
      'Crie também JWT_SECRET, ENCRYPTION_KEY e CRON_SECRET (textos aleatórios; ENCRYPTION_KEY com 64 caracteres hexadecimais).',
      'Em Deployments, clique nos três pontinhos do último deploy → Redeploy. Depois recarregue esta página.',
    ],
  },
  DB_NOT_MIGRATED: {
    title: 'Falta criar as tabelas no Supabase',
    steps: [
      'No Supabase, abra SQL Editor → New query.',
      'Cole o conteúdo de cada arquivo de supabase/migrations (001, depois 002), clicando em Run a cada um.',
      'Recarregue esta página.',
    ],
  },
  DB_SECRET_MISMATCH: {
    title: 'O banco recusou o acesso',
    steps: [
      'O valor de SUPABASE_BACKEND_SECRET na Vercel precisa ser igual ao gravado em private.backend_secret no Supabase.',
      "No Supabase, SQL Editor: insert into private.backend_secret (secret) values ('<valor da Vercel>') on conflict (id) do update set secret = excluded.secret;",
      'Depois recarregue esta página.',
    ],
  },
}

export default function SetupRequired({ code, message }) {
  const info = STEPS[code] || { title: 'Configuração pendente', steps: [message] }
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-brand-100 p-2.5 text-brand-700 dark:bg-slate-800 dark:text-slate-200">
            <Database className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold">{info.title}</h1>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-brand-600 dark:text-slate-300">
          {info.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <button type="button" className="btn-primary mt-6" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" /> Recarregar
        </button>
      </div>
    </div>
  )
}
