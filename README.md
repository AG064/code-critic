# Code Critic

Code Critic validates 100 to 500 lines of pasted or uploaded source code for Quality or Security review.

The application supports C, C++, C#, CSS, Go, HTML, Java, JavaScript, Kotlin, PHP, Python, Ruby, Rust, shell scripts, SQL, Swift, and TypeScript.

## Setup

Docker is the only required dependency.

1. Copy `.env.example` to `.env`.
2. Add `DEEPSEEK_API_KEY` to the local `.env` file. Do not commit the key.
3. Build and start the application:

   ```sh
   docker compose up --build
   ```

4. Open `http://localhost:27350`.

The health endpoint is available at `http://localhost:27351/health`.
Compose mounts the ignored local `.env` file into the backend as a read-only secret. The backend reads only `DEEPSEEK_API_KEY`, and the key is not placed in the container environment.

## Usage

1. Paste source code into the editor or choose a source file.
2. Select Quality or Security and adjust the displayed parameters.
3. Select **Analyze quality** or **Analyze security**.
4. Review the detected language, line count, file name, and result.
5. Edit the report if needed, then export it as plain text, Markdown, or HTML.

Quality input includes strictness, naming convention, and code organization settings. Security input includes a framework, severity threshold, vulnerability categories, and threat level.

## Input validation

The backend rejects:

- missing or blank code
- code outside the 100 to 500 line range
- input over 200,000 characters
- unsupported analysis types or languages
- invalid file names, parameters, or generation settings
- binary content containing null bytes

Uploaded request bodies are also limited to 600 KB. Validation errors identify the invalid field without returning stack traces or internal details.

## Normalization

Normalization makes equivalent input produce the same request structure:

- Windows and old Mac line endings are converted to `LF`.
- A leading byte order mark is removed.
- A final line terminator does not count as an extra line.
- Directory segments are removed from the supplied file name.
- A supported file extension is used for language detection when present. Otherwise, detection uses language-specific code patterns.
- Duplicate vulnerability categories are removed while preserving their order.
- Code is classified as standard or complex using its line count and control-flow signals.
- Missing analysis and generation settings receive documented defaults.

The normalized result contains `analysis_type`, code content, detected language, line count, file name, an analysis profile, analysis parameters, and generation parameters. The profile is complex when input exceeds 300 lines or contains at least 20 branch and control-flow signals outside comments and strings. With default settings, the same input receives the same profile.

## Review prompts

Quality and Security reviews use `deepseek-v4-flash` through the DeepSeek chat completions API. Requests use JSON mode and non-thinking mode. Default generation settings are:

| Analysis | Input | Temperature | Max tokens | Top-p |
| --- | --- | ---: | ---: | ---: |
| Quality | Standard | 0.3 | 1500 | 0.9 |
| Quality | Complex | 0.25 | 1900 | 0.9 |
| Security | Standard | 0.2 | 1700 | 0.85 |
| Security | Complex | 0.15 | 2200 | 0.85 |

Quality and Security have separate prompt templates and report schemas so Quality metrics do not mix with Security risk fields. Both are zero-shot: each prompt defines its report fields and includes a JSON format example, but neither includes an example code review. This reduces prompt size and avoids copying example findings into a report.

The configured model supports the required JSON request format and completed live checks within the 60-second target. Lower temperatures improve repeatability; higher values can add variety but make reports less consistent. Security therefore uses the lower setting. Complex input receives a larger response budget, while the maximum remains bounded. Top-p stays below 1 to keep reports focused.

Quality output contains an overall score, readability score, complexity score and level, findings, best-practice violations, and recommendations. A higher complexity score means more complex code: 0 to 33 is low, 34 to 66 is medium, and 67 to 100 is high. Security output contains a risk assessment, vulnerabilities, severity levels, and mitigations. Invalid or incomplete responses are rejected.

## Report handling

The backend removes response wrappers and leading model prefaces, normalizes spacing, closes unmatched code fences, aligns Markdown tables, and preserves code references and multiline examples. Every required report section and metric is validated before the result is returned.

If the first response is incomplete or does not match its report schema, the backend makes one corrective request. It does not retry configuration, authentication, rate limit, timeout, or service availability errors. The two request time budgets keep this bounded path below the client timeout.

The editable report exists only in browser memory. Markdown contains the current editor text. Plain text removes Markdown markers while keeping the report content. HTML safely escapes the editor text, highlights recognized tokens in fenced code, and uses native expandable sections. It contains no scripts or external resources.

## Checks

Run the backend test target and verify the complete Docker configuration:

```sh
docker build --target test -t code-critic-backend-test ./backend
docker build --target test -t code-critic-frontend-test ./frontend
docker compose config --quiet
docker compose build
```

The backend tests cover language detection, boundary validation, complexity-aware defaults, malformed input, report metrics, post-processing, bounded repair, provider configuration, and HTTP error responses. Frontend tests cover pasted and uploaded source checks, API response validation, report serialization, and safe export content.

## Privacy

Code Critic has no accounts, sessions, database, or persistent code storage. Reviews send the submitted code to the configured DeepSeek API. Normalization does not contact DeepSeek. Responses use `Cache-Control: no-store`.

## Additional features

- Container health checks
- Client-side file size checks
- Structured validation error codes
