const core = require('@actions/core')
const axios = require('axios')
const axiosRetry = require('axios-retry')
const retryAttempt = 3

axiosRetry(axios, {
  retries: retryAttempt,
  retryDelay: (retryCount) => {
    core.info(`retrying to send pages telemetry with attempt: ${retryCount}`)
    return retryCount * 1000 // time interval between retries, with 1s, 2s, 3s
  },

  // retry on error greater than 500
  retryCondition: (error) => {
    return error.response.status >= 500
  },
})

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
  ).catch((err) => {
    if (err.response.status !== 200) {
      throw new Error(`failed to emit metric with status code: ${err.response.status} after ${retryAttempt} retry attempts`)
    }
  })
}

async function main() {
  try {
    ensureContext()
    await emitTelemetry()
  } catch (error) {
    core.error("failed to emit pages build telemetry")
  }
}

main()
