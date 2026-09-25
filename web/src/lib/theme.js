// Tema claro/escuro. A escolha fica no navegador; sem escolha, segue o sistema.
// O index.html aplica o tema antes do React carregar, pra não piscar.

export function currentTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function setTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('pc-theme', theme)
  } catch {
    /* sem storage: vale só até recarregar */
  }
}
