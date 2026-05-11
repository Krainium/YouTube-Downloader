# youtube

  > Download any YouTube video or audio directly from the terminal — no API key, no dependencies.

  Hits YouTube's internal Innertube API the same way the official apps do. Pulls every available format, resolution, and codec. Works on Linux, macOS, and Windows.

  ## What it does

  - Fetches all stream URLs straight from YouTube (MP4, WebM, M4A — every resolution from 144p to 4K)
  - Shows video metadata: title, author, length, views, release date, subscriber count, comment count
  - Saves videos to `downloaded videos/` and audio to `downloaded audios/` automatically
  - Interactive menu + non-interactive one-liner mode
  - Works behind proxies and with browser cookies for age-gated content

  ## Run it

  ```bash
  # Linux / macOS
  go run .

  # Windows
  build.bat

  # Non-interactive (downloads best video)
  go run . https://www.youtube.com/watch?v=VIDEO_ID
  ```

  ## Options

  | Flag | Description |
  |---|---|
  | `-o <dir>` | Custom output directory |
  | `--cookies <file>` | Netscape cookies.txt for private/age-gated videos |
  | `--proxy <url>` | HTTP/SOCKS5 proxy URL |

  ## Build binaries

  ```bash
  # Linux
  CGO_ENABLED=0 go build -o ytdl .

  # Windows (cross-compile from Linux/macOS)
  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ytdl.exe .
  ```

  > Go 1.22+ required. Zero external dependencies.
  