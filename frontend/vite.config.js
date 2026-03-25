import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

const gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
const appVersion = `${pkg.version} (${gitCommit})`

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
})
