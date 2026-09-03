import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OUTPUT_DIRECTORY = resolve(process.cwd(), 'research/fingerprints')
const MAX_BODY_BYTES = 40 * 1024 * 1024

const safeName = (value) => String(value || 'fingerprint.json').replace(/[^a-z0-9._-]+/gi, '-')

/**
 * Lets the recorder page write its export straight into research/fingerprints instead
 * of relying on the browser download folder, which is where every manual run
 * quietly went missing.
 */
const saveFingerprintEndpoint = () => ({
  name: 'save-fingerprint',
  configureServer(server) {
    server.middlewares.use('/save-fingerprint', (request, response, next) => {
      if (request.method !== 'POST') return next()

      let body = ''
      let aborted = false

      request.on('data', (chunk) => {
        body += chunk
        if (body.length <= MAX_BODY_BYTES) return
        aborted = true
        response.statusCode = 413
        response.end(JSON.stringify({ ok: false, error: 'report too large' }))
        request.destroy()
      })

      request.on('end', () => {
        if (aborted) return
        response.setHeader('content-type', 'application/json')

        let payload
        try {
          payload = JSON.parse(body)
        } catch (error) {
          response.statusCode = 400
          response.end(JSON.stringify({ ok: false, error: String(error) }))
          return
        }

        const filename = safeName(payload.filename)
        mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
        writeFileSync(join(OUTPUT_DIRECTORY, filename), payload.content)
        response.end(JSON.stringify({ ok: true, path: `research/fingerprints/${filename}` }))
      })
    })
  },
})

export default {
  plugins: [saveFingerprintEndpoint()],
}
