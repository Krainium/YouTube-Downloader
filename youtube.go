package main

import (
        "bufio"
        "fmt"
        "os"
        "path/filepath"
        "regexp"
        "sort"
        "strconv"
        "strings"
        "time"
)

// ─── CLI flags ────────────────────────────────────────────────────────────────

type config struct {
        proxy      string
        cookieFile string
        outDir     string
        videoURL   string
}

func parseFlags() config {
        cfg := config{
                proxy:      os.Getenv("YTDL_PROXY"),
                cookieFile: os.Getenv("YTDL_COOKIES"),
        }
        args := os.Args[1:]
        for i := 0; i < len(args); i++ {
                switch args[i] {
                case "--proxy", "-p":
                        if i+1 < len(args) {
                                i++
                                cfg.proxy = args[i]
                        }
                case "--cookies", "-c":
                        if i+1 < len(args) {
                                i++
                                cfg.cookieFile = args[i]
                        }
                case "--out", "-o":
                        if i+1 < len(args) {
                                i++
                                cfg.outDir = args[i]
                        }
                default:
                        if !strings.HasPrefix(args[i], "-") {
                                cfg.videoURL = args[i]
                        }
                }
        }
        return cfg
}

// ─── Entry point ──────────────────────────────────────────────────────────────

func main() {
        cfg := parseFlags()

        printBanner()

        if cfg.proxy != "" {
                info("Proxy  : " + dim(cfg.proxy))
        }
        if cfg.cookieFile != "" {
                info("Cookies: " + dim(cfg.cookieFile))
        }

        client := newClient(cfg.proxy, cfg.cookieFile)
        client.Bootstrap()

        reader := bufio.NewReader(os.Stdin)

        if cfg.videoURL != "" {
                id := extractID(cfg.videoURL)
                if id == "" {
                        fail("Cannot parse video ID from: " + cfg.videoURL)
                        os.Exit(1)
                }
                runDownloadDirect(client, reader, id, cfg.outDir, "video")
                return
        }

        for {
                printMenu()
                choice := readLine(reader)
                switch strings.ToLower(strings.TrimSpace(choice)) {
                case "q", "quit", "exit", "":
                        fmt.Println("\n" + dim("  Goodbye."))
                        os.Exit(0)
                case "1":
                        runDownload(client, reader, cfg.outDir, "video")
                case "2":
                        runDownload(client, reader, cfg.outDir, "audio")
                case "3":
                        runShowFormats(client, reader)
                case "4":
                        runVideoInfo(client, reader)
                default:
                        warn("Unknown option — try 1, 2, 3, 4 or q")
                }
        }
}

// ─── Menu actions ─────────────────────────────────────────────────────────────

func runVideoInfo(client *InnertubeClient, reader *bufio.Reader) {
        videoID := promptVideoID(reader)
        if videoID == "" {
                return
        }
        pr, ex := fetchPlayerWithMeta(client, videoID)
        if pr == nil {
                return
        }
        printVideoDetails(pr, ex)
}

func runShowFormats(client *InnertubeClient, reader *bufio.Reader) {
        videoID := promptVideoID(reader)
        if videoID == "" {
                return
        }
        pr, ex := fetchPlayerWithMeta(client, videoID)
        if pr == nil {
                return
        }
        printVideoDetails(pr, ex)
        printAllFormats(pr)
}

func runDownload(client *InnertubeClient, reader *bufio.Reader, outDir, mode string) {
        videoID := promptVideoID(reader)
        if videoID == "" {
                return
        }
        runDownloadDirect(client, reader, videoID, outDir, mode)
}

