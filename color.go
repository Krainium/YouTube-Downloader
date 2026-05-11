package main

import "fmt"

// ANSI color codes — declared as vars so console_windows.go can zero them
// when VT mode is unavailable (piped output, legacy terminal).
var (
	Reset  = "\033[0m"
	Bold   = "\033[1m"
	Dim    = "\033[2m"
	Red    = "\033[31m"
	Green  = "\033[32m"
	Yellow = "\033[33m"
	Blue   = "\033[34m"
	Purple = "\033[35m"
	Cyan   = "\033[36m"
	White  = "\033[97m"
	BgRed  = "\033[41m"
)

func red(s string) string    { return Red + s + Reset }
func green(s string) string  { return Green + s + Reset }
func yellow(s string) string { return Yellow + s + Reset }
func cyan(s string) string   { return Cyan + s + Reset }
func white(s string) string  { return White + s + Reset }
func bold(s string) string   { return Bold + s + Reset }
func dim(s string) string    { return Dim + s + Reset }

func info(msg string)           { fmt.Println(cyan("  \u2139 ") + msg) }
func ok(msg string)             { fmt.Println(green("  \u2714 ") + msg) }
func warn(msg string)           { fmt.Println(yellow("  \u26a0 ") + msg) }
func fail(msg string)           { fmt.Println(red("  \u2718 ") + msg) }
func label(k, v string)         { fmt.Printf("  %s %s\n", cyan(k+":"), white(v)) }
