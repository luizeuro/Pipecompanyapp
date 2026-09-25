/** @type {import('tailwindcss').Config} */
// Paleta da Pipe Company, tirada da proposta comercial (azul-marinho #1A2332
// e os cinzas-azulados dela). Toda cor de marca do app sai daqui: trocar a
// identidade = mexer só neste arquivo.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f6fa',
          100: '#e6ecf3', // faixa clara / fundo de pílula (TINT da proposta)
          200: '#c7d2df', // texto sobre o marinho (ONDARK)
          300: '#a9b6c6', // decorativo (SOFT)
          400: '#8193aa',
          500: '#5f6e84', // texto corrido (BODY)
          600: '#43536c',
          700: '#26344d', // sidebar no modo escuro
          800: '#1a2332', // azul-marinho principal (NAVY)
          900: '#121a26',
          950: '#0b1119',
        },
        ink: '#07090d', // quase preto: sidebar no modo claro, casa com o fundo do logo
        paper: '#f7f8fa', // quase branco: fundo das páginas no modo claro
      },
      fontFamily: {
        sans: ['Inter', 'Arial', 'Helvetica', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(26, 35, 50, 0.06), 0 1px 3px rgba(26, 35, 50, 0.04)',
      },
    },
  },
  plugins: [],
}
