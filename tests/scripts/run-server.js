import { gunzipSync } from 'node:zlib'
import { Buffer } from 'node:buffer'

import express from 'express'

import { DataPointStore } from './data-point-store.js'

const app = express()
const port = 9191

const dataPointStore = new DataPointStore()

app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.get('/', (request, response) => {
  response.send('Test server for rex-content-processing-redaction-url.')
})

app.get('/pages/:name', (request, response) => {
  response.send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test page</title></head><body><p>Test page</p></body></html>')
})

app.post('/data/add-bundle.json', (request, response) => {
  const compressed = Buffer.from(request.body.payload, 'base64')
  const points = JSON.parse(gunzipSync(compressed).toString())

  dataPointStore.recordPoints(points)

  response.json({ added: points.length })
})

app.get('/data/points.json', (request, response) => {
  response.json({ count: dataPointStore.size, points: dataPointStore.points })
})

app.delete('/data/points.json', (request, response) => {
  const cleared = dataPointStore.size

  dataPointStore.clear()

  response.json({ cleared })
})

app.listen(port, () => {
  console.log(`Server running on port ${port}...`)
})
