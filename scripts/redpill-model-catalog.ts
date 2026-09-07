#!/usr/bin/env bun
import { fetchRedpillPhalaCatalog } from './lib/redpill-model-catalog.js'

const catalog = await fetchRedpillPhalaCatalog()
process.stdout.write(`${JSON.stringify(catalog)}\n`)
