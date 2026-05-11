package main

import (
        "bufio"
        "bytes"
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "net/url"
        "os"
        "regexp"
        "strings"
        "time"
)

// ─── Client definitions ───────────────────────────────────────────────────────

type ClientInfo struct {
        Name           string
        Key            string
        Version        string
        UserAgent      string
        AndroidVersion int // 0 = sdkless variant — no PoToken required
}

var (
        // AndroidVRClient — Oculus VR YouTube app.
        // This client bypasses YouTube's PoToken/BotGuard requirements.
        AndroidVRClient = ClientInfo{
                Name:    "ANDROID_VR",
                Key:     "",
                Version: "1.65.10",
                UserAgent: "com.google.android.apps.youtube.vr.oculus/1.65.10" +
                        " (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
        }

        // AndroidClient — sdkless variant (androidSDKVersion omitted = no PoToken).
        AndroidClient = ClientInfo{
                Name:      "ANDROID",
                Key:       "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
                Version:   "20.10.38",
                UserAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
        }

        // IOSClient fallback.
        IOSClient = ClientInfo{
                Name:      "IOS",
                Key:       "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                Version:   "19.45.4",
                UserAgent: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
        }

        // EmbeddedClient — last resort.
        EmbeddedClient = ClientInfo{
                Name:      "WEB_EMBEDDED_PLAYER",
                Key:       "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                Version:   "1.19700101",
                UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        }
)

const (
        browserUA    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        playerAPIURL = "https://www.youtube.com/youtubei/v1/player"
        watchBase    = "https://www.youtube.com/watch?v="
)

// ─── Innertube request structures ─────────────────────────────────────────────

type innertubeRequest struct {
        VideoID        string       `json:"videoId,omitempty"`
        Context        innertubeCtx `json:"context"`
        PlaybackCtx    *playbackCtx `json:"playbackContext,omitempty"`
        ContentCheckOK bool         `json:"contentCheckOk,omitempty"`
        RacyCheckOK    bool         `json:"racyCheckOk,omitempty"`
}

type innertubeCtx struct {
        Client innertubeClientCtx `json:"client"`
}

type innertubeClientCtx struct {
        HL            string `json:"hl"`
        GL            string `json:"gl"`
        ClientName    string `json:"clientName"`
        ClientVersion string `json:"clientVersion"`
        AndroidSDKVer int    `json:"androidSDKVersion,omitempty"`
        UserAgent     string `json:"userAgent,omitempty"`
        TimeZone      string `json:"timeZone"`
        UTCOffset     int    `json:"utcOffsetMinutes"`
        DeviceModel   string `json:"deviceModel,omitempty"`
        VisitorData   string `json:"visitorData,omitempty"`
}

type playbackCtx struct {
        ContentPlayback contentPlaybackCtx `json:"contentPlaybackContext"`
}

type contentPlaybackCtx struct {
        HTML5Preference string `json:"html5Preference"`
}

// ─── Response structures ───────────────────────────────────────────────────────

type PlayerResponse struct {
        PlayabilityStatus PlayabilityStatus `json:"playabilityStatus"`
        StreamingData     StreamingData     `json:"streamingData"`
        VideoDetails      VideoDetails      `json:"videoDetails"`
        Microformat       struct {
                PlayerMicroformatRenderer struct {
                        PublishDate string `json:"publishDate"`
                } `json:"playerMicroformatRenderer"`
        } `json:"microformat"`
        Error struct {
                Code    int    `json:"code"`
                Message string `json:"message"`
        } `json:"error"`
}

// VideoExtra holds additional metadata fetched from the watch page.
type VideoExtra struct {
        PublishDate     string // ISO date "2006-01-02" parsed from watch page
        SubscriberCount string // e.g. "466K subscribers"
        CommentCount    string // e.g. "1,234"
}

type PlayabilityStatus struct {
        Status          string `json:"status"`
        Reason          string `json:"reason"`
        PlayableInEmbed bool   `json:"playableInEmbed"`
}

type VideoDetails struct {
        VideoID       string `json:"videoId"`
        Title         string `json:"title"`
        LengthSeconds string `json:"lengthSeconds"`
        Author        string `json:"author"`
        ViewCount     string `json:"viewCount"`
}

type StreamingData struct {
        ExpiresInSeconds string   `json:"expiresInSeconds"`
        Formats          []Format `json:"formats"`
        AdaptiveFormats  []Format `json:"adaptiveFormats"`
}

