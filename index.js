#!/usr/bin/env node --es_staging
"use strict";

const getOpts = require("get-options");
const fs      = require("fs");


/** Read CLI args */
let _ = getOpts(process.argv.slice(2), {
	"-m, --mutilate":                       "<bool>",
	"-u, --underline-urls":                 "<bool>",
	"-i, -t, --tab, --indent":              "<string|int>",
	"-c, --colour, --colours, --colourise": "<bool>"
});

/** Would've used `let {options, argv} = getOpts`, but hey, no native destructuring support yet */
let options       = _.options;
let argv          = _.argv;

/** Parse our options and normalise their defaults */
let mutilate      = options.m === undefined ? true : bool(options.m);
let underlineURLs = options.u === undefined ? true : bool(options.u);
let colourise     = options.c === undefined ? true : bool(options.c);
let indent        = options.i === undefined ? 4    : options.indent;

/** Indent is a number; treat it as a number of spaces */
if((+indent) == indent)
	indent = Array(Math.max(1, indent)+1).join(" ");



let input = "";

/** An input file was specified on command-line */
if(argv[0]){
	fs.access(argv[0], fs.R_OK, error => {
		
		/** If there was an access error, hit eject */
		if(error){
			process.stderr.write("\x1B[38;5;1m");
			console.error("\x1B[1mERROR\x1B[22m: " + error.message);
			process.stderr.write("\x1B[0m");
			process.exit(2);
		}
		
		
		/** Otherwise, go for it */
		fs.readFile(argv[0], {encoding: "utf8"}, (error, data) => {
			if(error) throw error;
			prettifyJSON(data);
		});
	});
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
 * Spruce up JSON for console display.
 *
 * @param {String}
 */
function prettifyJSON(input){
	let output = JSON.stringify(JSON.parse(input), null, indent);
	
	
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
