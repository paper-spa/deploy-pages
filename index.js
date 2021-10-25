const core = require('@actions/core');
// const github = require('@actions/github'); // TODO: Not used until we publish API endpoint to the @action/github package
const axios = require('axios');

// TODO
// const tar = require('tar');

// This package assumes a site has already been built and the files exist in the current workspace
// If there's an artifact named `artifact.tar`, it can upload that to actions on its own,
// without the user having to do the tar process themselves.

// Ask the runtime for the unsigned artifact URL and deploy to GitHub Pages
// by creating a deployment with that artifact
async function create() {
    try {
      // Get the actions runtime
      const runTimeUrl = process.env["ACTIONS_RUNTIME_URL"];
      const workflowRun = process.env["GITHUB_RUN_ID"];
      const runTimeToken = process.env["ACTIONS_RUNTIME_TOKEN"];
      const repositoryNwo = process.env["GITHUB_REPOSITORY"]
      const githubToken = process.env["GITHUB_TOKEN"];
      const buildVersion = process.env["GITHUB_SHA"];
      const pagesDeployEndpoint = `https://api.github.com/repos/${repositoryNwo}/pages/deployment`
      const artifactExgUrl = `${runTimeUrl}_apis/pipelines/workflows/${workflowRun}/artifacts?api-version=6.0-preview`
      core.info(`Artifact URL: ${artifactExgUrl}`);
      const { data } = await axios.get(artifactExgUrl, {
          headers: {
              'Authorization': `Bearer ${runTimeToken}`,
              'Content-Type': 'application/json'
            }
      })
      core.info(JSON.stringify(data))
      const artifactUrl = data.value[0].url
      const response = await axios.post(
          pagesDeployEndpoint,
          { "artifact_url": artifactUrl, "pages_build_version": buildVersion },
          {
            headers: {
                "Accept": 'application/json',
                "Authorization": `Bearer ${githubToken}`,
                "Content-type": "application/json",
            },
      })
      core.info(`Response from create call: ${response}`)
      core.info(`Created deployment for ${buildVersion}`)
      core.info(JSON.stringify(uploadResponse))
    } catch (error) {
        core.info('Failed to create deployment.')
        core.setFailed(error);
    }
}

// Poll the deployment endpoint for status
async function check() {
    try {
        const api_token = core.getInput('token');
        const url = core.getInput('status_url');
        const timeout = core.getInput('timeout');
        const timeout_duration = core.getInput('timeout_duration');
        const error_count_max = core.getInput('error_count');
        var tries = 0;
        var error_count = 0;
        while (tries < timeout) {
            tries++;
            await new Promise(r => setTimeout(r, timeout_duration));
            var res = await axios.get(url, {
                headers: {
                    'Authorization': `token ${api_token}`
                }
            });

            if (res.data.status == "succeed") {

                console.log("Reported success!");
                core.setOutput("status", "succeed");
                break;
            } else {
                console.log("Current status: " + res.data.status);
            }

            if (res.status != 200) {
                error_count++;
            }

            if (error_count >= error_count_max) {
                console.log("Too many errors, aborting!");
                core.setFailed("Failed with status code: " + res.status)
                break;
            }
        }
        if (tries >= timeout) {
            console.log("Timeout reached, aborting!");
            core.setFailed("Timeout reached, aborting!")
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}


async function main() {
    try {
        await create()
        await check()

    } catch (err) {
        core.setFailed(error.message)
    }
}

main().then(() => {
    core.info('Run completed');
})