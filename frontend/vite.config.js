import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

let gitCommit = 'dev'
try {
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
} catch {
  gitCommit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev'
}
const appVersion = `${pkg.version} (${gitCommit})`

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_HASH__: JSON.stringify(gitCommit),
  },
  plugins: [react()],
})
