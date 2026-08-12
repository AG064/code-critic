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

## Usage

1. Paste source code into the editor or choose a source file.
2. Select Quality or Security and adjust the displayed parameters.
3. Select **Analyze quality** for a Quality report. For Security, **Check input** validates and normalizes the request.
4. Review the detected language, line count, file name, and result.

Quality input includes strictness, naming convention, and code organization settings. Security input includes a framework, severity threshold, focus areas, and threat level.

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
- Duplicate Security focus areas are removed while preserving their order.
- Missing analysis settings receive documented defaults.

The normalized result contains `analysis_type`, code content, detected language, line count, file name, analysis parameters, and generation parameters. Defaults are `temperature: 0.3`, `max_tokens: 1500`, and `top_p: 0.9`.

## Quality review

Quality review uses `deepseek-v4-flash` through the DeepSeek chat completions API. The request uses JSON mode, non-thinking mode, `temperature: 0.3`, `max_tokens: 1500`, and `top_p: 0.9`.

The Quality prompt is separate from input normalization. It is zero-shot: the prompt defines the report fields and includes a JSON format example, but it does not include an example code review. This reduces prompt size and avoids copying example findings into a report.

The response must contain a score, summary, findings, and recommendations. Invalid or incomplete responses are rejected.

## Checks

Run the backend test target and verify the complete Docker configuration:

```sh
docker build --target test -t code-critic-backend-test ./backend
docker compose config
docker compose build
```

The backend tests cover language detection, boundary validation, normalization defaults, malformed input, and HTTP error responses.

## Privacy

Code Critic has no accounts, sessions, database, or persistent code storage. Quality review sends the submitted code to the configured DeepSeek API. Normalization does not contact DeepSeek. Responses use `Cache-Control: no-store`.

## Additional features

- Container health checks
- Client-side file size checks
- A 12-second timeout for input checks
- Structured validation error codes
