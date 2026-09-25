// Servidor de desenvolvimento: sobe a mesma API da Vercel numa porta local.
// O Vite (web/) repassa /api para cá (ver web/vite.config.js).
import app from '../api/index.js'

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`[dev] API em http://localhost:${port}`)
})
