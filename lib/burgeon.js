module.exports = (() => {
  const _ = require('lodash');
  const utils = require('./utils');

  const ARGUMENTS = {
    NEW_VERSION_BRANCH: {
      name: 'version',
      alias: 'v',
      describe: 'Version to use to create a new version branch',
      type: 'string'
    },
    NEW_FEATURE_BRANCH: {
      name: 'feature',
      alias: 'f',
      describe: 'Feature to use to create a new feature branch',
      type: 'string'
    },
    NEW_DEV_BRANCH: {
      name: 'dev',
      alias: 'd',
      describe: 'Description to use to create a new dev branch',
      type: 'string'
    },
    TICKET_NUMBER: {
      name: 'ticket-number',
      alias: 'n',
      describe: 'Specifies the ticket number when creating a new branch',
      type: 'integer'
    },
    IS_BUILDABLE: {
      name: 'buildable',
      alias: 'b',
      describe: 'Specifies if the new branch should be buildable (only available on feature branches)',
      type: 'boolean'
    }
  };

  const createBranch = (newParsedBranch, gutOptions) => {
    newParsedBranch.author = gutOptions.username;
    newParsedBranch.baseBranch = utils.getCurrentBranch();

    const newBranchName = utils.buildBranchName(newParsedBranch);

    utils.execute(`git checkout -b ${newBranchName}`);
    utils.execute(`git config branch.${newBranchName}.description '${JSON.stringify(newParsedBranch)}'`);
  };

  const createVersionBranch = (parsedBranch, arguments, gutOptions) => {
    const newVersion = arguments[ ARGUMENTS.NEW_VERSION_BRANCH.name ];
    if (!utils.isMasterBranch(parsedBranch)) {
      throw Error(`It is only allowed to create version branches from master!`.red);
    }

    const newParsedBranch = _.cloneDeep(parsedBranch);
    newParsedBranch.version = newVersion;

    createBranch(newParsedBranch, gutOptions);
  };

  const createFeatureBranch = (parsedBranch, arguments, gutOptions) => {
    const newFeature = arguments[ ARGUMENTS.NEW_FEATURE_BRANCH.name ];
    const isBuildable = arguments[ ARGUMENTS.IS_BUILDABLE.name ];
    if (!utils.isMasterBranch(parsedBranch) && !utils.isVersionBranch(parsedBranch)) {
      throw Error(`It is only allowed to create feature branches from version branches or master!`.red);
    }

    const newParsedBranch = _.cloneDeep(parsedBranch);
    newParsedBranch.feature = newFeature;
    newParsedBranch.isBuildable = isBuildable;

    createBranch(newParsedBranch, gutOptions);
  };

  const createDevBranch = (parsedBranch, arguments, gutOptions) => {
    const newDescription = arguments[ ARGUMENTS.NEW_DEV_BRANCH.name ];
    const newTicketNumber = arguments[ ARGUMENTS.TICKET_NUMBER.name ] || '';
    if (!utils.isVersionBranch(parsedBranch) && !utils.isFeatureBranch(parsedBranch)) {
      throw Error(`It is only allowed to create dev branches from version or feature branches!`.red);
    }

    const newParsedBranch = _.cloneDeep(parsedBranch);
    newParsedBranch.ticketNumber = newTicketNumber;
    newParsedBranch.description = newDescription;

    createBranch(newParsedBranch, gutOptions);
  };

  const hasNoUnderscores = (argument, argumentName) => {
    if (argument.includes('_')) {
      throw Error(`Argument ${argumentName} can't contain underscores`.red);
    }
    return argument;
  };

  return {

    burgeon: (yargs) => {
      utils.configureGutIfNeeded()
        .then(gutOptions => {
          const arguments = yargs
            .usage('usage: $0 switch [options]')
            .option(ARGUMENTS.NEW_VERSION_BRANCH.name, ARGUMENTS.NEW_VERSION_BRANCH)
            .option(ARGUMENTS.NEW_FEATURE_BRANCH.name, ARGUMENTS.NEW_FEATURE_BRANCH)
            .option(ARGUMENTS.NEW_DEV_BRANCH.name, ARGUMENTS.NEW_DEV_BRANCH)
            .option(ARGUMENTS.TICKET_NUMBER.name, ARGUMENTS.TICKET_NUMBER)
            .option(ARGUMENTS.IS_BUILDABLE.name, ARGUMENTS.IS_BUILDABLE)
            .check(arguments => {
              const newFeatureBranch = arguments[ ARGUMENTS.NEW_FEATURE_BRANCH.name ];
              const newDevBranch = arguments[ ARGUMENTS.NEW_DEV_BRANCH.name ];

              if (arguments[ ARGUMENTS.TICKET_NUMBER.name ] && !newDevBranch) {
                throw Error(`Argument ${ARGUMENTS.TICKET_NUMBER.name} only makes sense when creating a dev branch`.red);
              }

              if (arguments[ ARGUMENTS.IS_BUILDABLE.name ] && !newFeatureBranch) {
                throw Error(`Argument ${ARGUMENTS.IS_BUILDABLE.name} only makes sense when creating a feature branch`.red);
              }

              return true;
            })
            .coerce(ARGUMENTS.NEW_VERSION_BRANCH.name, argument => {
              if (!/[0.9]+\.[0.9]+\.[0.9]+(\.[0.9]+)?/.test(argument)) { // TODO: Use semver instead
                throw Error(`Argument ${ARGUMENTS.NEW_VERSION_BRANCH.name} must follow semver!`.red);
              }
              return argument;
            })
            .coerce(ARGUMENTS.NEW_FEATURE_BRANCH.name, argument => hasNoUnderscores(argument, ARGUMENTS.NEW_FEATURE_BRANCH))
            .coerce(ARGUMENTS.NEW_DEV_BRANCH.name, argument => hasNoUnderscores(argument, ARGUMENTS.NEW_DEV_BRANCH))
            .argv;

          const parsedBranch = utils.parseBranchName();
          if (arguments[ ARGUMENTS.NEW_VERSION_BRANCH.name ]) {
            createVersionBranch(parsedBranch, arguments, gutOptions);

          } else if (arguments[ ARGUMENTS.NEW_FEATURE_BRANCH.name ]) {
            createFeatureBranch(parsedBranch, arguments, gutOptions);

          } else {
            createDevBranch(parsedBranch, arguments, gutOptions);

          }
        });
    }
  };
})();
