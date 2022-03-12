require('regenerator-runtime/runtime')

const core = require('@actions/core')
const axios = require('axios')

// All variables we need from the runtime are loaded here
const getContext = require('./context')

class Deployment {
    constructor() {
      const context = getContext()
      this.runTimeUrl = context.runTimeUrl
      this.repositoryNwo = context.repositoryNwo
      this.runTimeToken = context.runTimeToken
      this.buildVersion = context.buildVersion
      this.buildActor = context.buildActor
      this.actionsId = context.actionsId
      this.githubToken = context.githubToken
      this.workflowRun = context.workflowRun
      this.isPreview = context.isPreview === true
      this.requestedDeployment = false
    }

    async getArtifactUrlForActiveRun(artifactRunId) {
      const artifactExgUrl = `${this.runTimeUrl}_apis/pipelines/workflows/${artifactRunId}/artifacts?api-version=6.0-preview`
      core.info(`Artifacts URL: ${artifactExgUrl}`)

      const { data } = await axios.get(artifactExgUrl, {
        headers: {
          Authorization: `Bearer ${this.runTimeToken}`,
          'Content-Type': 'application/json'
        }
      })
      core.info(JSON.stringify(data))
      if (data.value.length === 0) {
        throw new Error('No uploaded artifact was found!')
      }

      const artifactUrl = `${data.value[0].url}&%24expand=SignedContent`
      core.info(`Artifact URL: ${artifactUrl}`)
      return artifactUrl
    }

    async getArtifactUrlForSeparateRun(artifactRunId) {
      const artifactExgUrl = `https://api.github.com/repos/${this.repositoryNwo}/actions/runs/${artifactRunId}/artifacts`

      core.info(`Artifacts URL: ${artifactExgUrl}`)
      const { data } = await axios.get(artifactExgUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${this.githubToken}`,
          'Content-Type': 'application/json'
        }
      })
      core.info(JSON.stringify(data))
      if (data.total_count === 0 || data.artifacts.length === 0) {
        throw new Error('No uploaded artifact was found!')
      }

      const pagesArtifact = data.artifacts.find(({ name }) => name === 'github-pages') || data.artifacts[0]
      const artifactInfoUrl = pagesArtifact.archive_download_url

      const { headers: { location: { artifactUrl } } } = await axios.get(artifactInfoUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${this.githubToken}`,
          'Content-Type': 'application/json'
        },
        maxRedirects: 0
      })

      core.info(`Artifact URL: ${artifactUrl}`)
      return artifactUrl
    }

    getArtifactUrl() {
      const artifactRunId = this.sourceWorkflowRun || this.workflowRun

      // Requesting deployment of an artifact from the separate workflow run
      if (artifactRunId !== this.workflowRun) {
        return this.getArtifactUrlForSeparateRun(artifactRunId)
      }

      return this.getArtifactUrlForActiveRun(artifactRunId)
    }

    // Ask the runtime for the unsigned artifact URL and deploy to GitHub Pages
    // by creating a deployment with that artifact
    async create(idToken) {
      try {
        core.info(`Actor: ${this.buildActor}`)
        core.info(`Action ID: ${this.actionsId}`)
        const pagesDeployEndpoint = `https://api.github.com/repos/${this.repositoryNwo}/pages/deployment`

        const artifactUrl = await this.getArtifactUrl()
        const payload = {
          artifact_url: artifactUrl,
          pages_build_version: this.buildVersion,
          oidc_token: idToken,
          preview: this.isPreview
        }
        core.info(`Creating deployment with payload:\n${JSON.stringify(payload, null, '\t')}`)

        const response = await axios.post(pagesDeployEndpoint, payload, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${this.githubToken}`,
            'Content-type': 'application/json'
          }
        })
        this.requestedDeployment = true
        core.info(`Created deployment for ${this.buildVersion}`)
        core.info(JSON.stringify(response.data))
      } catch (error) {
        core.info(`Failed to create deployment for ${this.buildVersion}.`)
        core.setFailed(error)
        throw error
      }
    }

    // Poll the deployment endpoint for status
    async check() {
      try {
        const statusUrl = `https://api.github.com/repos/${this.repositoryNwo}/pages/deployment/status/${process.env['GITHUB_SHA']}`
        const timeout = core.getInput('timeout')
        const reportingInterval = core.getInput('reporting_interval')
        const maxErrorCount = core.getInput('error_count')
        var startTime = Date.now()
        var errorCount = 0

        /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
        while (true) {
          // Handle reporting interval
          if (reportingInterval > 0) {
            await new Promise(r => setTimeout(r, reportingInterval))
          }

          // Check status
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
          } else {
            core.info('Current status: ' + res.data.status)
          }

          if (res.status != 200) {
            errorCount++
          }

          if (errorCount >= maxErrorCount) {
            core.info('Too many errors, aborting!')
            core.setFailed('Failed with status code: ' + res.status)
            break
          }
        }
        // Handle timeout
        if (Date.now() - startTime >= timeout) {
          core.info('Timeout reached, aborting!')
          core.setFailed('Timeout reached, aborting!')
          return
        }
      } catch (error) {
        core.setFailed(error)
      }
    }
  }

  module.exports = {Deployment}