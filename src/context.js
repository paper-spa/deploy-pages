const core = require('@actions/core')
const fs = require('fs')

// Load variables from Actions runtime
function getRequiredVars() {
  const { ref, sha } = getRefAndSha() || {}

  const context = {
    runTimeUrl: process.env.ACTIONS_RUNTIME_URL,
    workflowRun: process.env.GITHUB_RUN_ID,
    runTimeToken: process.env.ACTIONS_RUNTIME_TOKEN,
    repositoryNwo: process.env.GITHUB_REPOSITORY,
    buildVersion: sha,
    ref,
    buildActor: process.env.GITHUB_ACTOR,
    actionsId: process.env.GITHUB_ACTION,
    githubToken: core.getInput('token'),
    isPreview: core.getInput('preview') === 'true'
  }

  return context
}

// Apply some smart default values
function getRefAndSha() {
  // Start with workflow-provided override values
  const userRef = core.getInput('ref')
  const userSha = core.getInput('build_version')

  // Prefer user inputs, if provided
  if (userRef && userSha) {
    return {
      // SECURITY CONCERN: What if the Actions workflow is written in a naïve way that allows this
      // user input of the `ref` value to override a different deployment accidentally/maliciously?
      ref: userRef,
      sha: userSha
    }
  }

  const {
    GITHUB_EVENT_NAME,
    GITHUB_REPOSITORY_OWNER,
    GITHUB_REF,
    GITHUB_SHA,
    GITHUB_EVENT_PATH
  } = process.env

  // Prefer Actions workflow run REF and SHA values for all events other than "pull_request_target"
  const isPullRequestTargetEvent = GITHUB_EVENT_NAME === 'pull_request_target'
  if (!isPullRequestTargetEvent) {
    return {
      ref: `${GITHUB_REPOSITORY_OWNER}:${GITHUB_REF}`,
      sha: GITHUB_SHA
    }
  }

  // If "pull_request_target" event, we need to adjust so we aren't using the base branch values
  let event
  try {
    if (GITHUB_EVENT_PATH) {
      event = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, { encoding: 'utf8' }))
    }
  } catch (error) {
    core.warning(`Failed to read event data file: ${error}`)
  }

  if (!event) {
    throw new Error('Could not load the event data')
  }

  const {
    repo: { owner: { login: headOwner } },
    ref: headRefName,
    sha: headSha
  } = event.pull_request.head

  return {
    // Use head-focused format to better support PRs from forked repos
    ref: (headOwner && headRefName) ? `${headOwner}:refs/heads/${headRefName}` : undefined,
    sha: headSha
  }
}

module.exports = function getContext() {
  const requiredVars = getRequiredVars()
  for (const variable in requiredVars) {
    if (requiredVars[variable] === undefined) {
      throw new Error(`${variable} is undefined. Cannot continue.`)
    }
  }
  core.debug('all variables are set')
  return requiredVars
}
