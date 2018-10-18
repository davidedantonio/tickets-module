'use strict'

const Fastify = require('fastify')
const Tickets = require('.')

const fp = require('fastify-plugin')
const clean = require('mongo-clean')
const { MongoClient } = require('mongodb')
const { beforeEach, tearDown, test } = require('tap')
const url = 'mongodb://localhost:27017'
const database = 'tests'

let client

beforeEach(async function () {
  if (!client) {
    client = await MongoClient.connect(url, {
      w: 1,
      useNewUrlParser: true
    })
  }
  await clean(client.db(database))
})

tearDown(async function () {
  if (client) {
    await client.close()
    client = null
  }
})

// Fill in this config with all the configurations
// needed for testing the application
function config () {
  return {
    auth: {
      secret: 'averyverylongsecret'
    },
    mongodb: {
      client,
      database
    }
  }
}

// automatically build and tear down our instance
function build (t) {
  const app = Fastify()

  // we wrap with fastify-plugin to access jwt signing
  app.register(fp(Tickets), config())

  // tear down our app after we are done
  t.tearDown(app.close.bind(app))

  return app
}

async function createUser (t, app, { username }) {
  // we await for ready() so that app.jwt is there
  await app.ready()
  return app.jwt.sign({ username })
}

function testWithLogin (name, fn) {
  test(name, async (t) => {
    const app = build(t)

    const token = await createUser(t, app, {
      username: 'matteo'
    })

    function inject (opts) {
      opts = opts || {}
      opts.headers = opts.headers || {}
      opts.headers.authorization = `Bearer ${token}`

      return app.inject(opts)
    }

    return fn(t, inject)
  })
}

test('cannot create a ticket without a login', async (t) => {
  const app = build(t)

  const res = await app.inject({
    method: 'POST',
    url: '/',
    body: {
      title: 'A support ticket',
      body: 'this is a long body'
    }
  })

  t.equal(res.statusCode, 401)
})

test('cannot get all tickets without a login', async (t) => {
  const app = build(t)

  const res = await app.inject({
    method: 'GET',
    url: '/'
  })

  t.equal(res.statusCode, 401)
})

testWithLogin('do not create a ticket without a title', async (t, inject) => {
  const res1 = await inject({
    method: 'POST',
    url: '/',
    body: {
      body: 'this is a long body'
    }
  })

  t.equal(res1.statusCode, 400)
  t.equal(JSON.parse(res1.body).message, 'body should have required property \'title\'')
})

testWithLogin('do not create a ticket without a body', async (t, inject) => {
  const res1 = await inject({
    method: 'POST',
    url: '/',
    body: {
      title: 'A support ticket'
    }
  })

  t.equal(res1.statusCode, 400)
  t.equal(JSON.parse(res1.body).message, 'body should have required property \'body\'')
})