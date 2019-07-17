'use babel';

export default {
  config: {
    yamlLintExecutablePath: {
      title: 'yamllint Executable Path',
      type: 'string',
      description: 'Path to yamllint executable (e.g. /usr/bin/yamllint) if not in shell env path.',
      default: 'yamllint',
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
      default: 30,
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
      lintsOnChange: true,
      lint: (activeEditor) => {
        // setup variables
        const helpers = require('atom-linter');
        const lint_regex = /(.*):(\d+):(\d+): \[(.*)\] (.*)/;
        const file = activeEditor.getPath();
        const correct_file = new RegExp(file);
        const fs = require('fs')

        // parseable output and no color
        var args = ['-f', 'parsable']

        // use config file if specified
        if (atom.config.get('linter-yaml.useProjectConfig')) {
          // cannot cwd in project path and then add file relative path to args because ansible relies on pathing relative to directory execution for includes
          const project_path = atom.project.relativizePath(file)[0];
          const configPath = project_path + '/.yamllint'
          configExists = fs.existsSync(configPath)

          if (configExists) {
            // use yamllint config file in root project level
            args = args.concat(['-c', configPath])
          }
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

              const position = helpers.generateRange(activeEditor, Number.parseInt(lint_matches[2]) - 1, Number.parseInt(lint_matches[3]) - 1);

              toReturn.push({
                severity: lint_matches[4],
                excerpt: lint_matches[5],
                location: {
                  file: file,
                  position: position,
                },
              });
            }
            // check for linting issues in other files
            else if (lint_matches != null) {
              const position = helpers.generateRange(activeEditor, Number.parseInt(lint_matches[2]) - 1, Number.parseInt(lint_matches[3]) - 1);

              toReturn.push({
                severity: lint_matches[4],
                excerpt: lint_matches[5],
                location: {
                  file: lint_matches[1],
                  position: position,
                },
              });
            }
          });
          return toReturn;
        })
        .catch(error => {
            atom.notifications.addError(
              'An unexpected error with yamllint, linter-yaml, atom, linter, and/or your YAML file, has occurred.',
              {
                detail: error.message
              }
            );
          return toReturn;
        });
      }
    };
  }
};
