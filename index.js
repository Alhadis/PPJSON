#!/usr/bin/env node
"use strict";

const ChildProcess = require("child_process");
const getOpts      = require("get-options");
const fs           = require("fs");


// Read CLI args
const {options, argv} = getOpts(process.argv.slice(2), {
	"-?, -h, --help":                       "",
	"-a, --alphabetise":                    "",
	"-c, --colour, --colours, --colourise": "<bool>",
	"-i, --indent":                         "<size>",
	"-m, --mutilate":                       "<bool>",
	"-p, --paged, --pager":                 "<bool>",
	"-t, --tabs":                           "",
	"-u, --underline-urls":                 "<bool>",
	"-v, --version":                        "",
	"-w, --write":                          "",
});


// Print help and bail if that's what the user wanted
if(options.help){
	const path = require("path");
	const name = path.basename(process.argv[1]);
	const help = `
	Usage: ${name} [options] <filename>

	Pretty-print JSON data for terminal output.

	Options:

	  -a, --alphabetise             Order properties alphabetically
	  -c, --colour <bool=1>         Colourise the prettified output
	  -i, --indent <size=4>         Indentation width, expressed in spaces
	  -m, --mutilate <bool=1>       Unquote property identifiers
	  -p, --paged <bool=1>          Show content in pager if longer than screen
	  -t, --tabs                    Use tabs to indent output instead of spaces
	  -u, --underline-urls <bool=1> Add underlines to URLs
	  -v, --version                 Print the program's version string and exit
	  -w, --write                   Write prettified data back to files

	Run \`man ppjson' for full documentation.
	`.replace(/\t+/g, "    ");

	process.stdout.write(help + "\n");
	process.exit(0);
}


// Print the program's version string if requested
if(options.version){
	const {version} = require("./package.json");
	process.stdout.write(version.replace(/^v?/, "v") + "\n");
	process.exit(0);
}


// Parse our options and normalise their defaults
const isTTY         = !!process.stdout.isTTY;
const mutilate      = undefined === options.m ? true  : bool(options.m);
const underlineURLs = undefined === options.u ? isTTY : bool(options.u);
const colourise     = undefined === options.c ? isTTY : bool(options.c);
const pagedView     = undefined === options.p ? true  : bool(options.p);
const indentSize    = undefined === options.i ? 4     : options.indent;
const alphabetise   = undefined === options.a ? false : options.alphabetise;
const writeBack     = undefined === options.w ? false : bool(options.w);
const tabs          = undefined === options.t ? false : bool(options.t);
const indent        = tabs? "\t" : Array(Math.max(1, indentSize) + 1).join(" ");


// Configure colour palette
const {env} = process;
const SGR = {
	reset:       "\x1B[0m",
	bold:        "\x1B[1m",
	unbold:      "\x1B[22m",
	underline:   "\x1B[4m",
	noUnderline: "\x1B[24m",
	colours: resolveColours(),
};


// Bail if an unrecognised option was passed
const unknownOption = argv.find(opt => /^-/.test(opt));
if(unknownOption)
	die(`Unknown option: ${unknownOption}`);


let input  = "";
let output = "";

// An input file was specified on command-line
if(argv.length){
	let separator = "";

	// Cycle through each file and prettify their contents
	for(const path of argv){
		
		// Make sure there's enough whitespace between files
		output += separator;
		separator = "\n\n";
		
		try{
			let fileData = fs.readFileSync(path, {encoding: "utf8"});
			if(writeBack){
				fileData = parseJSON(fileData);
				fs.writeFileSync(path, JSON.stringify(fileData, null, indent));
				continue;
			}
			output += prettifyJSON(fileData);
		}
		// If there was an access error, hit eject
		catch(error){
			die(error.message, 2);
		}
	}
	
	// Send the compiled result to STDOUT
	print(output);
}

// No file specified, just read from STDIN instead
else{
	if(writeBack){
		let msg = "Ignoring --write switch: reading from STDIN.";
		if(process.stderr.isTTY)
			msg = SGR.colours.error + msg + SGR.reset;
		process.stderr.write(msg + "\n");
	}

	process.stdin.setEncoding("utf8");
	process.stdin.on("readable", () => {
		const chunk = process.stdin.read();
		if(null !== chunk)
			input += chunk;
	});
	process.stdin.on("end", () => {
		print(prettifyJSON(input));
	});
}



/**
 * Interpret a string as a boolean value.
 *
 * @param {String} input
 * @return {Boolean}
 */
function bool(input){
	const num = +input;
	
	// NaN: String was supplied, check for keywords equating to "false"
	if(num !== num)
		return !/^(?:false|off|no?|disabled?|nah)$/i.test(input);
	return !!num;
}



