import { handler } from './probe.mjs'
console.log(JSON.stringify(await handler(), null, 2))