type Format struct {
        Itag             int    `json:"itag"`
        URL              string `json:"url"`
        SignatureCipher  string `json:"signatureCipher"`
        MimeType         string `json:"mimeType"`
        Bitrate          int    `json:"bitrate"`
        Width            int    `json:"width"`
        Height           int    `json:"height"`
        ContentLength    string `json:"contentLength"`
        Quality          string `json:"quality"`
        QualityLabel     string `json:"qualityLabel"`
        AudioQuality     string `json:"audioQuality"`
        AudioSampleRate  string `json:"audioSampleRate"`
        AudioChannels    int    `json:"audioChannels"`
        ApproxDurationMs string `json:"approxDurationMs"`
        FPS              int    `json:"fps"`
}

func (f *Format) StreamURL() (string, error) {
        if f.URL != "" {
                return f.URL, nil
        }
        if f.SignatureCipher != "" {
                return decodeSignatureCipher(f.SignatureCipher)
        }
        return "", fmt.Errorf("no URL for itag %d", f.Itag)
}

func (f *Format) MimeBase() string {
        if i := strings.Index(f.MimeType, ";"); i != -1 {
                return strings.TrimSpace(f.MimeType[:i])
        }
        return f.MimeType
}

func (f *Format) IsAudio() bool  { return f.Width == 0 && f.Height == 0 && f.AudioQuality != "" }
func (f *Format) IsVideo() bool  { return f.Width > 0 || f.Height > 0 }
func (f *Format) HasAudio() bool { return f.AudioQuality != "" || f.AudioChannels > 0 }

func (f *Format) ContentLengthInt() int64 {
        var n int64
        fmt.Sscan(f.ContentLength, &n)
        return n
}

func (f *Format) Label() string {
        if f.QualityLabel != "" {
                return f.QualityLabel
        }
        return f.Quality
}

func decodeSignatureCipher(cipher string) (string, error) {
        params, err := url.ParseQuery(cipher)
        if err != nil {
                return "", fmt.Errorf("cipher parse: %w", err)
        }
        u := params.Get("url")
        if u == "" {
                return "", fmt.Errorf("no url in signatureCipher")
        }
        return u, nil
}

// ─── Client ───────────────────────────────────────────────────────────────────

type InnertubeClient struct {
        http      *http.Client
        cookies   []*http.Cookie
        visitorID string
        consentID string
        clients   []ClientInfo
}

func newClient(proxyURL, cookieFile string) *InnertubeClient {
        transport := &http.Transport{
                MaxIdleConns:        20,
                IdleConnTimeout:     90 * time.Second,
                TLSHandshakeTimeout: 15 * time.Second,
        }
        if proxyURL != "" {
                if pu, err := url.Parse(proxyURL); err == nil {
                        transport.Proxy = http.ProxyURL(pu)
                }
        }
        hc := &http.Client{
                Timeout:   60 * time.Second,
                Transport: transport,
        }

        c := &InnertubeClient{
                http:    hc,
                clients: []ClientInfo{AndroidVRClient, AndroidClient, IOSClient, EmbeddedClient},
        }

        if cookieFile != "" {
                cookies, err := loadNetscapeCookies(cookieFile)
                if err != nil {
                        warn("Cookie file error: " + err.Error())
                } else {
                        c.cookies = cookies
                        ok(fmt.Sprintf("Loaded %d cookies from %s", len(cookies), cookieFile))
                }
        }

        return c
}