/**
 * Recursively alphabetise the enumerable properties of an object.
 *
 * This function returns a copy of the original object with all properties
 * listed in alphabetic order, rather than enumeration order. The original
 * object is unmodified.
 *
 * @param {Object}  input
 * @param {Boolean} strictCase - If TRUE, will order case-sensitively (capitals first)
 * @return {Object}
 */
function alphabetiseProperties(input, strictCase = false){
	const stringTag = Object.prototype.toString.call(input);

	// Regular JavaScript object; enumerate properties
	if("[object Object]" === stringTag){
		let keys = Object.keys(input);
		
		keys = strictCase ? keys.sort() : keys.sort((a, b) => {
			const A = a.toLowerCase();
			const B = b.toLowerCase();
			if(A < B) return -1;
			if(A > B) return 1;
			return 0;
		});
		
		const result = {};
		for(const key of keys)
			result[key] = alphabetiseProperties(input[key]);
		return result;
	}
	
	// This is an array; make sure the properties of its values are sorted too
	else if(Array.isArray(input))
		return input.map(e => alphabetiseProperties(e));
	
	// Just return it untouched
	return input;
}


/**
 * Parse JSON or JSON-like data.
 *
 * @param {String}
 * @return {Object}
 */
function parseJSON(input = ""){
	if(!input) return undefined;
	input = input.trim()
		.replace(/;$|^\s*"use strict"\s*(?:;\s*)?$/g, "")
		.replace(/^(module\s*\.\s*)?exports\s*=\s*/g, "")
		.replace(/^export(\s+default)?\s*/, "");
	const output = require("vm").runInNewContext(`(${input})`);
	return alphabetise ? alphabetiseProperties(output) : output;
}


/**
 * Spruce up JSON for console display.
 *
 * @param {String}
 * @return {String}
 */
