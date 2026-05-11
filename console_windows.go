//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// enableVT enables ANSI/VT100 escape code processing on Windows 10+.
// Without this, color output appears as raw escape sequences in cmd.exe.
func init() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getStdHandle := kernel32.NewProc("GetStdHandle")
	setConsoleMode := kernel32.NewProc("SetConsoleMode")
	getConsoleMode := kernel32.NewProc("GetConsoleMode")

	const (
		stdOutputHandle                  = ^uintptr(10) // -11
		enableVirtualTerminalProcessing  = 0x0004
	)

	handle, _, _ := getStdHandle.Call(stdOutputHandle)
	if handle == 0 || handle == ^uintptr(0) {
		return
	}

	var mode uint32
	r, _, _ := getConsoleMode.Call(handle, uintptr(unsafe.Pointer(&mode)))
	if r == 0 {
		// Not a real console (e.g. piped output) — disable colors
		disableColors()
		return
	}

	setConsoleMode.Call(handle, uintptr(mode|enableVirtualTerminalProcessing))
}

func disableColors() {
	// Overwrite ANSI constants with empty strings so no escape codes are printed
	// when output is piped or the terminal does not support VT.
	// We reassign the package-level vars declared in color.go.
	Reset = ""
	Bold = ""
	Dim = ""
	Red = ""
	Green = ""
	Yellow = ""
	Blue = ""
	Purple = ""
	Cyan = ""
	White = ""
	BgRed = ""
}