// Bootstrap fetches the YouTube homepage to obtain a real visitor ID
// from the ytcfg.set() block embedded in the page HTML.
func (c *InnertubeClient) Bootstrap() {
        info("Bootstrapping YouTube session\u2026")

        req, err := http.NewRequest("GET", "https://www.youtube.com", nil)
        if err != nil {
                warn("Bootstrap request error: " + err.Error())
                return
        }
        req.Header.Set("User-Agent", browserUA)
        req.Header.Set("Accept-Language", "en-US,en;q=0.9")

        if c.consentID == "" {
                c.consentID = fmt.Sprintf("%d", 100+randInt(900))
        }
        req.AddCookie(&http.Cookie{
                Name:  "CONSENT",
                Value: "YES+cb.20210328-17-p0.en+FX+" + c.consentID,
        })

        resp, err := c.http.Do(req)
        if err != nil {
                warn("Bootstrap failed: " + err.Error())
                return
        }
        defer resp.Body.Close()

        if len(c.cookies) == 0 {
                for _, sc := range resp.Header["Set-Cookie"] {
                        parts := strings.Split(sc, ";")
                        if len(parts) == 0 {
                                continue
                        }
                        kv := strings.SplitN(strings.TrimSpace(parts[0]), "=", 2)
                        if len(kv) == 2 {
                                c.cookies = append(c.cookies, &http.Cookie{Name: kv[0], Value: kv[1]})
                        }
                }
        }

        body, _ := io.ReadAll(resp.Body)
        html := string(body)

        // Parse ytcfg.set({ ... }) block to extract INNERTUBE_CONTEXT.Client.VisitorData
        const sep = "\nytcfg.set("
        if _, after, found := strings.Cut(html, sep); found {
                var cfg struct {
                        InnertubeContext struct {
                                Client struct {
                                        VisitorData string
                                }
                        } `json:"INNERTUBE_CONTEXT"`
                }
                dec := json.NewDecoder(strings.NewReader(after))
                if err := dec.Decode(&cfg); err == nil && cfg.InnertubeContext.Client.VisitorData != "" {
                        c.visitorID, _ = url.PathUnescape(cfg.InnertubeContext.Client.VisitorData)
                }
        }

        if c.visitorID == "" {
                if m := regexp.MustCompile(`"visitorData"\s*:\s*"([^"]{20,})"`).FindStringSubmatch(html); m != nil {
                        c.visitorID, _ = url.PathUnescape(m[1])
                }
        }

        vidTrunc := c.visitorID
        if len(vidTrunc) > 20 {
                vidTrunc = vidTrunc[:20] + "\u2026"
        }
        if c.visitorID == "" {
                vidTrunc = "none"
        }
        info(fmt.Sprintf("Session: %d cookies, x-goog-visitor-id=%s", len(c.cookies), vidTrunc))
}

// GetVideoExtra fetches the watch page and extracts subscriber count and
// comment count via regex over ytInitialData. Never returns an error —
// missing fields are left as empty strings.
func (c *InnertubeClient) GetVideoExtra(videoID string) *VideoExtra {
        ex := &VideoExtra{}

        req, err := http.NewRequest("GET", watchBase+videoID, nil)
        if err != nil {
                return ex
        }
        req.Header.Set("User-Agent", browserUA)
        req.Header.Set("Accept-Language", "en-US,en;q=0.9")
        req.AddCookie(&http.Cookie{
                Name:  "CONSENT",
                Value: "YES+cb.20210328-17-p0.en+FX+" + c.consentID,
        })
        if len(c.cookies) > 0 {
                req.Header.Set("Cookie", req.Header.Get("Cookie")+"; "+cookieHeader(c.cookies))
        }

        resp, err := c.http.Do(req)
        if err != nil {
                return ex
        }
        defer resp.Body.Close()
        body, _ := io.ReadAll(resp.Body)
        html := string(body)

        // Publish date — ISO timestamp embedded in ytInitialData / ytInitialPlayerResponse
        // e.g. "publishDate":"2026-05-08T13:00:34-07:00"
        if m := regexp.MustCompile(`"publishDate"\s*:\s*"(\d{4}-\d{2}-\d{2})`).FindStringSubmatch(html); m != nil {
                ex.PublishDate = m[1]
        }

        // Subscriber count — YouTube embeds it as:
        // "subscriberCountText":{"accessibility":{...},"simpleText":"466K subscribers"}
        // We skip past the nested accessibility block with .{0,300}? then grab simpleText.
        if m := regexp.MustCompile(`"subscriberCountText":.{0,300}?"simpleText"\s*:\s*"([^"]+)"`).FindStringSubmatch(html); m != nil {
                ex.SubscriberCount = m[1]
        }
        // Fallback: runs format  {"runs":[{"text":"466K"},{"text":" subscribers"}]}
        if ex.SubscriberCount == "" {
                if m := regexp.MustCompile(`"subscriberCountText"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"`).FindStringSubmatch(html); m != nil {
                        ex.SubscriberCount = m[1]
                }
        }

        // Comment count — lives in contextualInfo of the comments engagement panel
        if m := regexp.MustCompile(`"contextualInfo"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([0-9,\.KMBTk]+)"`).FindStringSubmatch(html); m != nil {
                ex.CommentCount = m[1]
        }
        // Fallback: headerText "NNN Comments"
        if ex.CommentCount == "" {
                if m := regexp.MustCompile(`"headerText"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([0-9,\.KMBTk]+)\s*[Cc]omments?"`).FindStringSubmatch(html); m != nil {
                        ex.CommentCount = m[1]
                }
        }

        return ex
}

