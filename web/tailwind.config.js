/** @type {import('tailwindcss').Config} */
// Identidade visual do Sistema Pipe ("Pipe OS"): escuro por padrão, superfícies
// quase pretas com borda fina, vidro discreto, um acento elétrico (violeta-
// índigo) só pra ação e foco, e cor de verdade reservada pra significado
// (verde/âmbar/vermelho de status, azul Meta, laranja Google nos gráficos).
// Referências: Linear e Vercel (contenção, hierarquia por tipografia e
// espaço), dashboards "bento" em vidro. Trocar a identidade = mexer aqui e no
// index.css.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Texto e superfícies do modo claro (azul-marinho da Pipe).
        brand: {
          50: '#f4f6fa',
          100: '#e8ecf3',
          200: '#cdd5e1',
          300: '#a8b4c6',
          400: '#7e8ca3',
          500: '#5b6880',
          600: '#414d63',
          700: '#2a3446',
          800: '#1a2332', // azul-marinho Pipe
          900: '#111827',
          950: '#0a0f17',
        },
        // Neutros frios do modo escuro (substituem o slate padrão em todo o app).
        slate: {
          50: '#f6f7f9',
          100: '#eceff3',
          200: '#dde1e8',
          300: '#bcc3cf',
          400: '#8b94a5',
          500: '#636c7d',
          600: '#454d5b',
          700: '#2a313c',
          800: '#1a1f28',
          900: '#0f1319',
          950: '#090c11',
        },
        // Acento elétrico: ação principal, foco, item ativo, progresso.
        accent: {
          50: '#f3f1ff',
          100: '#e9e5ff',
          200: '#d3ccff',
          300: '#b3a6ff',
          400: '#9483ff',
          500: '#7b66ff',
          600: '#6649f5',
          700: '#5638d8',
          800: '#462eaf',
          900: '#3b2a8a',
        },
        glow: '#22d3ee', // ciano só em brilho decorativo (borda superior, gradiente)
        ink: '#05070a', // fundo do modo escuro
        paper: '#f5f6f8', // fundo do modo claro
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(17, 24, 39, 0.05), 0 1px 3px rgba(17, 24, 39, 0.04)',
        glow: '0 0 0 1px rgba(123, 102, 255, 0.35), 0 8px 30px -8px rgba(123, 102, 255, 0.45)',
        'inner-top': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.85)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'fade-up': 'fade-up 180ms ease-out',
      },
    },
  },
  plugins: [],
}