function prettifyJSON(input){
	let output = JSON.stringify(parseJSON(input), null, indent);
	
	// Unquote property identifiers in object literals
	if(mutilate){
		const pattern = new RegExp(indent + '"([\\w\\$]+)":', "g");
		output = output.replace(pattern, indent + "$1:");
	}
	
	// Colourise the output
	if(colourise){
		const bracketsPattern = new RegExp("^((?:" + indent + ")*)([\\[\\{\\}\\]],?)", "gm");
		const colonSepPattern = /^(\s*(?:"[^\"]+"|\w+))(:)/gm;
		const {colours, reset} = SGR;
		const {strings} = colours;
		output = output

			// Constants
			.replace(/true(,)?$/gm,        colours.true  + "true"  + SGR.reset + "$1")
			.replace(/false(,)?$/gm,       colours.false + "false" + SGR.reset + "$1")
			.replace(/null(,)?$/gm,        colours.null  + "null"  + SGR.reset + "$1")

			// Greyed-out unimportant bits
			.replace(bracketsPattern, "$1" + colours.punct + "$2" + SGR.reset)
			.replace(colonSepPattern, "$1" + colours.punct + "$2" + SGR.reset)
			.replace(/((?:\[\]|\{\})?,)$/gm, colours.punct + "$1" + SGR.reset)
			.replace(/(\[|\{)$/gm,           colours.punct + "$1" + SGR.reset)
			.replace(/(\[\]$|{})$/gm,        colours.punct + "$1" + SGR.reset)

			// Strings and numerals
			.replace(/("([^\\"]|\\.)*")/g, colours.strings + "$1" + SGR.reset)
			.replace(/(\d+,)$/gm,          colours.numbers + "$1" + SGR.reset);

		// Unquoted property key styling (blank by default)
		if(colours.unquoted){
			const str = "$1" + colours.unquoted + "$2" + SGR.reset;
			output = output.replace(/(^\s*)(\w+)/gm, str);
		}
	}
	

	// Underline URLs
	if(underlineURLs){
		const rURL = /(\s*((git\+)?[-a-z]+:|mailto:)?\/\/([^:\/]+:[^@\/]+@)?([\w-]+)(\.[\w-]+)*(:\d+)?(\/?[^\/\s\)"'`]+)*\/?)/gm;
		output = output.replace(rURL, SGR.underline + "$1" + SGR.noUnderline);
		output = output.replace(/[-\w.+]+@(?:[-\w.+]+\.)+[-\w.]*/g, SGR.underline + "$&" + SGR.noUnderline);
	}
	
	return output + "\n";
}


/**
 * Determine which colour palette to use.
 *
 * Results are determined based on environment variables and platform
 * support. Note that the latter is extremely limited on purpose: one
 * can easily disable or override colours on command-line if need be.
 *
 * @return {Object}
 */
function resolveColours(){
	const isLtd = "win32" === process.platform || /^vt|^dumb$/.test(process.env.TERM);

	let unquoted = "";
	let strings = isLtd ? "32" : "38;5;2"; // Green
	let numbers = isLtd ? "32" : "38;5;2"; // Green
	let True    = isLtd ? "36" : "38;5;6"; // Cyan
	let False   = isLtd ? "36" : "38;5;6"; // Cyan
	let Null    = isLtd ? "36" : "38;5;6"; // Cyan
	let punct   = isLtd ? "37" : "38;5;8"; // Grey
	let error   = isLtd ? "31" : "38;5;1"; // Red
	
	// Check the older (clumsier) environment variables first
	strings = +env.PPJSON_COLOUR_STRINGS || strings;
	numbers = +env.PPJSON_COLOUR_NUMBERS || numbers;
	True    = +env.PPJSON_COLOUR_TRUE    || True;
	False   = +env.PPJSON_COLOUR_FALSE   || False;
	Null    = +env.PPJSON_COLOUR_NULL    || Null;
	punct   = +env.PPJSON_COLOUR_PUNCT   || punct;
	error   = +env.PPJSON_COLOUR_ERROR   || error;

	// Allow colours to be customised using a `GREP_COLORS`-style variable
	if(env.PPJSON_COLOURS){
		const fields = env.PPJSON_COLOURS.replace(/\s+/, "").split(":").filter(Boolean);
		for(const field of fields){
			let [key, ...value] = field.split("=");
			value = `\x1B[${ value.join("=") }m`;
			switch(key.toLowerCase()){
				case "s": strings  = value; break;
				case "n": numbers  = value; break;
				case "t": True     = value; break;
				case "f": False    = value; break;
				case "n": Null     = value; break;
				case "p": punct    = value; break;
				case "e": error    = value; break;
				case "u": unquoted = value; break;
			}
		}
	}

	return {
		strings:  strings  ? `\x1B[${ strings  }m` : "",
		numbers:  numbers  ? `\x1B[${ numbers  }m` : "",
		true:     True     ? `\x1B[${ True     }m` : "",
		false:    False    ? `\x1B[${ False    }m` : "",
		null:     Null     ? `\x1B[${ Null     }m` : "",
		punct:    punct    ? `\x1B[${ punct    }m` : "",
		error:    error    ? `\x1B[${ error    }m` : "",
		unquoted: unquoted ? `\x1B[${ unquoted }m` : "",
	};
}



/**
 * Terminate with an angry red error message.
 *
 * @param {String} text - Error message
 * @param {Number} code - Exit status
 */
function die(text, code = 1){
	const msg = `: ${text}\n`;
	if(process.stderr.isTTY){
		process.stderr.write(SGR.colours.error);
		process.stderr.write(SGR.bold + "ERROR" + SGR.unbold + msg);
		process.stderr.write(SGR.reset);
	}
	else process.stderr.write("ERROR" + msg);
	process.exit(code);
}


/**
 * Send a string to STDOUT.
 *
 * The content is sent through to the less program if it's too long to
 * show without scrolling, unless the --paged option's been disabled.
 *
 * @param {String} input
 */
function print(input){

	// Do nothing if write-back mode is enabled
	if(writeBack) return;
	
	// Determine if the output should be piped through to a pager
	const pagerInfo = resolvePagerInfo();
	if(null !== pagerInfo && input.match(/\n/g).length > process.stdout.rows){
		const [name, ...argv] = pagerInfo;
		const pager = ChildProcess.spawn(name, argv, {
			stdio: ["pipe", process.stdout, process.stderr],
			detached: true,
		});
		pager.stdin.write(input);
		pager.stdin.end();
	}

	else process.stdout.write(input);
}


/**
 * Determine which program the system uses to display paged output.
 *
 * @return {String[]}
 * @internal
 */
function resolvePagerInfo(){
	const {env, stdout} = process;
	if(!pagedView || !stdout.rows) return null;
	if(env.PAGER)     return env.PAGER.split(/\s+/);
	if(which("less")) return ["less", "-Ri"];
	if(which("more")) return ["more"];
	return null;
}


/**
 * Locate a program file in the user's $PATH.
 *
 * @example which("curl") == "/usr/bin/curl"
 * @example which("nada") == ""
 * @param {String} name
 * @return {String}
 */
function which(name){
	if(!name) return "";
	const {execSync} = require("child_process");
	const commandStr = "win32" === process.platform
		? `@for %g in (ECHO ${name.replace(/%/g, "%%")}) do`
			+ " @for %e in (%PATHEXT%) do"
			+ " @for %i in (%g%e) do "
			+ ' @if NOT "%~$PATH:i"=="" echo %~$PATH:i'
		: `command -v '${name.replace(/'/g, `'"'"'`)}' 2>/dev/null`;
	try{
		const output = execSync(commandStr, {windowsHide: true});
		return output.toString().split(/\r?\n/).filter(Boolean)[0] || "";
	} catch(e){
		return "";
	}
}
