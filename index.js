#!/usr/bin/env node --es_staging
"use strict";

const ChildProcess = require("child_process");
const getOpts      = require("get-options");
const fs           = require("fs");


/** Read CLI args */
let _ = getOpts(process.argv.slice(2), {
	"-?, -h, --help":                       "",
	"-m, --mutilate":                       "<bool>",
	"-u, --underline-urls":                 "<bool>",
	"-i, --indent":                         "<size>",
	"-c, --colour, --colours, --colourise": "<bool>",
	"-p, --paged":                          "",
	"-a, --alphabetise":                    ""
});

/** Would've used `let {options, argv} = getOpts`, but hey, no native destructuring support yet */
let options       = _.options;
let argv          = _.argv;


/** Print help and bail if that's what the user wanted */
if(options.help){
	const path = require("path");
	let name   = path.basename(process.argv[1]);
	let help   = `
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
	
	console.log(help);
	process.exit(0);
}

/** Parse our options and normalise their defaults */
let mutilate      = options.m === undefined ? true  : bool(options.m);
let underlineURLs = options.u === undefined ? true  : bool(options.u);
let colourise     = options.c === undefined ? true  : bool(options.c);
let pagedView     = options.p === undefined ? false : bool(options.p);
let indentSize    = options.i === undefined ? 4     : options.indent;
let alphabetise   = options.a === undefined ? false : options.alphabetise;
let indent        = Array(Math.max(1, indentSize) + 1).join(" ");


/** Configure colour palette */
let env               = process.env;
const COLOUR_STRINGS  = "\x1B[38;5;" + (+env.PPJSON_COLOUR_STRINGS || 2) + "m";
const COLOUR_NUMBERS  = "\x1B[38;5;" + (+env.PPJSON_COLOUR_NUMBERS || 2) + "m";
const COLOUR_TRUE     = "\x1B[38;5;" + (+env.PPJSON_COLOUR_TRUE    || 6) + "m";
const COLOUR_FALSE    = "\x1B[38;5;" + (+env.PPJSON_COLOUR_FALSE   || 6) + "m";
const COLOUR_NULL     = "\x1B[38;5;" + (+env.PPJSON_COLOUR_NULL    || 6) + "m";
const COLOUR_PUNCT    = "\x1B[38;5;" + (+env.PPJSON_COLOUR_PUNCT   || 8) + "m";
const COLOUR_ERROR    = "\x1B[38;5;" + (+env.PPJSON_COLOUR_ERROR   || 1) + "m";


let input  = "";
let output = "";

/** An input file was specified on command-line */
if(argv.length){
	
	/** Cycle through each file and prettify their contents */
	for(let i = 0, l = argv.length; i < l; ++i){
		let path = argv[i];
		
		try{ fs.accessSync(path); }
		catch(error){
			/** If there was an access error, hit eject */
			process.stderr.write(COLOUR_ERROR);
			console.error("\x1B[1mERROR\x1B[22m: " + error.message);
			process.stderr.write("\x1B[0m");
			process.exit(2);
		}
		
		/** Otherwise, go for it */
		output += prettifyJSON(fs.readFileSync(path, {encoding: "utf8"}));
		
		/** Make sure there's enough whitespace between files */
		if(i < l - 1) output += "\n\n";
	}
	
	/** Send the compiled result to STDOUT */
	print(output);
}

/** No file specified, just read from STDIN instead */
else{
	process.stdin.setEncoding("utf8");
	process.stdin.on("readable", () => {
		let chunk = process.stdin.read();
		if(chunk !== null)
		input += chunk;
	});
	
	process.stdin.on("end", e => print(prettifyJSON(input)));
}



/**
 * Interpret a string as a boolean value.
 *
 * @param {String} input
 * @return {Boolean}
 */
function bool(input){
	let num = +input;
	
	/** NaN: String was supplied, check for keywords equating to "false" */
	if(num !== num)
		return !/^(?:false|off|no|disabled?|nah)$/i.test(input);
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
function alphabetiseProperties(input, strictCase){
	let stringTag = Object.prototype.toString.call(input);
	
	/** Regular JavaScript object; enumerate properties */
	if("[object Object]" === stringTag){
		let keys = Object.keys(input);
		
		keys = strictCase ? keys.sort() : keys.sort((a, b) => {
			let A = a.toLowerCase();
			let B = b.toLowerCase();
			if(A < B) return -1;
			if(A > B) return 1;
			return 0;
		});
		
		let result = {};
		for(let i of keys)
			result[i] = alphabetiseProperties(input[i]);
		return result;
	}
	
	/** This is an array; make sure the properties of its values are sorted too */
	else if("[object Array]" === stringTag)
		return Array.prototype.map.call(input, e => alphabetiseProperties(e));
	
	/** Just return it untouched */
	return input;
}



/**
 * Spruce up JSON for console display.
 *
 * @param {String}
 * @return {String}
 */
function prettifyJSON(input){
	let output = JSON.parse(input);
	
	/** Order the properties of objects by alphabetical order, not enumeration order */
	if(alphabetise)
		output = alphabetiseProperties(output);
	
	output = JSON.stringify(output, null, indent);
	
	
	/** Unquote property identifiers in object literals */
	if(mutilate){
		let pattern = new RegExp(indent + '"([\\w\\$]+)":', "g");
		output      = output.replace(pattern, indent + "$1:");
	}
	
	
	/** Colourise the output */
	if(colourise){
		const RESET = "\x1B[0m";
		
		output = output
			.replace(/("([^\\"]|\\.)*")/g, COLOUR_STRINGS + "$1" + RESET)  /** Strings  */
			.replace(/(\d+,)$/gm,          COLOUR_NUMBERS + "$1" + RESET)  /** Numerals */
			
			/** Constants */
			.replace(/true(,)?$/gm,        COLOUR_TRUE  + "true"  + RESET + "$1")
			.replace(/false(,)?$/gm,       COLOUR_FALSE + "false" + RESET + "$1")
			.replace(/null(,)?$/gm,        COLOUR_NULL  + "null"  + RESET + "$1")
			
			/** Greyed-out unimportant bits */
			.replace(new RegExp("^((?:"+indent+")*)([\\[\\{\\}\\]],?)", "gm"), "$1"+COLOUR_PUNCT+"$2"+RESET)
			.replace(/((?:\[\]|\{\})?,)$/gm, COLOUR_PUNCT+"$1"+RESET)
			.replace(/(\[|\{)$/gm, COLOUR_PUNCT+"$1"+RESET);
	}
	

	/** Underline URLs */
	if(underlineURLs){
		const UNDERLINE_ON  = "\x1B[4m";
		const UNDERLINE_OFF = "\x1B[24m";
		let rURL = /(\s*(https?:)?\/\/([^:]+:[^@]+@)?([\w-]+)(\.[\w-]+)*(:\d+)?(\/\S+)?\s*(?="))/gm;
		output   = output.replace(rURL, UNDERLINE_ON+"$1"+UNDERLINE_OFF);
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
	
	/** Determine if the output should be piped through to a pager */
	if(pagedView && input.match(/\n/g).length > process.stdout.rows){
		let less  = ChildProcess.spawn("less", ["-Ri"], {
			stdio: ["pipe", process.stdout, process.stderr]
		});
		less.stdin.write(input);
		less.stdin.end();
	}

	else process.stdout.write(input);
}