func runDownloadDirect(client *InnertubeClient, reader *bufio.Reader, videoID, outDir, mode string) {
        info("Fetching stream info for: " + yellow(videoID))
        pr, ex := fetchPlayerWithMeta(client, videoID)
        if pr == nil {
                return
        }
        printVideoDetails(pr, ex)

        formats, label := selectFormats(pr, mode)
        if len(formats) == 0 {
                fail("No " + label + " formats available")
                return
        }

        // Highest resolution first, then bitrate
        sort.Slice(formats, func(i, j int) bool {
                if formats[i].Height != formats[j].Height {
                        return formats[i].Height > formats[j].Height
                }
                return formats[i].Bitrate > formats[j].Bitrate
        })

        printFormatMenu(formats, label)

        fmt.Print(yellow("  Pick format number (or Enter to cancel): "))
        pick := readLine(reader)
        if strings.ToLower(pick) == "q" || pick == "" {
                return
        }

        idx, err := strconv.Atoi(strings.TrimSpace(pick))
        if err != nil || idx < 1 || idx > len(formats) {
                fail("Invalid selection")
                return
        }

        chosen := formats[idx-1]
        streamURL, err := chosen.StreamURL()
        if err != nil || streamURL == "" {
                errMsg := "empty"
                if err != nil {
                        errMsg = err.Error()
                }
                fail("Cannot resolve stream URL: " + errMsg)
                return
        }

        ext := mimeToExt(chosen.MimeBase())
        outName := sanitize(pr.VideoDetails.Title) + "_" + chosen.Label() + "." + ext

        if outDir == "" {
                if mode == "audio" {
                        outDir = "downloaded audios"
                } else {
                        outDir = "downloaded videos"
                }
        }

        if err := os.MkdirAll(outDir, 0755); err != nil {
                fail("Cannot create directory: " + err.Error())
                return
        }
        outPath := filepath.Join(outDir, outName)

        fmt.Println()
        label2("Output ", outPath)
        label2("Format ", chosen.Label()+" — "+chosen.MimeType)
        if cl := chosen.ContentLengthInt(); cl > 0 {
                label2("Size   ", humanSize(cl))
        }
        fmt.Println()
        info("Starting download\u2026")

        if err := download(client.http, streamURL, outPath, chosen.ContentLengthInt()); err != nil {
                fail("Download failed: " + err.Error())
                os.Remove(outPath)
                return
        }

        ok("Saved: " + bold(outPath))
}

// fetchPlayer tries all API clients in order, then falls back to the watch page.
func fetchPlayer(client *InnertubeClient, videoID string) (*PlayerResponse, error) {
        pr, err := client.GetPlayer(videoID)
        if err != nil {
                warn("API: " + err.Error())
                info("Falling back to watch page extraction\u2026")
                pr, err = client.GetPlayerFromPage(videoID)
                if err != nil {
                        return nil, fmt.Errorf("all methods failed: %s", err.Error())
                }
                ok("Watch page extraction succeeded")
        }
        return pr, nil
}

// fetchPlayerWithMeta fetches the player response and extra metadata concurrently.
func fetchPlayerWithMeta(client *InnertubeClient, videoID string) (*PlayerResponse, *VideoExtra) {
        type playerResult struct {
                pr  *PlayerResponse
                err error
        }
        pCh := make(chan playerResult, 1)
        exCh := make(chan *VideoExtra, 1)

        go func() {
                pr, err := fetchPlayer(client, videoID)
                pCh <- playerResult{pr, err}
        }()
        go func() {
                exCh <- client.GetVideoExtra(videoID)
        }()

        res := <-pCh
        if res.err != nil {
                fail(res.err.Error())
                <-exCh
                return nil, nil
        }
        ex := <-exCh
        return res.pr, ex
}

// selectFormats returns the full set of formats for the chosen mode.
//
// "video" → all muxed formats (video+audio) PLUS all adaptive video-only
//
//      formats so the user sees the complete quality range.
//
// "audio" → all adaptive audio-only formats.
func selectFormats(pr *PlayerResponse, mode string) ([]Format, string) {
        switch mode {
        case "audio":
                var out []Format
                for _, f := range pr.StreamingData.AdaptiveFormats {
                        if f.IsAudio() {
                                out = append(out, f)
                        }
                }
                return out, "audio-only"
        default:
                // Muxed (video+audio in one file)
                out := append([]Format{}, pr.StreamingData.Formats...)
                // Adaptive video tracks (higher resolutions, video-only stream)
                for _, f := range pr.StreamingData.AdaptiveFormats {
                        if f.IsVideo() {
                                out = append(out, f)
                        }
                }
                return out, "video"
        }
}

// ─── Display ──────────────────────────────────────────────────────────────────

func printVideoDetails(pr *PlayerResponse, ex *VideoExtra) {
        v := pr.VideoDetails
        fmt.Println()
        printDivider()
        label2("Title   ", v.Title)
        label2("Author  ", v.Author)
        label2("Length  ", humanSeconds(v.LengthSeconds))
        if v.ViewCount != "" {
                label2("Views   ", commaSep(v.ViewCount))
        }

        // Days since release — prefer watch-page date (ex), fall back to microformat
        pub := ""
        if ex != nil && ex.PublishDate != "" {
                pub = ex.PublishDate
        }
        if pub == "" {
                raw := pr.Microformat.PlayerMicroformatRenderer.PublishDate
                if len(raw) >= 10 {
                        pub = raw[:10]
                }
        }
        if pub != "" {
                if t, err := time.Parse("2006-01-02", pub); err == nil {
                        days := int(time.Since(t).Hours() / 24)
                        label2("Released", fmt.Sprintf("%s  (%d days ago)", pub, days))
                }
        }

        if ex != nil {
                if ex.SubscriberCount != "" {
                        label2("Subs    ", ex.SubscriberCount)
                }
                if ex.CommentCount != "" {
                        label2("Comments", ex.CommentCount)
                }
        }
        printDivider()
}

