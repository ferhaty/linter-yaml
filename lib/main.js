'use babel';

export default {
  config: {
    yamlLintExecutablePath: {
      title: 'yamllint Executable Path',
      type: 'string',
      description: 'Path to yamllint executable (e.g. /usr/bin/yamllint) if not in shell env path.',
      default: 'yamllint',
    },
    rulesDirDefault: {
      title: 'Additionally use the default rules directories with yamllint (only if using non-default rules directories).',
      type: 'boolean',
      default: false,
    },
    useProjectConfig: {
      title: 'Use project yamllint config file.',
      type: 'boolean',
      description: 'Use an yamllint configuration file named `.yamllint` in the root level of the project directory. Overrides other settings besides executable path and blacklist.',
      default: false,
    },
    timeout: {
      title: 'Linting Timeout',
      type: 'number',
      description: 'Number of seconds to wait on lint attempt before timing out.',
      default: 10,
    }
  },

  // activate linter
  activate() {
    const helpers = require("atom-linter");
  },

  provideLinter() {
    return {
      name: 'yamllint',
      grammarScopes: ['source.yaml', 'source.yaml-advanced'],
      scope: 'file',
      lintsOnChange: false,
      lint: (activeEditor) => {
        // setup variables
        const helpers = require('atom-linter');
        const lint_regex = /(.*):(\d+).*E\d{3,4}\]\s(.*)/;
        const file = activeEditor.getPath();
        const correct_file = new RegExp(file);

        // parseable output and no color
        var args = ['-f', 'parsable']

        // use config file if specified
        if (atom.config.get('linter-yaml.useProjectConfig')) {
          // cannot cwd in project path and then add file relative path to args because ansible relies on pathing relative to directory execution for includes
          const project_path = atom.project.relativizePath(file)[0];

          // use yamllint config file in root project level
          args = args.concat(['-c', project_path + '/.yamllint'])
        }

        // add file to check
        args.push(file);

        // initialize variable for linter return here for either linter output or errors
        var toReturn = [];

        return helpers.exec(atom.config.get('linter-yaml.yamlLintExecutablePath'), args, {cwd: require('path').dirname(file), ignoreExitCode: true, timeout: atom.config.get('linter-yaml.timeout') * 1000}).then(output => {
          output.split(/\r?\n/).forEach(function (line) {
            const lint_matches = lint_regex.exec(line);
            const correct_file_matches = correct_file.exec(line);

            // check for normal linter checks output
            if (lint_matches != null && correct_file_matches != null) {
              toReturn.push({
                severity: 'warning',
                excerpt: lint_matches[3],
                location: {
                  file: file,
                  position: [[Number.parseInt(lint_matches[2]) - 1, 0], [Number.parseInt(lint_matches[2]) - 1, 1]],
                },
              });
            }
            // check for linting issues in other files
            else if (lint_matches != null) {
              toReturn.push({
                severity: 'warning',
                excerpt: lint_matches[3],
                location: {
                  file: lint_matches[1],
                  position: [[Number.parseInt(lint_matches[2]) - 1, 0], [Number.parseInt(lint_matches[2]) - 1, 1]],
                },
              });
            }
          });
          return toReturn;
        })
        .catch(error => {
          // check for unusual issues with playbook files
          const missing_file_matches = /WARNING: Couldn't open (.*) - No such file or directory/.exec(error.message);
          const unreadable_file_matches = /the file_name (.*) does not exist, or is not readable|Could not find or access '(.*)'|error occurred while trying to read the file '(.*)'/.exec(error.message);
          const syntax_matches = /(?:raise Ansible(Parser)?Error|Syntax Error while loading YAML|Couldn't parse task at|AttributeError)/.exec(error.message);
          const vault_matches = /vault password.*decrypt/.exec(error.message);
          const stdin_matches = /\.dirname/.exec(error.message);

          // check for missing file or directory
          if (missing_file_matches != null) {
            toReturn.push({
              severity: 'error',
              excerpt: 'Missing file ' + missing_file_matches[1] + '. Please fix before continuing linter use.',
              location: {
                file: file,
                position: [[0, 0], [0, 1]],
              },
            });
          }
          // check for unreadable file
          else if (unreadable_file_matches != null) {
            // the unreadable filename might be in either 1 or 2 depending upon the message which depends upon the version of yamllint
            unreadable_file = unreadable_file_matches[1] == null ? unreadable_file_matches[2] : unreadable_file_matches[1]

            toReturn.push({
              severity: 'error',
              excerpt: unreadable_file + ' is unreadable or not a file. Please fix before continuing linter use.',
              location: {
                file: file,
                position: [[0, 0], [0, 1]],
              },
            });
          }
          // check for syntax issue
          else if (syntax_matches != null) {
            toReturn.push({
              severity: 'error',
              excerpt: 'This file, an include, or role, has a syntax error. Please fix before continuing linter use.',
              location: {
                file: file,
                position: [[0, 0], [0, 1]],
              },
            });
          }
          // check for vault encrypted file
          else if (vault_matches != null) {
            toReturn.push({
              severity: 'info',
              excerpt: 'File must be decrypted with ansible-vault prior to linting.',
              location: {
                file: file,
                position: [[0, 0], [0, 1]],
              },
            });
          }
          // check for stdin lint attempt
          else if (stdin_matches != null) {
            toReturn.push({
              severity: 'info',
              excerpt: 'yamllint cannot reliably lint on stdin due to nonexistent pathing on includes and roles. Please save this playbook to your filesystem.',
              location: {
                file: 'Save this playbook.',
                position: [[0, 0], [0, 1]],
              },
            });
          }
          // output other errors directly to Atom notification display
          else {
            atom.notifications.addError(
              'An unexpected error with yamllint, linter-yaml, atom, linter, and/or your YAML file, has occurred.',
              {
                detail: error.message
              }
            );
          };
          return toReturn;
        });
      }
    };
  }
};
