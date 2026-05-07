import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename } from 'node:path'

const projectName = basename(process.cwd())
const port = 5173 + (createHash('sha256').update(projectName).digest().readUInt16BE(0) % 100)

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  let commitSha = 'dev'
  if (command === 'build') {
    try {
      commitSha = execSync('git rev-parse HEAD').toString().trim()
    } catch {
      commitSha = 'unknown'
    }
  }
  return {
    plugins: [react()],
    server: { port, strictPort: true },
    define: {
      'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha),
    },
  }
})
