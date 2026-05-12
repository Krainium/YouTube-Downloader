#!/usr/bin/env python3
"""
generate_cookies.py
===================
Extracts the cookie string from a Chrome DevTools request-headers export
and writes it to cookies.txt (the format expected by the ytdl-web server).

HOW TO GET THE INPUT FILE
--------------------------
1. Open YouTube in Chrome and log in.
2. Press F12 → Network tab.
3. Reload the page, click any request to www.youtube.com.
4. In the "Headers" panel, scroll to "Request Headers".
5. Right-click the panel → "Copy request headers"  OR  click the raw-text
   icon if your DevTools version shows one.
6. Paste into a plain .txt file and save it.
7. Run:  python generate_cookies.py your_headers.txt

The file has alternating lines — header name then header value:
    cookie
    name1=val1; name2=val2; ...
    content-type
    application/json
    ...

USAGE
-----
    python generate_cookies.py <headers.txt> [output cookies.txt]

    Default output: cookies.txt (in the current directory / web root).
"""

import sys
import os
import re


def extract_cookies(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        lines = [l.rstrip("\n") for l in f]

    # ── Strategy 1: alternating name / value lines (Chrome DevTools default)
    # Header names are lowercase single words or colon-prefixed pseudo-headers.
    for i, line in enumerate(lines):
        if line.strip().lower() == "cookie" and i + 1 < len(lines):
            candidate = lines[i + 1].strip()
            # A cookie line contains at least one key=value pair
            if "=" in candidate and not candidate.startswith("http"):
                return candidate

    # ── Strategy 2: "Cookie: value" single-line format
    for line in lines:
        m = re.match(r"^[Cc]ookie:\s*(.+)$", line)
        if m:
            return m.group(1).strip()

    # ── Strategy 3: the whole file is just a cookie string
    combined = " ".join(lines).strip()
    if combined.startswith("__Secure") or (
        "=" in combined and ";" in combined and "youtube" not in combined[:30]
    ):
        return combined

    raise ValueError(
        "Could not find a 'cookie' header in the file.\n"
        "Make sure you copied the *request* headers (not response headers) "
        "and that you are logged in to YouTube."
    )


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "cookies.txt"
    )

    if not os.path.exists(input_path):
        print(f"Error: file not found: {input_path}")
        sys.exit(1)

    try:
        cookie_string = extract_cookies(input_path)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(cookie_string + "\n")

    count = sum(1 for part in cookie_string.split(";") if "=" in part.strip())
    print(f"Done — {count} cookies written to: {output_path}")


if __name__ == "__main__":
    main()
