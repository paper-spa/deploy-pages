const core = require('@actions/core')
const process = require('process')
const cp = require('child_process')
const path = require('path')
const nock = require('nock')
const axios = require('axios')

const {expect, jest} = require('@jest/globals')

const {Deployment} = require('./index')

describe('with all environment variables set', () => {
  beforeEach(() => {
    process.env.ACTIONS_RUNTIME_URL = 'my-url'
    process.env.GITHUB_RUN_ID = '123'
    process.env.ACTIONS_RUNTIME_TOKEN = 'a-token'
    process.env.GITHUB_REPOSITORY = 'paper-spa/is-awesome'
    process.env.GITHUB_TOKEN = 'gha-token'
    process.env.GITHUB_SHA = '123abc'
    process.env.GITHUB_ACTOR = 'monalisa'
    process.env.GITHUB_ACTION = '__monalisa/octocat'
    process.env.GITHUB_ACTION_PATH = 'something'
  })

  it('Executes cleanly', done => {
    const ip = path.join(__dirname, './index.js')
    cp.exec(`node ${ip}`, {env: process.env}, (err, stdout) => {
      expect(stdout).toMatch(/::debug::all variables are set/)
      done()
    })
  })
})

describe('with variables missing', () => {
  it('execution fails if there are missing variables', done => {
    delete process.env.ACTIONS_RUNTIME_URL
    const ip = path.join(__dirname, './index.js')
    cp.exec(`node ${ip}`, {env: process.env}, (err, stderr) => {
      expect(stderr).toMatch(/undefined. Cannot continue/)
      expect(err).toBeTruthy()
      expect(err.code).toBe(1)
      done()
    })
  })
})

describe('create', () => {
  beforeAll(() => {
    process.env.ACTIONS_RUNTIME_URL = 'http://my-url/'
    process.env.GITHUB_RUN_ID = '123'
    process.env.ACTIONS_RUNTIME_TOKEN = 'a-token'
    process.env.GITHUB_REPOSITORY = 'paper-spa/is-awesome'
    process.env.GITHUB_TOKEN = 'gha-token'
    process.env.GITHUB_SHA = '123abc'
    process.env.GITHUB_ACTOR = 'monalisa'
    process.env.GITHUB_ACTION = '__monalisa/octocat'
    process.env.GITHUB_ACTION_PATH = 'something'

    jest.spyOn(core, 'setOutput').mockImplementation(param => {
      return param
    })

    jest.spyOn(core, 'setFailed').mockImplementation(param => {
      return param
    })
    // Mock error/warning/info/debug
    jest.spyOn(core, 'error').mockImplementation(jest.fn())
    jest.spyOn(core, 'warning').mockImplementation(jest.fn())
    jest.spyOn(core, 'info').mockImplementation(jest.fn())
    jest.spyOn(core, 'debug').mockImplementation(jest.fn())
  })

  it('can successfully create a deployment', async () => {
    process.env.GITHUB_SHA = 'valid-build-version'
    const scope = nock(`http://my-url`)
      .get('/_apis/pipelines/workflows/123/artifacts?api-version=6.0-preview')
      .reply(200, {value: [{url: 'https://fake-artifact.com'}]})

    axios.post = jest.fn().mockResolvedValue('test')

    // Create the deployment
    const deployment = new Deployment()
    await deployment.create()

    expect(axios.post).toBeCalledWith(
      'https://api.github.com/repos/paper-spa/is-awesome/pages/deployment',
      {
        artifact_url: 'https://fake-artifact.com&%24expand=SignedContent',
        pages_build_version: 'valid-build-version'
      },
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: 'Bearer ',
          'Content-type': 'application/json'
        }
      }
    )

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      'Created deployment for valid-build-version'
    )

    scope.done()
  })

  it('Reports errors with failed deployments', async () => {
    process.env.GITHUB_SHA = 'invalid-build-version'
    const scope = nock(`http://my-url`)
      .get('/_apis/pipelines/workflows/123/artifacts?api-version=6.0-preview')
      .reply(200, {value: [{url: 'https://invalid-artifact.com'}]})

    axios.post = jest.fn().mockRejectedValue({
      status: 400
    })

    // Create the deployment
    const deployment = new Deployment()
    try {
      deployment.create()
    } catch(err) {

      expect(axios.post).toBeCalledWith(
        'https://api.github.com/repos/paper-spa/is-awesome/pages/deployment',
        {
          artifact_url: 'https://invalid-artifact.com&%24expand=SignedContent',
          pages_build_version: 'invalid-build-version'
        },
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: 'Bearer ',
            'Content-type': 'application/json'
          }
        }
      )

      expect(core.info).toHaveBeenLastCalledWith(
        'Failed to create deployment for invalid-build-version.'
      )
      expect(core.setFailed).toHaveBeenCalledWith({status: 400})

      scope.done()
    }
  })

})

describe('check', () => {
  beforeAll(() => {
    process.env.ACTIONS_RUNTIME_URL = 'http://my-url/'
    process.env.GITHUB_RUN_ID = '123'
    process.env.ACTIONS_RUNTIME_TOKEN = 'a-token'
    process.env.GITHUB_REPOSITORY = 'paper-spa/is-awesome'
    process.env.GITHUB_TOKEN = 'gha-token'
    process.env.GITHUB_SHA = '123abc'
    process.env.GITHUB_ACTOR = 'monalisa'
    process.env.GITHUB_ACTION = '__monalisa/octocat'
    process.env.GITHUB_ACTION_PATH = 'something'

    jest.spyOn(core, 'setOutput').mockImplementation(param => {
      return param
    })

    jest.spyOn(core, 'setFailed').mockImplementation(param => {
      return param
    })
    // Mock error/warning/info/debug
    jest.spyOn(core, 'error').mockImplementation(jest.fn())
    jest.spyOn(core, 'warning').mockImplementation(jest.fn())
    jest.spyOn(core, 'info').mockImplementation(jest.fn())
    jest.spyOn(core, 'debug').mockImplementation(jest.fn())
  })

  it('sets output to success when deployment is succeessful', async () => {
    process.env.GITHUB_SHA = 'valid-build-version'
    let repositoryNwo = process.env.GITHUB_REPOSITORY
    let buildVersion = process.env.GITHUB_SHA

    // mock a successful call to create a deployment
    axios.post = jest.fn().mockResolvedValue({status: 200})

    // mock a completed deployment with status = 'succeed'
    axios.get = jest.fn().mockResolvedValue({
      status: 200,
      data: {
        status: 'succeed'
      }
    })

    // Create the deployment
    const deployment = new Deployment()

    core.getInput = jest.fn('timeout').mockReturnValue(60)
    jest.spyOn(core, 'getInput')
    await deployment.check()

    expect(axios.get).toBeCalledWith(
      `https://api.github.com/repos/${repositoryNwo}/pages/deployment/status/${buildVersion}`,
      {
        headers: {
          Authorization: 'token '
        }
      }
    )

    expect(core.setOutput).toBeCalledWith('status', 'succeed')

    expect(core.info).toHaveBeenCalledWith('Reported success!')
  })
})
