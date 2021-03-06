module.exports = (() => {
  const _ = require('lodash');
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const execSync = require('child_process').execSync;
  const spawn = require('child_process').spawn;
  const promptly = require('promptly');

  const GIT_SERVERS_PRESET = {
    github: {
      getRepositoryUrl: (owner, repository) => {
        return `git@github.com:${owner}/${repository}.git`;
      }
    }
  };

  const REPOSITORY_OPTION_DEFAULTS = {
    commitMessageSuffixTemplate: ''
  };

  const BUILDABLE_BRANCH_TAG = 'build#';

  const GLOBAL_OPTIONS_FILE_PATH = path.resolve(os.homedir(), '.config', 'gut', 'gut-config.json');

  const SCRIPTS_PATH = path.resolve(os.homedir(), '.config', 'gut');

  const REPOSITORY_OPTIONS_FILE_NAME = '.gut-config.json';

  const configureGutIfNeeded = () => {
    const gutOptionsPath = GLOBAL_OPTIONS_FILE_PATH;
    try {
      fs.statSync(gutOptionsPath);
      return new Promise((resolve) => resolve(JSON.parse(fs.readFileSync(gutOptionsPath, 'utf8'))));
    } catch (err) {
      return require('./configure').initializeConfiguration();
    }
  };

  const execute = command => {
    return execSync(command).toString();
  };

  const executeAndPipe = (command, arguments) => {
    spawn(command, arguments, { stdio: 'inherit' });
  };

  const print = (...arguments) => console.log(...arguments);

  const fail = (message, exitCode) => {
    print(message.red);
    process.exit(exitCode);
  };

  const promisifiedPrompt = (message, options) => {
    return new Promise((resolve, reject) => {
      promptly.prompt(message, options, (error, value) => {
        return error
          ? reject(error)
          : resolve(value);
      });
    });
  };

  const yesNoPrompt = (message, callback) => {
    const options = {
      default: 'n',
      validator: choice => choice === 'y'
    };
    promptly.prompt(`${message} (y/n)`, options, (error, value) => {
      if (error) {
        throw error;
      }

      callback(value);
    });
  };

  const mergeArrayCustomizer = (seed, otherSource) => {
    if (_.isArray(seed)) {
      return seed.concat(otherSource);
    }
  };

  const getTopLevel = () => {
    const unsanitizedTopLevel = execSync('git rev-parse --show-toplevel');
    return _.replace(unsanitizedTopLevel, /\n/, '');
  };

  const moveUpTop = () => {
    process.chdir(getTopLevel());
  };

  const isDirty = () => {
    try {
      execSync('git diff --no-ext-diff --quiet --exit-code');
      return false;
    } catch (error) {
      return true;
    }
  };

  const hasStagedChanges = () => {
    try {
      execSync('git diff-index --cached --quiet HEAD --');
      return false;
    } catch (error) {
      return true;
    }
  };

  const hasUnstagedChanges = () => {
    try {
      execSync('[ -n "$(git ls-files --others --exclude-standard)" ]');
      return true;
    } catch (error) {
      return false;
    }
  };

  const searchForLocalBranch = regex => {
    const allBranches = execute(`git branch 2> /dev/null`);
    return _(allBranches.split('\n'))
      .map(branch => _.replace(branch, /^[* ] /, ''))
      .filter(branch => regex.test(branch))
      .value();
  };

  const getCurrentBranch = () => {
    const allBranches = execute(`git branch 2> /dev/null`);
    return _(allBranches.split('\n'))
      .filter(branch => branch.startsWith('*'))
      .map(branch => _.replace(branch, '* ', ''))
      .first();
  };

  const parseBranchName = branchName => {
    const branchFragments = (branchName ? branchName : getCurrentBranch()).split('_');

    const featureFragment = branchFragments.length > 1 && !/^[0-9]+$/.test(branchFragments[ 1 ])
      ? branchFragments[ 1 ]
      : '';
    const isBuildable = featureFragment.startsWith('build#');
    const feature = featureFragment ? _.replace(featureFragment, BUILDABLE_BRANCH_TAG, '') : '';

    const ticketNumber = _(branchFragments)
      .filter(branch => /^[0-9]+$/.test(branch))
      .first();
    return {
      version: branchFragments[ 0 ],
      feature: feature,
      ticketNumber: ticketNumber,
      description: _.size(branchFragments) > 1 ? _.last(branchFragments) : '',
      isBuildable: isBuildable
    }

  };

  const buildBranchName = parsedBranch => {
    const versionFragment = parsedBranch.version;
    const featureFragment = `${parsedBranch.isBuildable ? BUILDABLE_BRANCH_TAG : ''}${parsedBranch.feature || ''}`;
    const ticketNumberFragment = '' + (parsedBranch.ticketNumber || '');
    const descriptionFragment = parsedBranch.description || '';

    return _([ versionFragment, featureFragment, ticketNumberFragment, descriptionFragment ])
      .reject(fragment => _.isEmpty(fragment))
      .join('_');
  };

  const isMasterBranch = parsedBranch => {
    return parsedBranch.version === 'master'
      && !parsedBranch.feature
      && !parsedBranch.ticketNumber
      && !parsedBranch.description;
  };

  const isVersionBranch = parsedBranch => {
    return parsedBranch.version // TODO: semver-check dat
      && !parsedBranch.feature
      && !parsedBranch.ticketNumber
      && !parsedBranch.description;
  };

  const isFeatureBranch = parsedBranch => {
    return parsedBranch.version // TODO: semver-check dat
      && parsedBranch.feature
      && !parsedBranch.ticketNumber
      && !parsedBranch.description;
  };

  const isDevBranch = parsedBranch => {
    return parsedBranch.version // TODO: semver-check dat
      && parsedBranch.description;
  };

  const getRepositoryOption = optionName => {
    const topLevelDirectory = getTopLevel();

    let result;
    try {
      const repositoryOptionsFileName = path.resolve(topLevelDirectory, REPOSITORY_OPTIONS_FILE_NAME);
      fs.statSync(repositoryOptionsFileName);
      const repositoryOptions = JSON.parse(fs.readFileSync(repositoryOptionsFileName, 'utf8'));
      result = repositoryOptions[ optionName ];

    } catch (err) {
      result = REPOSITORY_OPTION_DEFAULTS[ optionName ];
    }

    if (!result) {
      throw Error(`Option ${optionName} is not specified in the repository's options.`.red)
    }

    return result;
  };

  const getRemotes = () => {
    const remotesAsString = execute(`git remote show`);
    return _(remotesAsString.split('\n'))
      .reject(remote => _.isEmpty(remote))
      .value();
  };

  const getBranchRemote = branch => {
    const safeBranch = branch || getCurrentBranch();
    try {
      return execute(`git config branch.${safeBranch}.remote`);
    } catch (error) {
      return undefined;
    }
  };

  return {
    GIT_SERVERS_PRESET: GIT_SERVERS_PRESET,
    GLOBAL_OPTIONS_FILE_PATH: GLOBAL_OPTIONS_FILE_PATH,
    SCRIPTS_PATH: SCRIPTS_PATH,
    OPTIONS_FILE_NAME: REPOSITORY_OPTIONS_FILE_NAME,

    configureGutIfNeeded: configureGutIfNeeded,

    execute: execute,
    executeAndPipe: executeAndPipe,
    print: print,
    exit: fail,

    yesNoPrompt: yesNoPrompt,
    promisifiedPrompt: promisifiedPrompt,

    mergeArrayCustomizer: mergeArrayCustomizer,

    getRepositoryOption: getRepositoryOption,

    getTopLevel: getTopLevel,
    moveUpTop: moveUpTop,

    isDirty: isDirty,
    hasStagedChanges: hasStagedChanges,
    hasUnstagedChanges: hasUnstagedChanges,

    getCurrentBranch: getCurrentBranch,
    searchForLocalBranch: searchForLocalBranch,
    parseBranchName: parseBranchName,
    buildBranchName: buildBranchName,
    isMasterBranch: isMasterBranch,
    isVersionBranch: isVersionBranch,
    isFeatureBranch: isFeatureBranch,
    isDevBranch: isDevBranch,

    getRemotes: getRemotes,
    getBranchRemote: getBranchRemote,

    getGitServer: serverName => {
      if (!_.has(GIT_SERVERS_PRESET, serverName)) {
        throw Error(`Server ${serverName} not configured. Please make sure it is not being implemented and create an issue.`);
      }

      return GIT_SERVERS_PRESET[ serverName ];
    }
  };
})();