func printFormatMenu(formats []Format, label string) {
        fmt.Println()
        fmt.Println(bold(yellow("  FORMATS — " + strings.ToUpper(label))))
        printDivider()
        for i, f := range formats {
                _, ferr := f.StreamURL()
                avail := green("\u2714")
                if ferr != nil {
                        avail = red("\u2718")
                }

                // Tag showing what kind of stream this is
                kind := dim("[muxed]  ")
                switch {
                case f.IsAudio():
                        kind = cyan("[audio]  ")
                case !f.HasAudio():
                        kind = yellow("[video]  ")
                }

                size := ""
                if cl := f.ContentLengthInt(); cl > 0 {
                        size = dim("  ~" + humanSize(cl))
                }
                fps := ""
                if f.FPS > 0 {
                        fps = dim(fmt.Sprintf(" %dfps", f.FPS))
                }
                codec := ""
                if idx := strings.Index(f.MimeType, "codecs="); idx != -1 {
                        c := strings.Trim(f.MimeType[idx+7:], `"`)
                        codec = dim("  [" + c + "]")
                }
                fmt.Printf("  %s %s  %s%-8s  %-14s%s%s%s\n",
                        cyan(fmt.Sprintf("[%2d]", i+1)), avail,
                        kind,
                        yellow(f.Label()), white(f.MimeBase()),
                        fps, codec, size)
        }
        printDivider()
}

func printAllFormats(pr *PlayerResponse) {
        all := append(pr.StreamingData.Formats, pr.StreamingData.AdaptiveFormats...)
        fmt.Println()
        fmt.Println(bold(yellow("  ALL FORMATS")))
        printDivider()
        fmt.Printf("  %-6s %-10s %-6s %-14s %-10s %s\n",
                cyan("ITAG"), cyan("QUALITY"), cyan("FPS"), cyan("MIME"), cyan("SIZE"), cyan("TYPE"))
        printDivider()
        for _, f := range all {
                kind := "muxed"
                switch {
                case f.IsAudio():
                        kind = green("audio")
                case !f.HasAudio():
                        kind = yellow("video")
                }
                size := "-"
                if cl := f.ContentLengthInt(); cl > 0 {
                        size = humanSize(cl)
                }
                fps := "-"
                if f.FPS > 0 {
                        fps = fmt.Sprintf("%d", f.FPS)
                }
                fmt.Printf("  %-6d %-10s %-6s %-14s %-10s %s\n",
                        f.Itag, f.Label(), fps, f.MimeBase(), size, kind)
        }
        printDivider()
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

func promptVideoID(reader *bufio.Reader) string {
        fmt.Println()
        fmt.Print(yellow("  YouTube URL or video ID: "))
        raw := strings.TrimSpace(readLine(reader))
        if raw == "" || strings.ToLower(raw) == "q" {
                return ""
        }
        id := extractID(raw)
        if id == "" {
                fail("Cannot parse video ID from: " + raw)
                return ""
        }
        return id
}

func readLine(reader *bufio.Reader) string {
        line, _ := reader.ReadString('\n')
        return strings.TrimRight(line, "\r\n")
}

// ─── Utilities ────────────────────────────────────────────────────────────────

var ytIDRegex = regexp.MustCompile(
        `(?:v=|youtu\.be/|embed/|shorts/|live/|watch\?.*?v=)([a-zA-Z0-9_-]{11})`)

func extractID(input string) string {
        if m := ytIDRegex.FindStringSubmatch(input); m != nil {
                return m[1]
        }
        if regexp.MustCompile(`^[a-zA-Z0-9_-]{11}$`).MatchString(input) {
                return input
        }
        return ""
}

func sanitize(s string) string {
        re := regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)
        s = re.ReplaceAllString(s, "_")
        s = strings.TrimSpace(s)
        if len(s) > 80 {
                s = s[:80]
        }
        return s
}

func mimeToExt(mime string) string {
        switch mime {
        case "video/mp4":
                return "mp4"
        case "video/webm":
                return "webm"
        case "audio/mp4":
                return "m4a"
        case "audio/webm":
                return "webm"
        default:
                return "bin"
        }
}

func commaSep(s string) string {
        n, err := strconv.ParseInt(s, 10, 64)
        if err != nil {
                return s
        }
        str := fmt.Sprintf("%d", n)
        result := ""
        for i, c := range str {
                if i > 0 && (len(str)-i)%3 == 0 {
                        result += ","
                }
                result += string(c)
        }
        return result
}

func label2(k, v string) { fmt.Printf("  %s %s\n", cyan(k+":"), white(v)) }
