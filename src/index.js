const Map = require("collections/map");
let cmdRegistry = new Map();

const path = require("path");
const rqAll = require("require-all");

const { split } = require("smart-splitter");

// This is used to camelcase argument keys in the args object
const camelCase = require("camelcase");

const resolveCommand = require("./util/resolve-command.js");

const argTypes = require("./arguments");
module.exports.argTypes = argTypes;

// Use this error when you want the user to be notified
const InvalidArgumentError = require("./errors/invalid-argument.js");
module.exports.InvalidArgumentError = InvalidArgumentError;

// Use this error when it is command-specific
const CommandError = require("./errors/command.js");
module.exports.CommandError = CommandError;

const Command = require("./command.js");
module.exports.Command = Command;

/**
 * Registers a single command.
 * @param {(Object|Command)} cmd The command to register.
 * @returns {Map} The registry including the new command.
 */
function registerSingle(cmd) {
	const name = cmd.name || cmd.command;
	if (!name) {
		throw new CommandError("Commands must have names.", "MISSING_COMMAND_NAME");
	} else {
		const alias = cmd.aliases || [];
		alias.push(name);

		alias.forEach(aname => {
			cmd.name = aname;
			cmd.originalName = name;

			cmd.aliases = alias.filter(name2 => name2 !== aname);

			// Make it into a Command and actually add it to the registry
			const cmdFixed = resolveCommand(cmd);
			cmdRegistry.set(aname, cmdFixed);
		});

		return cmdRegistry;
	}
}

/**
 * Registers a single command or an array of commands.
 * @param {(Object|Object[]|Command|Command[])} cmdOrCmds The command(s) to register.
 * @returns {Map} The registry including the new command(s).
 */
function register(cmdOrCmds) {
	if (Array.isArray(cmdOrCmds)) {
		cmdOrCmds.forEach(registerSingle);
		return cmdRegistry;
	} else {
		return registerSingle(cmdOrCmds);
	}
}
module.exports.register = register;

/**
	* Registers every JavaScript file in a directory as a command.
	* @param {string} directory The path to the directory to register.
	* @param {boolean} recursive If true, registers commands in subdirectories.
 	* @returns {Map} The registry including the new commands.

*/
function registerDirectory(directory = "", recursive = true) {
	rqAll({
		dirname: path.resolve(directory),
		filter: /\.js$/,
		recursive,
		resolve: register,
	});
	return cmdRegistry;
}
module.exports.registerDirectory = registerDirectory;

/**
	* Runs a command by parsing it and its arguments.
	* @param {string} command The command to parse.
	* @param {Object} pass Extra values to pass to the command when ran.
	* @returns {Object} The arguments parsed.
*/
function parse(command, pass) {
	const cmd = command.toString().trim();
	const firstSpace = cmd.includes(" ") ? cmd.indexOf(" ") : cmd.length;
	const cmdStr = cmd.substr(0, firstSpace);

	if (cmdStr) {
		const cmdSource = cmdRegistry.get(cmdStr);
		if (cmdSource) {
			const args = split(cmd.substr(firstSpace + 1), cmdSource.arguments.length);
			const argsObj = { ...pass };

			let success = true;

			if (argsObj.testPermission && !cmdSource.permissionless) {
				const cmdPerm = "commands." + (cmdSource.category ? cmdSource.category + "." : "") + cmdSource.originalName;
				if (!argsObj.testPermission(cmdPerm)) {
					success = false;
					if (argsObj.localize && argsObj.send) {
						argsObj.send(argsObj.localize("no_permission"));
					}
				}
			}

			cmdSource.arguments.forEach((argument, index) => {
				const get = argument.get(args[index], pass, cmdRegistry);

				// We camelCase this so it's easier to access
				// Args["casing-example"] vs. args.casingExample
				argsObj[camelCase(argument.key)] = get.value;

				// You can still access it with the exact argument if needed, though
				argsObj[argument.key] = get.value;

				if (!get.success) {
					success = false;
				}
			});

			if (success) {
				if (Array.isArray(cmdSource.check)) {
					if (cmdSource.check.every(check => check(argsObj))) {
						cmdSource.run(argsObj);
					}
				} else if (cmdSource.check) {
					if (cmdSource.check(argsObj)) {
						cmdSource.run(argsObj);
					}
				} else {
					cmdSource.run(argsObj);
				}
				return argsObj;
			}
		}
	}
}
module.exports.parse = parse;

/**
 * Deregisters every command.
 * @returns {undefined}
 */
function clear() {
	return cmdRegistry.clear();
}
module.exports.clear = clear;

/**
 * Deregisters a command.
 * @param {string} name The name of the command to deregister.
 * @param {boolean} includeAlternatives If true, also deregisters aliases of the same command (even if the target is an alias).
 * @returns {Map} The command registry excluding the deregistered commands.
 */
function deregister(name, includeAlternatives = true) {
	if (includeAlternatives) {
		cmdRegistry = cmdRegistry.filter(command => command.originalName !== name);
	} else {
		cmdRegistry = cmdRegistry.filter(command => command.name !== name);
	}
	return cmdRegistry;
}
module.exports.deregister = deregister;

/**
 * Gets the command registry.
 * @returns {Map} The command registry.
 */
function getCommandRegistry() {
	return cmdRegistry;
}
module.exports.getCommandRegistry = getCommandRegistry;
