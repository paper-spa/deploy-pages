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

let requestedDeployment = false

// Ask the runtime for the unsigned artifact URL and deploy to GitHub Pages
// by creating a deployment with that artifact
async function create() {
  try {
    core.info(`Actor: ${context.buildActor}`)
    core.info(`Action ID: ${context.actionsId}`)
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
          Authorization: `Bearer ${context.githubToken}`,
          'Content-type': 'application/json'
        }
      }
    )
    requestedDeployment = true
    core.info(`Created deployment for ${context.buildVersion}`)
    core.info(JSON.stringify(response.data))
  } catch (error) {
    core.info('Failed to create deployment.')
    // Throw the error, so it will skip check deployment status. This error will be caught again in global try catch.
    throw error
  }
}

// Poll the deployment endpoint for status
async function check() {
  try {
    const statusUrl = `https://api.github.com/repos/${context.repositoryNwo}/pages/deployment/status/${process.env['GITHUB_SHA']}`
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
          Authorization: `token ${context.githubToken}`
        }
      })

      if (res.data.status == 'succeed') {
        core.info('Reported success!')
        core.setOutput('status', 'succeed')
        break
      } else if (res.data.status == 'deployment_failed') {

        // Fall into permanent error, it may be caused by ongoing incident or malicious deployment content or exhausted automatic retry times.
        core.info('Deployment failed, please retry later.')
        core.setOutput('status', 'failed')
        break
      } else if (res.data.status == 'deployment_attempt_error') {

        // A temporary error happened, a retry will be scheduled automatically.
        core.info('Deployment temporarily failed, a retry will be automatically scheduled...')
      } else {
        core.info('Current status: ' + res.data.status)
      }

      if (res.status != 200) {
        error_count++
      }

      if (error_count >= error_count_max) {
        core.info('Too many errors, aborting!')
        core.setFailed('Failed with status code: ' + res.status)
        break
      }
    }
    if (tries >= timeout) {
      core.info('Timeout reached, aborting!')
      core.setFailed('Timeout reached, aborting!')
    }
  } catch (error) {
    core.setFailed(error)
  }
}

function ensureContext() {
  for (const variable in context) {
    if (context[variable] === undefined) {
      throw new Error(`${variable} is undefined. Cannot continue.`)
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

async function cancelHandler(evtOrExitCodeOrError) {
  try {
    if (requestedDeployment) {
      const pagesCancelDeployEndpoint = `https://api.github.com/repos/${context.repositoryNwo}/pages/deployment/cancel/${context.buildVersion}`
      await axios.put(
        pagesCancelDeployEndpoint, {},
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${context.githubToken}`,
            'Content-type': 'application/json'
          }
        }
      )
      core.info(`canceled ongoing deployment thru ${pagesCancelDeployEndpoint}`)
    }
  } catch (e) {
    console.info('cancel deployment errored', e)
  }
  process.exit(isNaN(+evtOrExitCodeOrError) ? 1 : +evtOrExitCodeOrError)
}

[
  'SIGINT',  'SIGTERM',
].forEach(evt => process.on(evt, cancelHandler))

main()
