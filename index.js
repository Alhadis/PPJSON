#!/usr/bin/env node --es_staging
"use strict";

const getOpts = require("get-options");
const fs      = require("fs");


/** Read CLI args */
let _ = getOpts(process.argv.slice(2), {
	"-?, -h, --help":                       "",
	"-m, --mutilate":                       "<bool>",
	"-u, --underline-urls":                 "<bool>",
	"-i, --indent":                         "<size>",
	"-c, --colour, --colours, --colourise": "<bool>",
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

	  -m, --mutilate <bool>         Unquote property identifiers
	  -u, --underline-urls <bool>   Add underlines to URLs
	  -c, --colour <bool>           Colourise the prettified output
	  -i, --indent <size>           Indentation width, expressed in spaces
	  -a, --alphabetise             Order properties alphabetically

	Run \`man ppjson' for full documentation.
	`.replace(/\t+/g, "    ");
	
	console.log(help);
	process.exit(0);
}

/** Parse our options and normalise their defaults */
let mutilate      = options.m === undefined ? true  : bool(options.m);
let underlineURLs = options.u === undefined ? true  : bool(options.u);
let colourise     = options.c === undefined ? true  : bool(options.c);
let indentSize    = options.i === undefined ? 4     : options.indent;
let alphabetise   = options.a === undefined ? false : options.alphabetise;
let indent        = Array(Math.max(1, indentSize) + 1).join(" ");



let input = "";

/** An input file was specified on command-line */
if(argv.length){
	
	/** Cycle through each file and prettify their contents */
	for(let i = 0, l = argv.length; i < l; ++i){
		let path = argv[i];
		
		try{ fs.accessSync(path); }
		catch(error){
			/** If there was an access error, hit eject */
			process.stderr.write("\x1B[38;5;1m");
			console.error("\x1B[1mERROR\x1B[22m: " + error.message);
			process.stderr.write("\x1B[0m");
			process.exit(2);
		}
		
		/** Otherwise, go for it */
		prettifyJSON(fs.readFileSync(path, {encoding: "utf8"}));
		
		/** Make sure there's enough whitespace between files */
		if(i < l - 1) process.stdout.write("\n\n");
	}
}

/** No file specified, just read from STDIN instead */
else{
	process.stdin.setEncoding("utf8");
	process.stdin.on("readable", () => {
		let chunk = process.stdin.read();
		if(chunk !== null)
		input += chunk;
	});
	
	process.stdin.on("end", e => prettifyJSON(input));
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
		const GREEN = "\x1B[38;5;2m";
		const RESET = "\x1B[0m";
		const GREY  = "\x1B[38;5;8m";
		
		/** Strings */
		output = output.replace(/("([^\\"]|\\.)*")/g, GREEN+"$1"+RESET);
		
		/** Numerals */
		output = output.replace(/(\d+,)$/gm, GREEN+"$1"+RESET);
		
		/** Greyed-out unimportant bits */
		output = output
			.replace(new RegExp("^((?:"+indent+")*)([\\[\\{\\}\\]],?)", "gm"), "$1"+GREY+"$2"+RESET)
			.replace(/((?:\[\]|\{\})?,)$/gm, GREY+"$1"+RESET)
			.replace(/(\[|\{)$/gm, GREY+"$1"+RESET);
	}
	

	/** Underline URLs */
	if(underlineURLs){
		const UNDERLINE_ON  = "\x1B[4m";
		const UNDERLINE_OFF = "\x1B[24m";
		let rURL = /(\s*(https?:)?\/\/([^:]+:[^@]+@)?([\w-]+)(\.[\w-]+)*(:\d+)?(\/\S+)?\s*(?="))/gm;
		output   = output.replace(rURL, UNDERLINE_ON+"$1"+UNDERLINE_OFF);
	}
	
	process.stdout.write(output + "\n");
}
