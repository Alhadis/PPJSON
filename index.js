#!/usr/bin/env node
"use strict";

const ChildProcess = require("child_process");
const getOpts      = require("get-options");
const fs           = require("fs");


// Read CLI args
const {options, argv} = getOpts(process.argv.slice(2), {
	"-?, -h, --help":                       "",
	"-m, --mutilate":                       "<bool>",
	"-u, --underline-urls":                 "<bool>",
	"-i, --indent":                         "<size>",
	"-c, --colour, --colours, --colourise": "<bool>",
	"-p, --paged":                          "",
	"-a, --alphabetise":                    ""
});


// Print help and bail if that's what the user wanted
if(options.help){
	const path = require("path");
	const name = path.basename(process.argv[1]);
	const help = `
	Usage: ${name} [options] <filename>

	Pretty-print JSON data for terminal output.

	Options:

	  -m, --mutilate <bool=1>       Unquote property identifiers
	  -u, --underline-urls <bool=1> Add underlines to URLs
	  -c, --colour <bool=1>         Colourise the prettified output
	  -i, --indent <size=4>         Indentation width, expressed in spaces
	  -a, --alphabetise             Order properties alphabetically
	  -p, --paged                   Show content in pager if longer than screen

	Run \`man ppjson' for full documentation.
	`.replace(/\t+/g, "    ");

	process.stdout.write(help + "\n");
	process.exit(0);
}

// Parse our options and normalise their defaults
const mutilate      = undefined === options.m ? true  : bool(options.m);
const underlineURLs = undefined === options.u ? true  : bool(options.u);
const colourise     = undefined === options.c ? true  : bool(options.c);
const pagedView     = undefined === options.p ? false : bool(options.p);
const indentSize    = undefined === options.i ? 4     : options.indent;
const alphabetise   = undefined === options.a ? false : options.alphabetise;
const indent        = Array(Math.max(1, indentSize) + 1).join(" ");


// Configure colour palette
const {env} = process;
const SGR = {
	reset:       "\x1B[0m",
	bold:        "\x1B[1m",
	unbold:      "\x1B[22m",
	underline:   "\x1B[4m",
	noUnderline: "\x1B[24m",
	colours: {
		strings: `\x1B[38;5;${ +env.PPJSON_COLOUR_STRINGS || 2 }m`,
		numbers: `\x1B[38;5;${ +env.PPJSON_COLOUR_NUMBERS || 2 }m`,
		true:    `\x1B[38;5;${ +env.PPJSON_COLOUR_TRUE    || 6 }m`,	
		false:   `\x1B[38;5;${ +env.PPJSON_COLOUR_FALSE   || 6 }m`,
		null:    `\x1B[38;5;${ +env.PPJSON_COLOUR_NULL    || 6 }m`,
		punct:   `\x1B[38;5;${ +env.PPJSON_COLOUR_PUNCT   || 8 }m`,
		error:   `\x1B[38;5;${ +env.PPJSON_COLOUR_ERROR   || 1 }m`,
	},
};


let input  = "";
let output = "";

// An input file was specified on command-line
if(argv.length){
	let separator = "";

	// Cycle through each file and prettify their contents
	for(const path of argv){
		
		// Make sure there'	s enough whitespace between files
		output += separator;
		separator = "\n\n";

		try{ fs.accessSync(path); }
		catch(error){
			// If there was an access error, hit eject
			process.stderr.write(SGR.colours.error);
			process.stderr.write(SGR.bold + "ERROR" + SGR.unbold + error.message);
			process.stderr.write(SGR.reset);
			process.exit(2);
		}
		
		// Otherwise, go for it
		output += prettifyJSON(fs.readFileSync(path, {encoding: "utf8"}));
	}
	
	// Send the compiled result to STDOUT
	print(output);
}

// No file specified, just read from STDIN instead
else{
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
	return require("vm").runInNewContext(`(${input})`);
}


/**
 * Spruce up JSON for console display.
 *
 * @param {String}
 * @return {String}
 */
function prettifyJSON(input){
	let output = parseJSON(input);
	
	// Order the properties of objects by alphabetical order, not enumeration order
	if(alphabetise)
		output = alphabetiseProperties(output);
	
	output = JSON.stringify(output, null, indent);
	
	
	// Unquote property identifiers in object literals
	if(mutilate){
		const pattern = new RegExp(indent + '"([\\w\\$]+)":', "g");
		output = output.replace(pattern, indent + "$1:");
	}
	
	
	// Colourise the output
	if(colourise){
		const bracketsPattern = new RegExp("^((?:" + indent + ")*)([\\[\\{\\}\\]],?)", "gm");
		const {colours, reset} = SGR;
		const {strings} = colours;
		output = output
			.replace(/("([^\\"]|\\.)*")/g, colours.strings + "$1" + SGR.reset)  // Strings
			.replace(/(\d+,)$/gm,          colours.numbers + "$1" + SGR.reset)  // Numerals
			
			// Constants
			.replace(/true(,)?$/gm,        colours.true  + "true"  + SGR.reset + "$1")
			.replace(/false(,)?$/gm,       colours.false + "false" + SGR.reset + "$1")
			.replace(/null(,)?$/gm,        colours.null  + "null"  + SGR.reset + "$1")
			
			// Greyed-out unimportant bits
			.replace(bracketsPattern, "$1" + colours.punct + "$2" + SGR.reset)
			.replace(/((?:\[\]|\{\})?,)$/gm, colours.punct + "$1" + SGR.reset)
			.replace(/(\[|\{)$/gm,           colours.punct + "$1" + SGR.reset);
	}
	

	// Underline URLs
	if(underlineURLs){
		const rURL = /(\s*(https?:)?\/\/([^:]+:[^@]+@)?([\w-]+)(\.[\w-]+)*(:\d+)?(\/\S+)?\s*(?="))/gm;
		output = output.replace(rURL, SGR.underline + "$1" + SGR.noUnderline);
	}
	
	return output + "\n";
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
	
	// Determine if the output should be piped through to a pager
	if(pagedView && input.match(/\n/g).length > process.stdout.rows){
		const less  = ChildProcess.spawn("less", ["-Ri"], {
			stdio: ["pipe", process.stdout, process.stderr]
		});
		less.stdin.write(input);
		less.stdin.end();
	}

	else process.stdout.write(input);
}
