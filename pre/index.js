require('./sourcemap-register.js');/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 660:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(105)

// Load variables from Actions runtime
const getRequiredVars = () => {
  return {
    runTimeUrl: process.env.ACTIONS_RUNTIME_URL,
    workflowRun: process.env.GITHUB_RUN_ID,
    runTimeToken: process.env.ACTIONS_RUNTIME_TOKEN,
    repositoryNwo: process.env.GITHUB_REPOSITORY,
    buildVersion: process.env.GITHUB_SHA,
    buildActor: process.env.GITHUB_ACTOR,
    actionsId: process.env.GITHUB_ACTION,
    githubToken: core.getInput('token')
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


/***/ }),

/***/ 96:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

__nccwpck_require__(996)

// This package assumes a site has already been built and the files exist in the current workspace
// If there's an artifact named `artifact.tar`, it can upload that to actions on its own,
// without the user having to do the tar process themselves.

const core = __nccwpck_require__(105)
// const github = require('@actions/github'); // TODO: Not used until we publish API endpoint to the @action/github package
const axios = __nccwpck_require__(512)

// All variables we need from the runtime are loaded here
const getContext = __nccwpck_require__(660)

// TODO: If the artifact hasn't been created, we can create it and upload to artifact storage ourselves
// const tar = require('tar')
let requestedDeployment = false
class Deployment {
  constructor() {
    const context = getContext()
    this.runTimeUrl = context.runTimeUrl
    this.repositoryNwo = context.repositoryNwo
    this.runTimeToken = context.runTimeToken
    this.buildVersion = context.buildVersion
    this.buildActor = context.buildActor
    this.actionsId = context.workflowRun
    this.githubToken = context.githubToken
    this.workflowRun = context.workflowRun
  }

  // Ask the runtime for the unsigned artifact URL and deploy to GitHub Pages
  // by creating a deployment with that artifact
  async create(idToken) {
    try {
      core.info(`Actor: ${this.buildActor}`)
      core.info(`Action ID: ${this.actionsId}`)
      const pagesDeployEndpoint = `https://api.github.com/repos/${this.repositoryNwo}/pages/deployment`
      const artifactExgUrl = `${this.runTimeUrl}_apis/pipelines/workflows/${this.workflowRun}/artifacts?api-version=6.0-preview`
      const statusUrl = `https://api.github.com/repos/${this.repositoryNwo}/pages/deployment/status/${process.env['GITHUB_SHA']}`
      core.info(`Artifact URL: ${artifactExgUrl}`)


      var cancelled = await axios.get(statusUrl, {
        headers: {
          Authorization: `token ${this.githubToken}`
        }
      })

      if (cancelled.data.status == 'deployment_cancelled') {
        throw new Error('Deployment cancelled. (Probably because of a newer run)')
      }


      const { data } = await axios.get(artifactExgUrl, {
        headers: {
          Authorization: `Bearer ${this.runTimeToken}`,
          'Content-Type': 'application/json'
        }
      })
      core.info(JSON.stringify(data))
      if (data.value.length == 0) {
        throw new Error('No uploaded artifact was found!')
      }
      const artifactUrl = `${data.value[0].url}&%24expand=SignedContent`
      const payload = {
        artifact_url: artifactUrl,
        pages_build_version: this.buildVersion,
        oidc_token: idToken
      }
      core.info(`Creating deployment with payload:\n${JSON.stringify(payload, null, '\t')}`)
      const response = await axios.post(pagesDeployEndpoint, payload, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${this.githubToken}`,
          'Content-type': 'application/json'
        }
      })
      requestedDeployment = true
      core.info(`Created deployment for ${this.buildVersion}`)
      core.info(JSON.stringify(response.data))
    } catch (error) {
      core.info(`Failed to create deployment for ${this.buildVersion}.`)
      throw error
    }
  }

  // Poll the deployment endpoint for status
  async check() {
    try {
      const statusUrl = `https://api.github.com/repos/${this.repositoryNwo}/pages/deployment/status/${process.env['GITHUB_SHA']}`
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
            Authorization: `token ${this.githubToken}`
          }
        })

        if (res.data.status == 'succeed') {
          core.info('Reported success!')
          core.setOutput('status', 'succeed')
          break
        } else if (res.data.status == 'deployment_failed') {
          // Fall into permanent error, it may be caused by ongoing incident or malicious deployment content or exhausted automatic retry times.
          core.info('Deployment failed, try again later.')
          core.setOutput('status', 'failed')
          break
        } else if (res.data.status == 'deployment_attempt_error') {
          // A temporary error happened, a retry will be scheduled automatically.
          core.info(
            'Deployment temporarily failed, a retry will be automatically scheduled...'
          )
        } else if (res.data.status == 'deployment_cancelled') {
          core.info('Deployment cancelled. (Probably from another run)')
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
}

async function cancelHandler(evtOrExitCodeOrError) {
  try {
    if (requestedDeployment) {
      const pagesCancelDeployEndpoint = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/pages/deployment/cancel/${process.env.GITHUB_SHA}`
      await axios.put(
        pagesCancelDeployEndpoint,
        {},
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
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

async function main() {
  try {
    const deployment = new Deployment()
    const idToken = await core.getIDToken()
    await deployment.create(idToken)
    await deployment.check()
  } catch (error) {
    core.setFailed(error)
  }
}

process.on('SIGINT', cancelHandler)

process.on('SIGTERM', cancelHandler)

main()

module.exports = { Deployment }


/***/ }),

/***/ 683:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(105)
const axios = __nccwpck_require__(512)
const axiosRetry = __nccwpck_require__(736)
const retryAttempt = 3

axiosRetry(axios, {
  retries: retryAttempt,
  retryDelay: retryCount => {
    core.info(`retrying to send pages telemetry with attempt: ${retryCount}`)
    return retryCount * 1000 // time interval between retries, with 1s, 2s, 3s
  },

  // retry on error greater than 500
  retryCondition: error => {
    return error.response.status >= 500
  }
})

const {Deployment} = __nccwpck_require__(96)


async function emitTelemetry() {
  // All variables we need from the runtime are set in the Deployment constructor
  const deployment = new Deployment()
  const telemetryUrl = `https://api.github.com/repos/${deployment.repositoryNwo}/pages/telemetry`
  core.info(`Sending telemetry for run id ${deployment.workflowRun}`)
  await axios
    .post(
      telemetryUrl,
      {github_run_id: deployment.workflowRun},
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${deployment.githubToken}`,
          'Content-type': 'application/json'
        }
      }
    )
    .catch(err => {
      if (err.response.status !== 200) {
        throw new Error(
          `failed to emit metric with status code: ${err.response.status} after ${retryAttempt} retry attempts`
        )
      }
    })
}

async function main() {
  try {
    await emitTelemetry()
  } catch (error) {
    core.error('failed to emit pages build telemetry')
  }
}

main()

module.exports = {emitTelemetry}


/***/ }),

/***/ 105:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 512:
/***/ ((module) => {

module.exports = eval("require")("axios");


/***/ }),

/***/ 736:
/***/ ((module) => {

module.exports = eval("require")("axios-retry");


/***/ }),

/***/ 996:
/***/ ((module) => {

module.exports = eval("require")("regenerator-runtime/runtime");


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(683);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=index.js.map