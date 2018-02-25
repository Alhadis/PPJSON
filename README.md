PPJSON
=======

Small command-line utility to pretty-print JSON files. Colour included.

![Screenshot](preview.png)


Installation
------------

	npm -g install ppjson

Usage
-----

JSON data can be supplied from a file, or piped through standard input:

	ppjson < json.file
	ppjson json.file
	node spit-json-to-stdout.js | ppjson

Run `man ppjson` to access everything you're reading here.

Options
-------

	-a, --alphabetise               Order properties alphabetically
	-c, --colour           [bool]   Colourise the prettified output
	-i, --indent           [size=4] Indentation width, expressed in spaces
	-m, --mutilate         [bool]   Unquote property identifiers
	-p, --paged            [bool]   Show content in pager if longer than screen
	-t, --tabs                      Use tabs to indent output instead of spaces
	-u, --underline-urls   [bool]   Add underlines to URLs
	-v, --version                   Print the program's version string and exit
	-w, --write                     Write prettified data back to files


The `[bool]` options above are all enabled by default.
You can disable them by passing `0`, `"false"`, `"no"` or `"off"` as values (their capitalisation doesn't matter):

	# All these lines are equivalent
	ppjson --mutilate=no
	ppjson --mutilate OFF
	ppjson --mutilate 0
	ppjson  -m0
	ppjson --mutilate false

Option order is inconsequential: it doesn't matter if they're listed before or after a filename:

	# Same damn thing:
	ppjson -m0 file.json
	ppjson file.json -m0


Examples
--------

Use 2 spaces for indentation instead of 4:

	ppjson --indent=2 file.json

Disable colours:

	ppjson -c0 < file.json

Don't remove quote marks from property names:

	ppjson -m false file.json
	ppjson --mutilate nah < file.json

Yes, I really did include `"nah"` as a possible synonym for a false boolean value. Try it.


Customising colours
-------------------

If you'd like to change the colours, you can do so with environment variables.
Drop the following into your `.bash_profile` or shell equivalent:

~~~shell
export PPJSON_COLOURS='s=38;5;2:n=38;5;2:t=38;5;6:f=38;5;6:n=38;5;6:p=38;5;8:e=38;5;1;u='

# Older format which uses colour indexes
export PPJSON_COLOUR_STRINGS=2
export PPJSON_COLOUR_NUMBERS=2
export PPJSON_COLOUR_TRUE=6
export PPJSON_COLOUR_FALSE=6
export PPJSON_COLOUR_NULL=6
export PPJSON_COLOUR_PUNCT=8
export PPJSON_COLOUR_ERROR=1
~~~

Default values are depicted above.
The syntax of `PPJSON_COLOURS` is similar to  [`GREP_COLORS`](https://www.gnu.org/software/grep/manual/html_node/Environment-Variables.html).
Each single-letter field corresponds to a different part of the output that can be styled:

~~~shell
s  # Strings
n  # Numbers
t  # True
f  # False
n  # Null
p  # Punctuation (colons and brackets)
e  # Error highlighting
u  # Unquoted property keys
~~~
