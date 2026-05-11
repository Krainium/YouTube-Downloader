package main

import "fmt"

func printBanner() {
	fmt.Println()
	fmt.Println(Red + Bold + `  ██╗   ██╗ ██████╗ ██╗   ██╗████████╗██╗   ██╗██████╗ ███████╗` + Reset)
	fmt.Println(Red + Bold + `  ╚██╗ ██╔╝██╔═══██╗██║   ██║╚══██╔══╝██║   ██║██╔══██╗██╔════╝` + Reset)
	fmt.Println(Red + Bold + `   ╚████╔╝ ██║   ██║██║   ██║   ██║   ██║   ██║██████╔╝█████╗  ` + Reset)
	fmt.Println(Red + Bold + `    ╚██╔╝  ██║   ██║██║   ██║   ██║   ██║   ██║██╔══██╗██╔══╝  ` + Reset)
	fmt.Println(Red + Bold + `     ██║   ╚██████╔╝╚██████╔╝   ██║   ╚██████╔╝██████╔╝███████╗` + Reset)
	fmt.Println(Red + Bold + `     ╚═╝    ╚═════╝  ╚═════╝    ╚═╝    ╚═════╝ ╚═════╝ ╚══════╝` + Reset)
	fmt.Println()
	fmt.Println(Yellow + Bold + `  ██████╗  ██████╗ ██╗    ██╗███╗  ██╗██╗      ██████╗  █████╗ ██████╗ ███████╗██████╗ ` + Reset)
	fmt.Println(Yellow + Bold + `  ██╔══██╗██╔═══██╗██║    ██║████╗ ██║██║     ██╔═══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗` + Reset)
	fmt.Println(Yellow + Bold + `  ██║  ██║██║   ██║██║ █╗ ██║██╔██╗██║██║     ██║   ██║███████║██║  ██║█████╗  ██████╔╝` + Reset)
	fmt.Println(Yellow + Bold + `  ██║  ██║██║   ██║██║███╗██║██║╚████║██║     ██║   ██║██╔══██║██║  ██║██╔══╝  ██╔══██╗` + Reset)
	fmt.Println(Yellow + Bold + `  ██████╔╝╚██████╔╝╚███╔███╔╝██║ ╚███║███████╗╚██████╔╝██║  ██║██████╔╝███████╗██║  ██║` + Reset)
	fmt.Println(Yellow + Bold + `  ╚═════╝  ╚═════╝  ╚══╝╚══╝ ╚═╝  ╚══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝` + Reset)
	fmt.Println()
	fmt.Println(Dim + `                                    By Krainium` + Reset)
	fmt.Println()
}

func printDivider() {
	fmt.Println(dim("  ─────────────────────────────────────────"))
}

func printMenu() {
	fmt.Println()
	fmt.Println(bold(yellow("  MAIN MENU")))
	printDivider()
	fmt.Println(cyan("  [1]") + " Download video (MP4)")
	fmt.Println(cyan("  [2]") + " Download audio only (M4A)")
	fmt.Println(cyan("  [3]") + " Show all formats")
	fmt.Println(cyan("  [4]") + " Video info only")
	fmt.Println(cyan("  [q]") + " Quit")
	printDivider()
	fmt.Print(yellow("  Pick an option: "))
}
