package main

import (
        "fmt"
        "io"
        "net/http"
        "os"
        "strings"
        "time"
)

// ─── Download ────────────────────────────────────────────────────────────────

func download(client *http.Client, streamURL, outPath string, contentLength int64) error {
        req, err := http.NewRequest("GET", streamURL, nil)
        if err != nil {
                return err
        }
        req.Header.Set("User-Agent", AndroidVRClient.UserAgent)
        req.Header.Set("Referer", "https://www.youtube.com/")
        req.Header.Set("Accept", "*/*")
        req.Header.Set("Accept-Encoding", "identity")

        resp, err := client.Do(req)
        if err != nil {
                return fmt.Errorf("stream request failed: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != 200 && resp.StatusCode != 206 {
                return fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
        }

        // Use Content-Length from response if we don't have it
        if contentLength <= 0 {
                contentLength = resp.ContentLength
        }

        f, err := os.Create(outPath)
        if err != nil {
                return fmt.Errorf("cannot create file: %w", err)
        }
        defer f.Close()

        pr := &progressWriter{
                total: contentLength,
                start: time.Now(),
        }
        _, err = io.Copy(io.MultiWriter(f, pr), resp.Body)
        if err != nil {
                return fmt.Errorf("write error: %w", err)
        }
        pr.finish()
        return nil
}

// ─── Progress display ────────────────────────────────────────────────────────

type progressWriter struct {
        written int64
        total   int64
        start   time.Time
        lastLen int
}

func (pw *progressWriter) Write(p []byte) (int, error) {
        n := len(p)
        pw.written += int64(n)
        pw.render()
        return n, nil
}

func (pw *progressWriter) render() {
        pct := 0.0
        bar := strings.Repeat("░", 30)

        if pw.total > 0 {
                pct = float64(pw.written) / float64(pw.total) * 100
                filled := int(pct / 100 * 30)
                if filled > 30 {
                        filled = 30
                }
                bar = Green + strings.Repeat("█", filled) + Dim + strings.Repeat("░", 30-filled) + Reset
        }

        elapsed := time.Since(pw.start).Seconds()
        speed := ""
        if elapsed > 0 {
                bps := float64(pw.written) / elapsed
                speed = " @ " + humanSpeed(bps)
        }

        eta := ""
        if pw.total > 0 && pw.written > 0 {
                remaining := float64(pw.total-pw.written) / (float64(pw.written) / time.Since(pw.start).Seconds())
                eta = " ETA " + humanDuration(time.Duration(remaining * float64(time.Second)))
        }

        var line string
        if pw.total > 0 {
                line = fmt.Sprintf("  [%s] %s%.1f%%%s  %s / %s%s%s",
                        bar,
                        Yellow, pct, Reset,
                        cyan(humanSize(pw.written)),
                        cyan(humanSize(pw.total)),
                        dim(speed),
                        dim(eta),
                )
        } else {
                line = fmt.Sprintf("  [%s]  %s downloaded%s",
                        bar,
                        cyan(humanSize(pw.written)),
                        dim(speed),
                )
        }

        // Pad to clear previous line
        if len(line) < pw.lastLen {
                line += strings.Repeat(" ", pw.lastLen-len(line))
        }
        pw.lastLen = len(line)
        fmt.Printf("\r%s", line)
}

func (pw *progressWriter) finish() {
        elapsed := time.Since(pw.start)
        fmt.Printf("\r%s\n", strings.Repeat(" ", pw.lastLen+2))
        fmt.Printf("  %s  %s in %s\n",
                green("✔ Done"),
                cyan(humanSize(pw.written)),
                yellow(humanDuration(elapsed)),
        )
}

// ─── Human-readable helpers ──────────────────────────────────────────────────

func humanSize(b int64) string {
        const unit = 1024
        if b < unit {
                return fmt.Sprintf("%d B", b)
        }
        div, exp := int64(unit), 0
        for n := b / unit; n >= unit; n /= unit {
                div *= unit
                exp++
        }
        return fmt.Sprintf("%.2f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func humanSpeed(bps float64) string {
        return humanSize(int64(bps)) + "/s"
}

func humanDuration(d time.Duration) string {
        d = d.Round(time.Second)
        h := d / time.Hour
        d -= h * time.Hour
        m := d / time.Minute
        d -= m * time.Minute
        s := d / time.Second
        if h > 0 {
                return fmt.Sprintf("%dh%02dm%02ds", h, m, s)
        }
        if m > 0 {
                return fmt.Sprintf("%dm%02ds", m, s)
        }
        return fmt.Sprintf("%ds", s)
}

func humanSeconds(secs string) string {
        var total int
        fmt.Sscan(secs, &total)
        h := total / 3600
        m := (total % 3600) / 60
        s := total % 60
        if h > 0 {
                return fmt.Sprintf("%d:%02d:%02d", h, m, s)
        }
        return fmt.Sprintf("%d:%02d", m, s)
}
