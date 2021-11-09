const process = require('process')
const cp = require('child_process')
const path = require('path')

// Set all appropriate variables and check output
test('ensures all runtime variables we need are defined', () => {
  process.env.ACTIONS_RUNTIME_URL = 'my-url'
  process.env.GITHUB_RUN_ID = '123'
  process.env.ACTIONS_RUNTIME_TOKEN = 'a-token'
  process.env.GITHUB_REPOSITORY = 'paper-spa/is-awesome'
  process.env.GITHUB_TOKEN = 'gha-token'
  process.env.GITHUB_SHA = '123abc'
  process.env.GITHUB_ACTOR = 'monalisa'
  process.env.GITHUB_ACTION = '__monalisa/octocat'
  process.env.GITHUB_ACTION_PATH = 'something'

  const ip = path.join(__dirname, './index.js')
  const result = cp.execSync(`node ${ip}`, {env: process.env}).toString()
  console.log(result)
})