// GetPlayer tries each client in order until one returns valid streams.
func (c *InnertubeClient) GetPlayer(videoID string) (*PlayerResponse, error) {
        var lastErr error
        for _, cl := range c.clients {
                pr, err := c.callPlayer(videoID, cl)
                if err == nil {
                        ok("Client " + cl.Name + " succeeded")
                        return pr, nil
                }
                warn(cl.Name + ": " + err.Error())
                lastErr = err
        }
        return nil, fmt.Errorf("all clients failed — last error: %s\n  \u2192 Run with --cookies cookies.txt (Netscape format from your browser)", lastErr)
}

// callPlayer sends a single Innertube /player request using the given client.
func (c *InnertubeClient) callPlayer(videoID string, cl ClientInfo) (*PlayerResponse, error) {
        info("Trying client: " + cl.Name + "\u2026")

        body := innertubeRequest{
                VideoID:        videoID,
                ContentCheckOK: true,
                RacyCheckOK:    true,
                Context: innertubeCtx{
                        Client: innertubeClientCtx{
                                HL:            "en",
                                GL:            "US",
                                TimeZone:      "UTC",
                                ClientName:    cl.Name,
                                ClientVersion: cl.Version,
                                UserAgent:     cl.UserAgent,
                                // AndroidSDKVersion intentionally omitted (0 = sdkless, no PoToken)
                                // Fresh random protobuf-encoded visitor data per request
                                VisitorData: randomVisitorData("US"),
                        },
                },
                PlaybackCtx: &playbackCtx{
                        ContentPlayback: contentPlaybackCtx{
                                HTML5Preference: "HTML5_PREF_WANTS",
                        },
                },
        }

        data, err := json.Marshal(body)
        if err != nil {
                return nil, err
        }

        apiURL := playerAPIURL + "?prettyPrint=false"
        if cl.Key != "" {
                apiURL = playerAPIURL + "?key=" + cl.Key + "&prettyPrint=false"
        }

        req, err := http.NewRequest("POST", apiURL, bytes.NewReader(data))
        if err != nil {
                return nil, err
        }

        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("User-Agent", cl.UserAgent)
        req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        req.Header.Set("Origin", "https://youtube.com")
        req.Header.Set("Sec-Fetch-Mode", "navigate")
        req.Header.Set("X-Youtube-Client-Name", "3")
        req.Header.Set("X-Youtube-Client-Version", cl.Version)

        if c.visitorID != "" {
                req.Header.Set("x-goog-visitor-id", c.visitorID)
        }

        req.AddCookie(&http.Cookie{
                Name:  "CONSENT",
                Value: "YES+cb.20210328-17-p0.en+FX+" + c.consentID,
        })

        if len(c.cookies) > 0 {
                existing := req.Header.Get("Cookie")
                extra := cookieHeader(c.cookies)
                if existing != "" {
                        req.Header.Set("Cookie", existing+"; "+extra)
                } else {
                        req.Header.Set("Cookie", extra)
                }
        }

        resp, err := c.http.Do(req)
        if err != nil {
                return nil, fmt.Errorf("request failed: %w", err)
        }
        defer resp.Body.Close()

        raw, _ := io.ReadAll(resp.Body)

        var pr PlayerResponse
        if err := json.Unmarshal(raw, &pr); err != nil {
                return nil, fmt.Errorf("JSON decode failed: %.100s", string(raw))
        }

        if pr.Error.Message != "" {
                return nil, fmt.Errorf("%s", pr.Error.Message)
        }

        switch pr.PlayabilityStatus.Status {
        case "OK":
        case "LOGIN_REQUIRED":
                if strings.HasPrefix(pr.PlayabilityStatus.Reason, "This video is private") {
                        return nil, fmt.Errorf("video is private")
                }
                return nil, fmt.Errorf("%s \u2014 %s", pr.PlayabilityStatus.Status, pr.PlayabilityStatus.Reason)
        default:
                reason := pr.PlayabilityStatus.Reason
                if reason == "" {
                        reason = pr.PlayabilityStatus.Status
                }
                if reason == "" {
                        reason = "unknown error"
                }
                return nil, fmt.Errorf("%s", reason)
        }

        if pr.VideoDetails.Title == "" {
                return nil, fmt.Errorf("empty response (bot detected?)")
        }

        total := len(pr.StreamingData.Formats) + len(pr.StreamingData.AdaptiveFormats)
        if total == 0 {
                return nil, fmt.Errorf("no formats in response")
        }

        return &pr, nil
}

