const core = require('@actions/core')
const axios = require('axios')

// All variables we need from the runtime are loaded here
const context = require('./context')

function ensureContext() {
  for (const variable in context) {
    if (context[variable] === undefined) {
      throw new Error(`${variable} is undefined. Cannot continue.`)
    }
  }
  core.debug('all variables are set')
}

async function emitTelemetry(){
  const telemetryUrl = `https://api.github.com/repos/${context.repositoryNwo}/pages/telemetry`
  core.info(`Sending telemetry for run id ${context.workflowRun}`)
  await axios.post(
    telemetryUrl,
    {github_run_id: context.workflowRun},
    {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${context.githubToken}`,
        'Content-type': 'application/json'
      }
    }
  )
}

async function main() {
  try {
    ensureContext()
    await emitTelemetry()
  } catch (error) {
    core.setFailed(error)
  }
}

main()
