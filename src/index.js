// This package assumes a site has already been built and the files exist in the current workspace
// If there's an artifact named `artifact.tar`, it can upload that to actions on its own,
// without the user having to do the tar process themselves.

const core = require('@actions/core')
// const github = require('@actions/github'); // TODO: Not used until we publish API endpoint to the @action/github package
const axios = require('axios')

// All variables we need from the runtime are loaded here
const context = require('./context')

// TODO: If the artifact hasn't been created, we can create it and upload to artifact storage ourselves
// const tar = require('tar')

// Ask the runtime for the unsigned artifact URL and deploy to GitHub Pages
// by creating a deployment with that artifact
async function create() {
  try {
    core.info(`Actor: ${context.buildActor}`)
    core.info(`Action ID: ${context.actionsId}`)
    core.info(`Action path: ${context.actionsPath}`)
    const inputToken = core.getInput('token')
    const pagesDeployEndpoint = `https://api.github.com/repos/${context.repositoryNwo}/pages/deployment`
    const artifactExgUrl = `${context.runTimeUrl}_apis/pipelines/workflows/${context.workflowRun}/artifacts?api-version=6.0-preview`
    core.info(`Artifact URL: ${artifactExgUrl}`)
    const {data} = await axios.get(artifactExgUrl, {
      headers: {
        Authorization: `Bearer ${context.runTimeToken}`,
        'Content-Type': 'application/json'
      }
    })
    core.info(JSON.stringify(data))
    const artifactUrl = `${data.value[0].url}&%24expand=SignedContent`
    const response = await axios.post(
      pagesDeployEndpoint,
      {artifact_url: artifactUrl, pages_build_version: context.buildVersion},
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${inputToken}`,
          'Content-type': 'application/json'
        }
      }
    )
    core.info(`Created deployment for ${context.buildVersion}`)
    core.info(JSON.stringify(response.data))
  } catch (error) {
    core.info('Failed to create deployment.')
    core.setFailed(error)
  }
}

// Poll the deployment endpoint for status
async function check() {
  try {
    const api_token = core.getInput('token')
    const statusUrl = `https://api.github.com/repos/${process.env['GITHUB_REPOSITORY']}/pages/deployment/status/${process.env['GITHUB_SHA']}`
    const timeout = core.getInput('timeout')
    const timeout_duration = core.getInput('timeout_duration')
    const error_count_max = core.getInput('error_count')
    var tries = 0
    var error_count = 0
    while (tries < timeout) {
      tries++
      await new Promise(r => setTimeout(r, timeout_duration))
      var res = await axios.get(statusUrl, {
        headers: {
          Authorization: `token ${api_token}`
        }
      })

      if (res.data.status == 'succeed') {
        console.log('Reported success!')
        core.setOutput('status', 'succeed')
        break
      } else {
        console.log('Current status: ' + res.data.status)
      }

      if (res.status != 200) {
        error_count++
      }

      if (error_count >= error_count_max) {
        console.log('Too many errors, aborting!')
        core.setFailed('Failed with status code: ' + res.status)
        break
      }
    }
    if (tries >= timeout) {
      console.log('Timeout reached, aborting!')
      core.setFailed('Timeout reached, aborting!')
    }
  } catch (error) {
    core.setFailed(error)
  }
}

function ensureContext() {
  for (const variable in context) {
    if (context[variable] === undefined) {
      return core.setFailed(`${variable} is undefined. Cannot continue.`)
    }
  }
  core.debug('all variables are set')
}
async function main() {
  try {
    ensureContext()
    await create()
    await check()
  } catch (error) {
    core.setFailed(error)
  }
}

main().then(() => {
  core.info('Run completed')
})