// GetPlayerFromPage fetches video info by parsing the watch page HTML.
// Used as fallback when all API clients fail.
func (c *InnertubeClient) GetPlayerFromPage(videoID string) (*PlayerResponse, error) {
        watchURL := watchBase + videoID + "&bpctr=9999999999&has_verified=1"
        req, err := http.NewRequest("GET", watchURL, nil)
        if err != nil {
                return nil, err
        }

        req.Header.Set("User-Agent", browserUA)
        req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        req.Header.Set("Accept-Language", "en-US,en;q=0.9")
        req.AddCookie(&http.Cookie{
                Name:  "CONSENT",
                Value: "YES+cb.20210328-17-p0.en+FX+" + c.consentID,
        })
        if len(c.cookies) > 0 {
                req.Header.Set("Cookie", req.Header.Get("Cookie")+"; "+cookieHeader(c.cookies))
        }

        resp, err := c.http.Do(req)
        if err != nil {
                return nil, fmt.Errorf("watch page request failed: %w", err)
        }
        defer resp.Body.Close()

        raw, _ := io.ReadAll(resp.Body)

        re := regexp.MustCompile(`var ytInitialPlayerResponse\s*=\s*(\{.+?\});`)
        m := re.FindSubmatch(raw)
        if len(m) < 2 {
                return extractPlayerResponseJSON(string(raw))
        }

        var pr PlayerResponse
        if err := json.Unmarshal(m[1], &pr); err != nil {
                return nil, fmt.Errorf("page JSON parse failed: %w", err)
        }

        if pr.PlayabilityStatus.Status != "OK" {
                return nil, fmt.Errorf("page: %s \u2014 %s", pr.PlayabilityStatus.Status, pr.PlayabilityStatus.Reason)
        }
        if pr.VideoDetails.Title == "" {
                return nil, fmt.Errorf("page: no video data (bot detected?)")
        }
        return &pr, nil
}

func extractPlayerResponseJSON(html string) (*PlayerResponse, error) {
        idx := strings.Index(html, "ytInitialPlayerResponse")
        if idx < 0 {
                return nil, fmt.Errorf("ytInitialPlayerResponse not found in page")
        }
        start := strings.Index(html[idx:], "{")
        if start < 0 {
                return nil, fmt.Errorf("no JSON object after ytInitialPlayerResponse")
        }
        start += idx

        var pr PlayerResponse
        dec := json.NewDecoder(strings.NewReader(html[start:]))
        if err := dec.Decode(&pr); err != nil {
                return nil, fmt.Errorf("streaming JSON decode failed: %w", err)
        }

        total := len(pr.StreamingData.Formats) + len(pr.StreamingData.AdaptiveFormats)
        if total == 0 {
                return nil, fmt.Errorf("page: no streaming data (bot detected?)")
        }
        return &pr, nil
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

func cookieHeader(cookies []*http.Cookie) string {
        seen := map[string]bool{}
        var parts []string
        for _, c := range cookies {
                if !seen[c.Name] {
                        parts = append(parts, c.Name+"="+c.Value)
                        seen[c.Name] = true
                }
        }
        return strings.Join(parts, "; ")
}

func loadNetscapeCookies(path string) ([]*http.Cookie, error) {
        f, err := os.Open(path)
        if err != nil {
                return nil, err
        }
        defer f.Close()

        var cookies []*http.Cookie
        scanner := bufio.NewScanner(f)
        for scanner.Scan() {
                line := strings.TrimSpace(scanner.Text())
                if line == "" || strings.HasPrefix(line, "#") {
                        continue
                }
                fields := strings.Split(line, "\t")
                if len(fields) < 7 {
                        continue
                }
                domain := fields[0]
                if !strings.Contains(domain, "youtube") && !strings.Contains(domain, "google") {
                        continue
                }
                cookies = append(cookies, &http.Cookie{Name: fields[5], Value: fields[6]})
        }
        return cookies, scanner.Err()
}

func randInt(n int) int {
        return int(time.Now().UnixNano()) % n
}
